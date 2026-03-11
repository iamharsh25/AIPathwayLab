namespace AIPathwayLab.Api.Models;

public class AskQuestionRequest
{
    public string SessionId { get; set; } = string.Empty;

    public string Question { get; set; } = string.Empty;
}