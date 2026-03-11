namespace AIPathwayLab.Api.Services;

public class AIObservabilityService
{
    private readonly ILogger<AIObservabilityService> _logger;

    public AIObservabilityService(ILogger<AIObservabilityService> logger)
    {
        _logger = logger;
    }

    public void LogQuestion(string question)
    {
        _logger.LogInformation("User Question: {Question}", question);
    }

    public void LogCacheHit()
    {
        _logger.LogInformation("Semantic Cache Hit");
    }

    public void LogCacheMiss()
    {
        _logger.LogInformation("Semantic Cache Miss");
    }

    public void LogRetrievedChunks(List<string> chunks)
    {
        _logger.LogInformation("Retrieved Chunks: {Chunks}", string.Join(" | ", chunks));
    }

    public void LogRerankedChunks(List<string> chunks)
    {
        _logger.LogInformation("Reranked Chunks: {Chunks}", string.Join(" | ", chunks));
    }

    public void LogPromptSize(int size)
    {
        _logger.LogInformation("Prompt Size (characters): {Size}", size);
    }

    public void LogResponseTime(long milliseconds)
    {
        _logger.LogInformation("GPT Response Time: {Time} ms", milliseconds);
    }
}