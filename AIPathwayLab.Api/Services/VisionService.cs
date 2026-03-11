using Azure;
using Azure.AI.Vision.ImageAnalysis;

namespace AIPathwayLab.Api.Services;

// ── What we return to the frontend ───────────────────────────────────────────

public record VisionAnalysisResult(
    string?                  Caption,
    float?                   CaptionConfidence,
    List<TagResult>          Tags,
    List<DetectedObjectResult> Objects,
    List<string>             ReadLines
);

public record TagResult(string Name, float Confidence);

public record DetectedObjectResult(
    string Name,
    float  Confidence,
    int    Left,
    int    Top,
    int    Width,
    int    Height
);

// ── Service ───────────────────────────────────────────────────────────────────

public class VisionService
{
    private readonly ImageAnalysisClient _client;

    public VisionService(IConfiguration config)
    {
        var endpoint = config["AzureVision:Endpoint"]
            ?? throw new InvalidOperationException("AzureVision:Endpoint not configured");

        var apiKey = config["AzureVision:ApiKey"]
            ?? throw new InvalidOperationException("AzureVision:ApiKey not configured");

        _client = new ImageAnalysisClient(new Uri(endpoint), new AzureKeyCredential(apiKey));
    }

    public async Task<VisionAnalysisResult> AnalyzeAsync(Stream imageStream, string contentType)
    {
        // Tell the SDK which features we want back from Vision
        var features =
            VisualFeatures.Caption |
            VisualFeatures.Tags    |
            VisualFeatures.Objects |
            VisualFeatures.Read;

        var imageData = await BinaryData.FromStreamAsync(imageStream);

        var result = await _client.AnalyzeAsync(
            imageData,
            features,
            new ImageAnalysisOptions { GenderNeutralCaption = true }
        );

        // ── Caption ──────────────────────────────────────────────────────────
        string? caption           = result.Value.Caption?.Text;
        float?  captionConfidence = result.Value.Caption != null
            ? (float)result.Value.Caption.Confidence
            : null;

        // ── Tags ─────────────────────────────────────────────────────────────
        var tags = result.Value.Tags?.Values
            .OrderByDescending(t => t.Confidence)
            .Select(t => new TagResult(t.Name, (float)t.Confidence))
            .ToList() ?? [];

        // ── Objects ──────────────────────────────────────────────────────────
        var objects = result.Value.Objects?.Values
            .OrderByDescending(o => o.Tags.First().Confidence)
            .Select(o => new DetectedObjectResult(
                o.Tags.First().Name,
                (float)o.Tags.First().Confidence,
                o.BoundingBox.X,
                o.BoundingBox.Y,
                o.BoundingBox.Width,
                o.BoundingBox.Height
            ))
            .ToList() ?? [];

        // ── OCR / Read ────────────────────────────────────────────────────────
        var readLines = result.Value.Read?.Blocks
            .SelectMany(b => b.Lines)
            .Select(l => l.Text)
            .ToList() ?? [];

        return new VisionAnalysisResult(caption, captionConfidence, tags, objects, readLines);
    }
}
