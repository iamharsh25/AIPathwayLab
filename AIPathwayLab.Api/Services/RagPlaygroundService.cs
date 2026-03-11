using System.Collections.Concurrent;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Embeddings;
using Microsoft.SemanticKernel.ChatCompletion;

namespace AIPathwayLab.Api.Services;

// ── DTOs returned to the frontend ─────────────────────────────────────────────

public record PlaygroundChunk(int Id, string Text);

public record EmbedPreview(
    int     ChunkId,
    string  ChunkPreview,   // first 60 chars of the chunk
    float[] FirstDims,      // first 6 dimensions of the 1536-dim vector
    int     TotalDims       // always 1536
);

public record ScoredChunk(int ChunkId, string Text, float Score);

public record AskResult(
    float[]           QuestionEmbedding, // first 6 dims of the question vector
    List<ScoredChunk> AllScores,         // every chunk with its cosine similarity
    List<ScoredChunk> TopK,             // top-K from vector search
    List<string>      Reranked,         // LLM-reranked final context
    string            Answer            // GPT-4o answer from reranked context
);

// ── Session stored in memory per upload ──────────────────────────────────────

internal class PlaygroundSession
{
    public List<string>                 Chunks     { get; set; } = [];
    public List<ReadOnlyMemory<float>>  Embeddings { get; set; } = [];
    public bool                         IsEmbedded { get; set; }
}

// ── Service ───────────────────────────────────────────────────────────────────

public class RagPlaygroundService
{
    private readonly Kernel          _kernel;
    private readonly ChunkingService _chunker;
    private readonly RerankerService _reranker;

    // One session per upload — keyed by random session ID
    private readonly ConcurrentDictionary<string, PlaygroundSession> _sessions = new();

    public RagPlaygroundService(Kernel kernel, ChunkingService chunker, RerankerService reranker)
    {
        _kernel   = kernel;
        _chunker  = chunker;
        _reranker = reranker;
    }

    // ── Step 1: Chunk ─────────────────────────────────────────────────────────
    // Splits the document into overlapping chunks and stores the session.

    public (string SessionId, List<PlaygroundChunk> Chunks) ChunkDocument(string text)
    {
        var rawChunks = _chunker.ChunkText(text, chunkSize: 300, overlap: 50);
        var sessionId = Guid.NewGuid().ToString("N")[..8];

        _sessions[sessionId] = new PlaygroundSession { Chunks = rawChunks };

        var result = rawChunks
            .Select((c, i) => new PlaygroundChunk(i, c))
            .ToList();

        return (sessionId, result);
    }

    // ── Step 2: Embed ─────────────────────────────────────────────────────────
    // Generates a 1536-dim vector for each chunk using Azure OpenAI Embeddings.
    // Returns only the first 6 dimensions as a preview for the UI.

#pragma warning disable SKEXP0001 // ITextEmbeddingGenerationService is experimental
    public async Task<List<EmbedPreview>> EmbedSessionAsync(string sessionId)
    {
        if (!_sessions.TryGetValue(sessionId, out var session))
            throw new KeyNotFoundException($"Session '{sessionId}' not found.");

        var embSvc   = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();
        var previews = new List<EmbedPreview>();

        session.Embeddings.Clear();

        for (int i = 0; i < session.Chunks.Count; i++)
        {
            var vector = await embSvc.GenerateEmbeddingAsync(session.Chunks[i]);
            session.Embeddings.Add(vector);

            var firstDims = vector.Span[..Math.Min(6, vector.Length)].ToArray();
            var preview   = session.Chunks[i][..Math.Min(60, session.Chunks[i].Length)] + "…";

            previews.Add(new EmbedPreview(i, preview, firstDims, vector.Length));
        }

        session.IsEmbedded = true;
        return previews;
    }

    // ── Step 3: Ask ───────────────────────────────────────────────────────────
    // Embeds the question, runs cosine similarity against all stored vectors,
    // takes Top-K, reranks with LLM, then generates a grounded answer.

    public async Task<AskResult> AskAsync(string sessionId, string question, int topK = 3)
    {
        if (!_sessions.TryGetValue(sessionId, out var session) || !session.IsEmbedded)
            throw new InvalidOperationException("Session not found or embeddings not generated yet.");

        var embSvc = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();
        var chat   = _kernel.GetRequiredService<IChatCompletionService>();

        // Embed the question
        var qVector  = await embSvc.GenerateEmbeddingAsync(question);
        var qPreview = qVector.Span[..Math.Min(6, qVector.Length)].ToArray();

        // Cosine similarity against every stored chunk
        var allScores = session.Chunks
            .Select((chunk, i) => new ScoredChunk(
                i, chunk,
                CosineSimilarity(session.Embeddings[i].Span, qVector.Span)
            ))
            .OrderByDescending(x => x.Score)
            .ToList();

        // Top-K from vector similarity
        var topKChunks = allScores.Take(topK).ToList();

        // LLM reranking — picks the most relevant from Top-K
        var rerankedTexts = await _reranker.RerankAsync(
            question,
            topKChunks.Select(x => x.Text).ToList(),
            topK
        );

        // Generate final grounded answer
        var context = string.Join("\n\n", rerankedTexts);
        var answerContent = await chat.GetChatMessageContentAsync(
            $"Answer the question using only the context below. Be concise.\n\nContext:\n{context}\n\nQuestion: {question}\n\nAnswer:"
        );

        return new AskResult(
            qPreview,
            allScores,
            topKChunks,
            rerankedTexts,
            answerContent.Content ?? "No answer generated."
        );
    }
#pragma warning restore SKEXP0001

    // ── Cosine similarity — same formula as RagService ────────────────────────

    private static float CosineSimilarity(ReadOnlySpan<float> v1, ReadOnlySpan<float> v2)
    {
        float dot = 0, mag1 = 0, mag2 = 0;
        for (int i = 0; i < v1.Length; i++)
        {
            dot  += v1[i] * v2[i];
            mag1 += v1[i] * v1[i];
            mag2 += v2[i] * v2[i];
        }
        return dot / (MathF.Sqrt(mag1) * MathF.Sqrt(mag2));
    }
}
