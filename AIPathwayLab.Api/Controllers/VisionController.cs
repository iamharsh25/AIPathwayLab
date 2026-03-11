using Microsoft.AspNetCore.Mvc;
using AIPathwayLab.Api.Services;

namespace AIPathwayLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class VisionController : ControllerBase
{
    private readonly VisionService _vision;

    public VisionController(VisionService vision)
    {
        _vision = vision;
    }

    // ── POST /api/vision/analyze ───────────────────────────────────────────
    // Accepts a multipart/form-data file upload, runs Azure AI Vision,
    // returns caption, tags, objects, and OCR text.

    [HttpPost("analyze")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB max
    public async Task<IActionResult> Analyze(IFormFile? image)
    {
        if (image == null || image.Length == 0)
            return BadRequest("No image file was provided.");

        // Only allow images
        var allowedTypes = new[] { "image/jpeg", "image/png", "image/bmp", "image/gif", "image/webp", "image/tiff" };
        if (!allowedTypes.Contains(image.ContentType.ToLower()))
            return BadRequest($"File type '{image.ContentType}' is not supported. Upload a JPEG, PNG, BMP, GIF, WebP or TIFF.");

        await using var stream = image.OpenReadStream();
        var result = await _vision.AnalyzeAsync(stream, image.ContentType);

        return Ok(result);
    }
}
