using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using AIPathwayLab.Api.Models;

namespace AIPathwayLab.Api.Services;

public class TutorOrchestrator
{
    private readonly Kernel _kernel;
    private readonly PromptService _promptService;
    private readonly RagService _ragService;
    private readonly RerankerService _reranker;
    private readonly SemanticCacheService _cache;

    public TutorOrchestrator(
        Kernel kernel,
        PromptService promptService,
        RagService ragService,
        RerankerService reranker,
        SemanticCacheService cache)
    {
        _kernel = kernel;
        _promptService = promptService;
        _ragService = ragService;
        _reranker = reranker;
        _cache = cache;
    }

    public async Task<(ChatHistory history, string? cachedAnswer)> BuildHistoryAsync(
        string question,
        List<ChatMessage> sessionMessages)
    {
        var history = new ChatHistory();

        // Persona prompt
        var systemPrompt = _promptService.GetTutorSystemPrompt();
        history.AddSystemMessage(systemPrompt);

        // Conversation memory
        foreach (var msg in sessionMessages)
        {
            if (msg.Role == "user")
                history.AddUserMessage(msg.Content);
            else if (msg.Role == "assistant")
                history.AddAssistantMessage(msg.Content);
        }

        // Semantic cache
        var cached = await _cache.TryGetCachedAnswer(question);

        if (cached != null)
            return (history, cached);

        // RAG retrieval
        var candidates = await _ragService.SearchAsync(question);

        // Reranking
        var contexts = await _reranker.RerankAsync(question, candidates, 3);

        if (contexts.Any())
        {
            var combinedContext = string.Join("\n\n", contexts);

            history.AddSystemMessage($"""
You must answer the question using ONLY the context below.

Context:
{combinedContext}

If the context does not contain the answer, respond with:
"I cannot find the answer in the provided knowledge."
""");
        }

        history.AddUserMessage(question);

        return (history, null);
    }

    public async Task StoreCacheAsync(string question, string answer)
    {
        await _cache.StoreAsync(question, answer);
    }
}