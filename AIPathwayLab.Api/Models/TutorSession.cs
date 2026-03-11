namespace AIPathwayLab.Api.Models;

public class TutorSession
{
    public string SessionId { get; set; } = Guid.NewGuid().ToString();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<ChatMessage> Messages { get; set; } = new();
}