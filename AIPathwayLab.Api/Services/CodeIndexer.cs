namespace AIPathwayLab.Api.Services;

public class CodeIndexer
{
    public List<string> LoadCodeFiles(string rootPath)
    {
        var files = Directory.GetFiles(rootPath, "*.cs", SearchOption.AllDirectories);

        var chunks = new List<string>();

        foreach (var file in files)
        {
            var code = File.ReadAllText(file);

            var fileName = Path.GetFileName(file);

            var parts = code.Split("public");

            foreach (var part in parts)
            {
                if (string.IsNullOrWhiteSpace(part)) continue;

                chunks.Add($"""
File: {fileName}

Code:
public {part}
""");
            }
        }

        return chunks;
    }
}