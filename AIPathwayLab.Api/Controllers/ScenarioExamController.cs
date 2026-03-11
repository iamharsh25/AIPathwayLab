using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace AIPathwayLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ScenarioExamController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    public ScenarioExamController(IWebHostEnvironment env)
    {
        _env = env;
    }

    // GET /api/scenarioexam/list
    // Returns all available scenario exam files with metadata.

    [HttpGet("list")]
    public IActionResult ListExams()
    {
        var dir = Path.Combine(_env.ContentRootPath, "Questions");
        if (!Directory.Exists(dir))
            return Ok(Array.Empty<object>());

        var exams = new List<object>();

        foreach (var file in Directory.GetFiles(dir, "ai102-scenario-*.json").OrderBy(f => f))
        {
            try
            {
                var raw  = System.IO.File.ReadAllText(file);
                var doc  = JsonDocument.Parse(raw);
                var root = doc.RootElement;

                var parts = root.GetProperty("parts");
                var totalQuestions = 0;
                var partCount = 0;

                foreach (var part in parts.EnumerateArray())
                {
                    partCount++;
                    totalQuestions += part.GetProperty("questions").GetArrayLength();
                }

                exams.Add(new
                {
                    id             = root.GetProperty("id").GetString(),
                    title          = root.GetProperty("title").GetString(),
                    description    = root.TryGetProperty("description", out var desc) ? desc.GetString() : "",
                    totalParts     = partCount,
                    totalQuestions = totalQuestions,
                });
            }
            catch
            {
                // Skip malformed files
            }
        }

        return Ok(exams);
    }

    // GET /api/scenarioexam/{id}/part/{part}
    // Returns questions for a specific part of an exam.

    [HttpGet("{id}/part/{part:int}")]
    public IActionResult GetPart(string id, int part)
    {
        // Security: id should only be alphanumeric + dashes
        if (string.IsNullOrWhiteSpace(id) || id.Contains('/') || id.Contains('\\') || id.Contains(".."))
            return BadRequest("Invalid exam id.");

        var file = Path.Combine(_env.ContentRootPath, "Questions", $"{id}.json");

        if (!System.IO.File.Exists(file))
            return NotFound($"Exam '{id}' not found.");

        var raw     = System.IO.File.ReadAllText(file);
        var exam    = JsonDocument.Parse(raw).RootElement;
        var parts   = exam.GetProperty("parts");

        foreach (var p in parts.EnumerateArray())
        {
            if (p.GetProperty("part").GetInt32() == part)
            {
                return Ok(new
                {
                    examId     = exam.GetProperty("id").GetString(),
                    examTitle  = exam.GetProperty("title").GetString(),
                    part       = part,
                    partTitle  = p.GetProperty("title").GetString(),
                    totalParts = parts.GetArrayLength(),
                    questions  = JsonSerializer.Deserialize<object>(p.GetProperty("questions").GetRawText(), _jsonOpts),
                });
            }
        }

        return NotFound($"Part {part} not found in exam '{id}'.");
    }
}
