using AIPathwayLab.Api.Models;

namespace AIPathwayLab.Api.Infrastructure;

public class SessionStore
{
    private readonly Dictionary<string, TutorSession> _sessions = new();

    public TutorSession CreateSession()
    {
        var session = new TutorSession();

        _sessions[session.SessionId] = session;

        return session;
    }

    public TutorSession? GetSession(string sessionId)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            return session;
        }

        return null;
    }

    public void AddMessage(string sessionId, ChatMessage message)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            session.Messages.Add(message);
        }
    }

    public List<ChatMessage> GetMessages(string sessionId)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            return session.Messages;
        }

        return new List<ChatMessage>();
    }
}