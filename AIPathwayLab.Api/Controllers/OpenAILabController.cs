using Microsoft.AspNetCore.Mvc;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.AzureOpenAI;
using AIPathwayLab.Api.Services;

namespace AIPathwayLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OpenAILabController : ControllerBase
{
    private readonly RagPlaygroundService _rag;
    private readonly Kernel _kernel;

    public OpenAILabController(RagPlaygroundService rag, Kernel kernel)
    {
        _rag    = rag;
        _kernel = kernel;
    }

    // ── POST /api/openailab/rag/upload ────────────────────────────────────────
    // Accepts a .txt file upload OR raw text in the form body.
    // Chunks the text and returns the session ID + chunk list.

    [HttpPost("rag/upload")]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5 MB
    public IActionResult Upload([FromForm] IFormFile? file, [FromForm] string? text)
    {
        string content;

        if (file != null && file.Length > 0)
        {
            using var reader = new StreamReader(file.OpenReadStream());
            content = reader.ReadToEnd();
        }
        else if (!string.IsNullOrWhiteSpace(text))
        {
            content = text;
        }
        else
        {
            return BadRequest("Provide a text file or paste text.");
        }

        // Cap at 30 000 chars for demo — avoids excessive embedding calls
        if (content.Length > 30_000)
            content = content[..30_000];

        var (sessionId, chunks) = _rag.ChunkDocument(content);
        return Ok(new { sessionId, chunks });
    }

    // ── POST /api/openailab/rag/embed ─────────────────────────────────────────
    // Triggers embedding generation for all chunks in the session.
    // Returns the first 6 dimensions of each vector as a visual preview.

    [HttpPost("rag/embed")]
    public async Task<IActionResult> Embed([FromBody] EmbedRequest req)
    {
        try
        {
            var previews = await _rag.EmbedSessionAsync(req.SessionId);
            return Ok(new { previews });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
    }

    // ── POST /api/openailab/rag/ask ───────────────────────────────────────────
    // Searches the session vector store, reranks, and generates a grounded answer.
    // Returns all intermediate steps for the pipeline visualisation.

    [HttpPost("rag/ask")]
    public async Task<IActionResult> Ask([FromBody] AskRequest req)
    {
        try
        {
            var result = await _rag.AskAsync(req.SessionId, req.Question, req.TopK);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ── POST /api/openailab/chat ──────────────────────────────────────────────
    // System Prompt playground — streams a GPT-4o response with configurable
    // system prompt, temperature, and max token settings.

    [HttpPost("chat")]
    public async Task Chat([FromBody] LabChatRequest req)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Connection   = "keep-alive";

        var chat = _kernel.GetRequiredService<IChatCompletionService>();

        // Build the chat history
        var history = new ChatHistory();

        if (!string.IsNullOrWhiteSpace(req.SystemPrompt))
            history.AddSystemMessage(req.SystemPrompt);

        foreach (var msg in req.ConversationHistory ?? [])
        {
            if (msg.Role == "user")           history.AddUserMessage(msg.Content);
            else if (msg.Role == "assistant") history.AddAssistantMessage(msg.Content);
        }

        history.AddUserMessage(req.Message);

        // Apply user-configurable parameters
#pragma warning disable SKEXP0010
        var settings = new AzureOpenAIPromptExecutionSettings
        {
            Temperature = req.Temperature,
            MaxTokens   = req.MaxTokens,
        };
#pragma warning restore SKEXP0010

        await foreach (var chunk in chat.GetStreamingChatMessageContentsAsync(history, settings, _kernel))
        {
            var content = chunk.Content ?? "";
            if (string.IsNullOrEmpty(content)) continue;

            // Escape newlines so SSE doesn't interpret them as event separators
            var escaped = content.Replace("\r", "").Replace("\n", "\\n");
            await Response.WriteAsync($"data: {escaped}\n\n");
            await Response.Body.FlushAsync();
        }

        await Response.WriteAsync("data: [DONE]\n\n");
        await Response.Body.FlushAsync();
    }
}

// ── Request models ────────────────────────────────────────────────────────────

public record EmbedRequest(string SessionId);

public record AskRequest(string SessionId, string Question, int TopK = 3);

public record LabChatMessage(string Role, string Content);

public record LabChatRequest(
    string                  SystemPrompt,
    string                  Message,
    double                  Temperature,
    int                     MaxTokens,
    List<LabChatMessage>?   ConversationHistory
);
