using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Embeddings;

namespace AIPathwayLab.Api.Services;

public class SemanticCacheService
{
    private readonly Kernel _kernel;

    private readonly List<(string Question, string Answer, ReadOnlyMemory<float> Vector)> _cache
        = new();

    public SemanticCacheService(Kernel kernel)
    {
        _kernel = kernel;
    }

    public async Task<string?> TryGetCachedAnswer(string question)
    {
        var embeddingService = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();

        var queryVector = await embeddingService.GenerateEmbeddingAsync(question);

        foreach (var entry in _cache)
        {
            var similarity = CosineSimilarity(entry.Vector.Span, queryVector.Span);

            if (similarity > 0.92)
            {
                return entry.Answer;
            }
        }

        return null;
    }

    public async Task StoreAsync(string question, string answer)
    {
        var embeddingService = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();

        var vector = await embeddingService.GenerateEmbeddingAsync(question);

        _cache.Add((question, answer, vector));
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