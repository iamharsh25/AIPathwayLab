using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace AIPathwayLab.Api.Services;

public class RerankerService
{
    private readonly Kernel _kernel;

    public RerankerService(Kernel kernel)
    {
        _kernel = kernel;
    }

    public async Task<List<string>> RerankAsync(string question, List<string> chunks, int topK = 3)
    {
        var chat = _kernel.GetRequiredService<IChatCompletionService>();

        var prompt = $"""
You are a retrieval ranking system.

Question:
{question}

Rank the following text chunks by relevance to the question.

Chunks:
{string.Join("\n---\n", chunks)}

Return only the {topK} most relevant chunks.
""";

        var result = await chat.GetChatMessageContentAsync(prompt);

        return result.Content?
            .Split("---")
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrEmpty(x))
            .Take(topK)
            .ToList() ?? new List<string>();
    }
}