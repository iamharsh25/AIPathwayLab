using Microsoft.AspNetCore.Mvc;

namespace AIPathwayLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CodeController : ControllerBase
{
    private readonly IWebHostEnvironment _env;

    private static readonly string[] AllowedDirectories =
    [
        "Services",
        "Controllers",
        "AI",
        "Infrastructure",
        "Models"
    ];

    public CodeController(IWebHostEnvironment env)
    {
        _env = env;
    }

    [HttpGet("files")]
    public IActionResult GetFiles()
    {
        var projectRoot = _env.ContentRootPath;
        var files = new List<string>();

        foreach (var dir in AllowedDirectories)
        {
            var dirPath = Path.Combine(projectRoot, dir);
            if (!Directory.Exists(dirPath)) continue;

            var csFiles = Directory.GetFiles(dirPath, "*.cs", SearchOption.AllDirectories)
                .Select(Path.GetFileName)
                .Where(f => f != null)
                .Cast<string>();

            files.AddRange(csFiles);
        }

        return Ok(files.OrderBy(f => f).ToList());
    }

    [HttpGet("file")]
    public IActionResult GetFile([FromQuery] string name)
    {
        // Security: reject any name that tries to escape the directory
        if (string.IsNullOrWhiteSpace(name)
            || name.Contains("..")
            || name.Contains('/')
            || name.Contains('\\'))
        {
            return BadRequest("Invalid file name.");
        }

        // ContentRootPath = the project folder (where .csproj lives)
        var projectRoot = _env.ContentRootPath;

        foreach (var dir in AllowedDirectories)
        {
            var filePath = Path.Combine(projectRoot, dir, name);

            if (System.IO.File.Exists(filePath))
            {
                var content = System.IO.File.ReadAllText(filePath);
                var language = GetLanguage(name);

                return Ok(new
                {
                    fileName = name,
                    language,
                    content
                });
            }
        }

        return NotFound($"File '{name}' not found in the project.");
    }

    private static string GetLanguage(string fileName)
    {
        return Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".cs"   => "csharp",
            ".ts"   => "typescript",
            ".tsx"  => "typescript",
            ".json" => "json",
            ".txt"  => "text",
            _       => "text"
        };
    }
}
