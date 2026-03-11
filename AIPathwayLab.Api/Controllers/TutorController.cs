using Microsoft.AspNetCore.Mvc;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

using AIPathwayLab.Api.Models;
using AIPathwayLab.Api.Services;
using AIPathwayLab.Api.Infrastructure;

namespace AIPathwayLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TutorController : ControllerBase
{
    private readonly SessionStore _sessionStore;
    private readonly Kernel _kernel;
    private readonly TutorOrchestrator _orchestrator;
    private readonly AIObservabilityService _observability;

    public TutorController(
        SessionStore sessionStore,
        Kernel kernel,
        TutorOrchestrator orchestrator,
        AIObservabilityService observability)
    {
        _sessionStore = sessionStore;
        _kernel = kernel;
        _orchestrator = orchestrator;
        _observability = observability;
    }

    [HttpPost("ask")]
    public async Task Ask([FromBody] AskQuestionRequest request)
    {
        var session = _sessionStore.GetSession(request.SessionId);

        if (session == null)
        {
            Response.StatusCode = 400;
            await Response.WriteAsync("Invalid session");
            return;
        }

        Response.Headers.Append("Content-Type", "text/event-stream");
        Response.Headers.Append("Cache-Control", "no-cache");
        Response.Headers.Append("Connection", "keep-alive");

        var chatService = _kernel.GetRequiredService<IChatCompletionService>();

        // Observability: log question
        _observability.LogQuestion(request.Question);

        // Build AI prompt history via orchestrator
        var (history, cached) = await _orchestrator.BuildHistoryAsync(
            request.Question,
            session.Messages
        );

        // Cache hit
        if (cached != null)
        {
            _observability.LogCacheHit();

            var escapedCache = cached.Replace("\r", "").Replace("\n", "\\n");
            await Response.WriteAsync($"data: {escapedCache}\n\n");
            await Response.Body.FlushAsync();
            return;
        }

        _observability.LogCacheMiss();

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        var stream = chatService.GetStreamingChatMessageContentsAsync(history);

        string fullResponse = "";

        await foreach (var token in stream)
        {
            var content = token.Content;

            if (!string.IsNullOrEmpty(content))
            {
                fullResponse += content;

                // Escape newlines so they don't corrupt the SSE event format.
                // \n\n is the SSE event terminator — if content contains \n,
                // the browser would treat it as end-of-event and lose the data.
                var escaped = content
                    .Replace("\r", "")
                    .Replace("\n", "\\n");

                await Response.WriteAsync($"data: {escaped}\n\n");
                await Response.Body.FlushAsync();
            }
        }

        stopwatch.Stop();

        _observability.LogResponseTime(stopwatch.ElapsedMilliseconds);

        // Save conversation memory
        session.Messages.Add(new ChatMessage
        {
            Role = "user",
            Content = request.Question
        });

        session.Messages.Add(new ChatMessage
        {
            Role = "assistant",
            Content = fullResponse
        });

        // Store semantic cache
        await _orchestrator.StoreCacheAsync(request.Question, fullResponse);
    }

    // -------------------------------------------------------
    // Debug endpoint (non-streaming)
    // Useful for testing RAG easily
    // -------------------------------------------------------

    [HttpPost("ask-debug")]
    public async Task<IActionResult> AskDebug([FromBody] AskQuestionRequest request)
    {
        var session = _sessionStore.GetSession(request.SessionId);

        if (session == null)
            return BadRequest("Invalid session");

        var chatService = _kernel.GetRequiredService<IChatCompletionService>();

        _observability.LogQuestion(request.Question);

        var (history, cached) = await _orchestrator.BuildHistoryAsync(
            request.Question,
            session.Messages
        );

        if (cached != null)
        {
            _observability.LogCacheHit();
            return Ok(cached);
        }

        _observability.LogCacheMiss();

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        var result = await chatService.GetChatMessageContentAsync(history);

        stopwatch.Stop();

        _observability.LogResponseTime(stopwatch.ElapsedMilliseconds);

        var answer = result.Content ?? "";

        session.Messages.Add(new ChatMessage
        {
            Role = "user",
            Content = request.Question
        });

        session.Messages.Add(new ChatMessage
        {
            Role = "assistant",
            Content = answer
        });

        await _orchestrator.StoreCacheAsync(request.Question, answer);

        return Ok(answer);
    }
}