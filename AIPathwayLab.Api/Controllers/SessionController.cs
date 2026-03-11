using Microsoft.AspNetCore.Mvc;
using AIPathwayLab.Api.Infrastructure;
using AIPathwayLab.Api.Models;

namespace AIPathwayLab.Api.Controllers;

[ApiController]
[Route("api/session")]
public class SessionController : ControllerBase
{
    private readonly SessionStore _sessionStore;

    public SessionController(SessionStore sessionStore)
    {
        _sessionStore = sessionStore;
    }

    [HttpPost]
    public IActionResult CreateSession()
    {
        var session = _sessionStore.CreateSession();

        return Ok(new
        {
            sessionId = session.SessionId,
            createdAt = session.CreatedAt
        });
    }

    [HttpPost("{sessionId}/message")]
    public IActionResult AddMessage(string sessionId, [FromBody] ChatMessage message)
    {
        _sessionStore.AddMessage(sessionId, message);

        return Ok();
    }
}