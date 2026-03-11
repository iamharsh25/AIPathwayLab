using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Embeddings;
using AIPathwayLab.Api.AI;

namespace AIPathwayLab.Api.Services;

public class RagService
{
    private readonly Kernel _kernel;
    private readonly VectorStore _store;
    private readonly ChunkingService _chunker;

    public RagService(Kernel kernel, VectorStore store, ChunkingService chunker)
    {
        _kernel = kernel;
        _store = store;
        _chunker = chunker;
    }

    public async Task AddDocumentAsync(string text)
    {
        var embeddingService = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();

        var chunks = _chunker.ChunkText(text);

        foreach (var chunk in chunks)
        {
            var vector = await embeddingService.GenerateEmbeddingAsync(chunk);

            _store.Documents.Add((chunk, vector));
        }
    }

    public async Task<List<string>> SearchAsync(string question, int topK = 3)
    {
        var embeddingService = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();

        var queryVector = await embeddingService.GenerateEmbeddingAsync(question);

        var candidates = _store.Documents
            .Select(d => new
            {
                Text = d.Text,
                Score = CosineSimilarity(d.Vector.Span, queryVector.Span)
            })
            .OrderByDescending(x => x.Score)
            .Take(10)   // get more candidates first
            .Select(x => x.Text)
            .ToList();

        return candidates;
    }

    private static float CosineSimilarity(ReadOnlySpan<float> v1, ReadOnlySpan<float> v2)
    {
        float dot = 0;
        float mag1 = 0;
        float mag2 = 0;

        for (int i = 0; i < v1.Length; i++)
        {
            dot += v1[i] * v2[i];
            mag1 += v1[i] * v1[i];
            mag2 += v2[i] * v2[i];
        }

        return dot / (MathF.Sqrt(mag1) * MathF.Sqrt(mag2));
    }
}