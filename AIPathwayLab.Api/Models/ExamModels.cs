using System.Text.Json.Serialization;

namespace AIPathwayLab.Api.Models;

// ── Matches the JSON structure in Questions/ai102-questions.json ──────────────

public class QuestionBank
{
    [JsonPropertyName("questions")]
    public List<ExamQuestion> Questions { get; set; } = [];
}

public class ExamQuestion
{
    [JsonPropertyName("id")]          public int Id { get; set; }
    [JsonPropertyName("domain")]      public string Domain { get; set; } = "";
    [JsonPropertyName("difficulty")]  public string Difficulty { get; set; } = "";
    [JsonPropertyName("question")]    public string Question { get; set; } = "";
    [JsonPropertyName("options")]     public Dictionary<string, string> Options { get; set; } = [];
    [JsonPropertyName("correctAnswer")] public string CorrectAnswer { get; set; } = "";
    [JsonPropertyName("explanation")] public string Explanation { get; set; } = "";
}

// ── What we send to the frontend — correct answer is intentionally hidden ─────

public class ExamQuestionDto
{
    public int Id { get; set; }
    public string Domain { get; set; } = "";
    public string Difficulty { get; set; } = "";
    public string Question { get; set; } = "";
    public Dictionary<string, string> Options { get; set; } = [];
}

// ── What the frontend sends when a user picks an answer ──────────────────────

public class EvaluateRequest
{
    public int QuestionId { get; set; }
    public string SelectedAnswer { get; set; } = "";
}
