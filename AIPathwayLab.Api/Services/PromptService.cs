namespace AIPathwayLab.Api.Services;

public class PromptService
{
    private readonly IWebHostEnvironment _env;

    public PromptService(IWebHostEnvironment env)
    {
        _env = env;
    }

    public string GetTutorSystemPrompt()
    {
        var path = Path.Combine(
            _env.ContentRootPath,
            "AI",
            "PromptTemplates",
            "tutor-system.txt");

        return File.ReadAllText(path);
    }
}