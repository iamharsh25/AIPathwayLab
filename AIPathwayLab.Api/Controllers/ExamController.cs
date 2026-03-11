using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using AIPathwayLab.Api.Models;

namespace AIPathwayLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExamController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    // Cache the questions in memory after first load
    // No need to read the file on every request
    private static List<ExamQuestion>? _cachedQuestions;
    private static readonly object _lock = new();

    public ExamController(IWebHostEnvironment env)
    {
        _env = env;
    }

    // ── GET /api/exam/question ─────────────────────────────────────────────
    // Returns a random question. Correct answer is NOT included in the response.
    // Optional filters: ?domain=Generative+AI  ?difficulty=medium
    // Optional exclude:  ?exclude=1,3,7  (comma-separated IDs already answered)

    [HttpGet("question")]
    public IActionResult GetQuestion(
        [FromQuery] string? domain,
        [FromQuery] string? difficulty,
        [FromQuery] string? exclude)
    {
        var questions = LoadQuestions();

        var filtered = questions.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(domain))
            filtered = filtered.Where(q => q.Domain.Equals(domain, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(difficulty))
            filtered = filtered.Where(q => q.Difficulty.Equals(difficulty, StringComparison.OrdinalIgnoreCase));

        // Exclude already-answered question IDs to avoid repeats in a session
        if (!string.IsNullOrWhiteSpace(exclude))
        {
            var excludedIds = exclude
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => int.TryParse(s.Trim(), out var id) ? id : -1)
                .ToHashSet();

            filtered = filtered.Where(q => !excludedIds.Contains(q.Id));
        }

        var list = filtered.ToList();

        if (list.Count == 0)
            return NotFound("No questions available with those filters.");

        // Pick a random question
        var question = list[Random.Shared.Next(list.Count)];

        // Return the DTO — correct answer stays on the server
        return Ok(new ExamQuestionDto
        {
            Id         = question.Id,
            Domain     = question.Domain,
            Difficulty = question.Difficulty,
            Question   = question.Question,
            Options    = question.Options
        });
    }

    // ── POST /api/exam/evaluate ────────────────────────────────────────────
    // Receives the user's selected answer and returns:
    //   - whether it is correct
    //   - the correct answer letter and text
    //   - the explanation from the JSON

    [HttpPost("evaluate")]
    public IActionResult Evaluate([FromBody] EvaluateRequest request)
    {
        var questions = LoadQuestions();

        var question = questions.FirstOrDefault(q => q.Id == request.QuestionId);

        if (question == null)
            return NotFound($"Question {request.QuestionId} not found.");

        var isCorrect = request.SelectedAnswer.Trim().ToUpper() == question.CorrectAnswer.ToUpper();

        return Ok(new
        {
            isCorrect,
            correctAnswer     = question.CorrectAnswer,
            correctAnswerText = question.Options.GetValueOrDefault(question.CorrectAnswer, ""),
            explanation       = question.Explanation
        });
    }

    // ── GET /api/exam/domains ──────────────────────────────────────────────
    // Returns a list of unique domains — used by the frontend filter dropdown

    [HttpGet("domains")]
    public IActionResult GetDomains()
    {
        var domains = LoadQuestions()
            .Select(q => q.Domain)
            .Distinct()
            .OrderBy(d => d)
            .ToList();

        return Ok(domains);
    }

    // ── Private: Load ALL .json files from the Questions/ folder ─────────────
    // Drop any question file in Questions/ and it gets picked up automatically.
    // IDs are re-assigned to be unique across all files.

    private List<ExamQuestion> LoadQuestions()
    {
        if (_cachedQuestions != null)
            return _cachedQuestions;

        lock (_lock)
        {
            if (_cachedQuestions != null)
                return _cachedQuestions;

            var questionsDir = Path.Combine(_env.ContentRootPath, "Questions");

            if (!Directory.Exists(questionsDir))
                return [];

            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            var allQuestions = new List<ExamQuestion>();

            foreach (var file in Directory.GetFiles(questionsDir, "*.json"))
            {
                var json = System.IO.File.ReadAllText(file);
                var bank = JsonSerializer.Deserialize<QuestionBank>(json, jsonOptions);

                if (bank?.Questions != null)
                    allQuestions.AddRange(bank.Questions);
            }

            // Re-assign sequential IDs to ensure uniqueness across files
            for (int i = 0; i < allQuestions.Count; i++)
                allQuestions[i].Id = i + 1;

            _cachedQuestions = allQuestions;

            Console.WriteLine($"[ExamController] Loaded {_cachedQuestions.Count} questions from {questionsDir}");

            return _cachedQuestions;
        }
    }
}
