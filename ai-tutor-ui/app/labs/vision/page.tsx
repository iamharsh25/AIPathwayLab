"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { API_URL } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

type TagResult      = { name: string; confidence: number };
type DetectedObject = { name: string; confidence: number; left: number; top: number; width: number; height: number };
type VisionResult   = { caption: string | null; captionConfidence: number | null; tags: TagResult[]; objects: DetectedObject[]; readLines: string[] };
type Tab            = "caption" | "tags" | "objects" | "ocr" | "setup";

// ── VisionService.cs embedded for the learning panel ─────────────────────────

const CODE = `using Azure;
using Azure.AI.Vision.ImageAnalysis;

namespace AIPathwayLab.Api.Services;

public record VisionAnalysisResult(
    string?                    Caption,
    float?                     CaptionConfidence,
    List<TagResult>            Tags,
    List<DetectedObjectResult> Objects,
    List<string>               ReadLines
);
public record TagResult(string Name, float Confidence);
public record DetectedObjectResult(
    string Name, float Confidence,
    int Left, int Top, int Width, int Height
);

public class VisionService
{
    private readonly ImageAnalysisClient _client;

    public VisionService(IConfiguration config)
    {
        var endpoint = config["AzureVision:Endpoint"]!;
        var apiKey   = config["AzureVision:ApiKey"]!;
        _client = new ImageAnalysisClient(
            new Uri(endpoint), new AzureKeyCredential(apiKey));
    }

    public async Task<VisionAnalysisResult> AnalyzeAsync(Stream stream)
    {
        // ① All four features requested in a single API call
        var features =
            VisualFeatures.Caption |
            VisualFeatures.Tags    |
            VisualFeatures.Objects |
            VisualFeatures.Read;

        var data   = await BinaryData.FromStreamAsync(stream);
        var result = await _client.AnalyzeAsync(data, features,
            new ImageAnalysisOptions { GenderNeutralCaption = true });

        // ② Caption — one-sentence image description
        string? caption     = result.Value.Caption?.Text;
        float?  captionConf = result.Value.Caption != null
            ? (float)result.Value.Caption.Confidence : null;

        // ③ Tags — keyword list with confidence scores
        var tags = result.Value.Tags?.Values
            .OrderByDescending(t => t.Confidence)
            .Select(t => new TagResult(t.Name, (float)t.Confidence))
            .ToList() ?? [];

        // ④ Objects — where are things? (bounding boxes)
        var objects = result.Value.Objects?.Values
            .Select(o => new DetectedObjectResult(
                o.Tags.First().Name,
                (float)o.Tags.First().Confidence,
                o.BoundingBox.X, o.BoundingBox.Y,
                o.BoundingBox.Width, o.BoundingBox.Height
            )).ToList() ?? [];

        // ⑤ OCR / Read — extract text from the image
        var readLines = result.Value.Read?.Blocks
            .SelectMany(b => b.Lines)
            .Select(l => l.Text)
            .ToList() ?? [];

        return new VisionAnalysisResult(
            caption, captionConf, tags, objects, readLines);
    }
}`;

const CODE_LINES = CODE.split("\n");

// ── Which lines to highlight per tab (0-indexed) ──────────────────────────────
// Lines 32–37 = the shared VisualFeatures block (shows which flag activates)
// Then the specific extraction section for each feature

const HIGHLIGHTS: Record<Tab, Set<number>> = {
  caption: new Set([32, 33, 34, 35, 36, 37, 43, 44, 45, 46]),
  tags:    new Set([32, 33, 34, 35, 36, 37, 48, 49, 50, 51, 52]),
  objects: new Set([32, 33, 34, 35, 36, 37, 54, 55, 56, 57, 58, 59, 60, 61]),
  ocr:     new Set([32, 33, 34, 35, 36, 37, 63, 64, 65, 66, 67]),
  setup:   new Set([]),
};

// Line to scroll into view when a tab is selected (the section comment)
const SCROLL_TO: Record<Tab, number> = {
  caption: 43, tags: 48, objects: 54, ocr: 63, setup: 0,
};

// ── Per-tab explanations ──────────────────────────────────────────────────────

const TAB_INFO: Record<Tab, { icon: string; title: string; what: string; how: string }> = {
  caption: {
    icon: "💬",
    title: "Caption",
    what: "A single AI-generated sentence describing the full image — like auto-generated alt text.",
    how: "The model reads the whole image holistically and outputs a natural language description. GenderNeutralCaption = true removes gender-specific pronouns for more inclusive output.",
  },
  tags: {
    icon: "🏷️",
    title: "Tags",
    what: "A ranked list of keywords covering objects, scenes, colors, and actions detected in the image.",
    how: "Tags have a much wider vocabulary than captions. Each tag carries a confidence score 0–1. Sorted by confidence. Useful for search indexing and content categorisation.",
  },
  objects: {
    icon: "📦",
    title: "Object Detection",
    what: "Detects objects and returns WHERE they are — pixel bounding box (X, Y, Width, Height).",
    how: "Unlike tags (which say 'dog exists'), objects say WHERE the dog is in the frame. Useful for spatial analysis, drawing overlays, or counting items in a scene.",
  },
  ocr: {
    icon: "📝",
    title: "OCR / Read",
    what: "Extracts printed or handwritten text from the image, organized by line.",
    how: "Returns text in Blocks → Lines → Words. Handles complex layouts, rotated text, and multiple languages. For PDFs or large documents, use Document Intelligence instead.",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n: number) { return `${Math.round(n * 100)}%`; }

function confColor(n: number) {
  if (n >= 0.85) return "bg-green-100 text-green-700 border-green-200";
  if (n >= 0.6)  return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VisionLabPage() {
  const [imageUrl,   setImageUrl]   = useState<string | null>(null);
  const [imageFile,  setImageFile]  = useState<File | null>(null);
  const [result,     setResult]     = useState<VisionResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<Tab>("caption");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const lineRefs      = useRef<Map<number, HTMLDivElement>>(new Map());
  const codeScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll code panel to the highlighted section when tab changes
  useEffect(() => {
    const targetLine = SCROLL_TO[activeTab];
    const el         = lineRefs.current.get(targetLine);
    const container  = codeScrollRef.current;
    if (!el || !container) return;

    const elTop        = el.getBoundingClientRect().top;
    const containerTop = container.getBoundingClientRect().top;
    const newScroll    = container.scrollTop + (elTop - containerTop) - 80;
    container.scrollTo({ top: newScroll, behavior: "smooth" });
  }, [activeTab]);

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setImageFile(file);
    setResult(null);
    setError(null);
    setImageUrl(URL.createObjectURL(file));
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Analyze ───────────────────────────────────────────────────────────────

  const analyze = async () => {
    if (!imageFile) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("image", imageFile);
      const res = await fetch(`${API_URL}/api/vision/analyze`, { method: "POST", body });
      if (!res.ok) { setError(await res.text()); return; }
      const data: VisionResult = await res.json();
      setResult(data);
      setActiveTab("caption");
    } catch {
      setError("Cannot connect to backend. Is the .NET API running on port 5236?");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const info = activeTab !== "setup" ? TAB_INFO[activeTab as Exclude<Tab, "setup">] : null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <div className="text-xs text-gray-400 mb-1">Azure Labs → Chapter 5</div>
          <h1 className="text-xl font-bold text-gray-900">👁️ Azure AI Vision Lab</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload an image — then click each tab to see the results and the exact code that produced them.
          </p>
        </div>

        {/* ── Drop zone ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl flex items-center justify-center cursor-pointer transition-all
              min-h-[340px]
              ${isDragging
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Uploaded"
                className="max-h-[420px] max-w-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-center">
                <div className="text-6xl mb-4 text-gray-200">📷</div>
                <p className="text-sm font-medium text-gray-500">Drop an image here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">JPEG · PNG · BMP · WebP — max 10 MB</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 items-center">
            <button
              onClick={analyze}
              disabled={!imageFile || loading}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl
                hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  Analyzing...
                </>
              ) : "Analyze Image"}
            </button>
            {imageFile && <span className="text-xs text-gray-400">{imageFile.name}</span>}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {/* ── Results + Code panel ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">

          {/* Left: tabs + explanation + results */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Tab buttons */}
            <div className="grid grid-cols-5 border-b border-gray-100">
              {(Object.keys(TAB_INFO) as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 flex flex-col items-center gap-0.5 text-xs font-semibold transition-colors
                    ${activeTab === tab
                      ? "border-b-2 border-blue-500 text-blue-600 bg-blue-50"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                >
                  <span className="text-base">{TAB_INFO[tab].icon}</span>
                  <span>{tab === "ocr" ? "OCR" : TAB_INFO[tab].title}</span>
                </button>
              ))}
              <button
                onClick={() => setActiveTab("setup")}
                className={`py-3 flex flex-col items-center gap-0.5 text-xs font-semibold transition-colors
                  ${activeTab === "setup"
                    ? "border-b-2 border-blue-500 text-blue-600 bg-blue-50"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <span className="text-base">⚙️</span>
                <span>Setup</span>
              </button>
            </div>

            {/* Explanation */}
            {info && (
              <div className="p-5 border-b border-gray-100 bg-gray-50 space-y-1.5">
                <h2 className="text-sm font-bold text-gray-900">{info.icon} {info.title}</h2>
                <p className="text-xs text-gray-700 leading-relaxed">{info.what}</p>
                <p className="text-xs text-gray-500 leading-relaxed italic">{info.how}</p>
              </div>
            )}

            {/* Results area */}
            <div className="p-5 min-h-[200px]">
              {!result && !loading && activeTab !== "setup" && (
                <p className="text-xs text-gray-400 text-center mt-10">
                  Upload an image and click Analyze to see results here
                </p>
              )}
              {loading && (
                <p className="text-xs text-gray-400 text-center mt-10">Calling Azure AI Vision...</p>
              )}

              {/* Caption results */}
              {result && activeTab === "caption" && (
                <div>
                  {result.caption ? (
                    <>
                      <p className="text-sm font-medium text-gray-900 leading-relaxed mb-3">
                        &ldquo;{result.caption}&rdquo;
                      </p>
                      {result.captionConfidence != null && (
                        <span className={`text-xs border px-2.5 py-1 rounded-full font-medium ${confColor(result.captionConfidence)}`}>
                          Confidence: {pct(result.captionConfidence)}
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">No caption generated.</p>
                  )}
                </div>
              )}

              {/* Tags results */}
              {result && activeTab === "tags" && (
                <div>
                  {result.tags.length === 0 ? (
                    <p className="text-xs text-gray-400">No tags detected.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {result.tags.map((t) => (
                        <span key={t.name} className={`text-xs border px-2.5 py-1 rounded-full font-medium ${confColor(t.confidence)}`}>
                          {t.name} <span className="opacity-60">{pct(t.confidence)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Objects results */}
              {result && activeTab === "objects" && (
                <div className="space-y-2">
                  {result.objects.length === 0 ? (
                    <p className="text-xs text-gray-400">No objects detected.</p>
                  ) : result.objects.map((o, i) => (
                    <div key={i} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2">
                      <div>
                        <span className="text-xs font-medium text-gray-900 capitalize">{o.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{o.width}×{o.height}px @ ({o.left},{o.top})</span>
                      </div>
                      <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${confColor(o.confidence)}`}>
                        {pct(o.confidence)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* OCR results */}
              {result && activeTab === "ocr" && (
                <div>
                  {result.readLines.length === 0 ? (
                    <p className="text-xs text-gray-400">No text detected in the image.</p>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-0.5">
                      {result.readLines.map((line, i) => (
                        <p key={i} className="text-xs text-gray-800 leading-relaxed">{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Azure Setup guide */}
              {activeTab === "setup" && (
                <div className="space-y-4">
                  <h2 className="text-sm font-bold text-gray-900">⚙️ Azure AI Vision — Quick Setup</h2>
                  <div className="space-y-3">
                    {([
                      ["1", "Create Resource", "Azure Portal → Create a resource → search Computer Vision → Create"],
                      ["2", "Choose Pricing", "Free F0 (5,000 calls/month, 1/sec) for learning · Standard S1 for production"],
                      ["3", "Best Region", "East US recommended — newest caption models and best feature availability"],
                      ["4", "Get Credentials", "Resource → Keys and Endpoint → copy KEY 1 and Endpoint URL"],
                      ["5", "Update Config", "Paste into appsettings.json under AzureVision (exact format shown on the right →)"],
                      ["6", "Restart API", "dotnet run — VisionService reads config at startup via IConfiguration"],
                    ] as const).map(([step, title, desc]) => (
                      <div key={step} className="flex gap-3 items-start">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">{title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
                    <p className="font-semibold text-amber-800 mb-1">Pricing tip</p>
                    <p className="text-amber-700">Free F0: 5,000 calls/month, 1 req/sec — perfect for this course. Upgrade to S1 (~$1 per 1,000 calls) when you need more.</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs">
                    <p className="font-semibold text-blue-800 mb-1">AI-102 exam tip</p>
                    <p className="text-blue-700">Know the difference: <strong>Computer Vision</strong> = images. <strong>Document Intelligence</strong> = structured forms and PDFs. <strong>Azure AI Search</strong> = full-text + vector search at scale.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: code panel */}
          <div className="bg-gray-900 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            {/* Title bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-2 text-xs text-gray-400 font-mono">
                  {activeTab === "setup" ? "appsettings.json" : "Services/VisionService.cs"}
                </span>
              </div>
              <span className="text-xs text-gray-600 italic">click a tab to highlight its section</span>
            </div>

            {/* Code lines */}
            <div
              ref={codeScrollRef}
              className="overflow-y-auto font-mono text-xs leading-5"
              style={{ maxHeight: "560px" }}
            >
              {activeTab === "setup" ? (
                <div className="p-4">
                  {[
                    `{`,
                    `  "AzureVision": {`,
                    `    "Endpoint": "https://YOUR-NAME.cognitiveservices.azure.com/",`,
                    `    "ApiKey":   "YOUR-KEY-1-HERE"`,
                    `  }`,
                    `}`,
                  ].map((line, i) => (
                    <div key={i} className="flex border-l-2 border-yellow-400 bg-yellow-300/15">
                      <span className="select-none text-gray-600 w-9 shrink-0 text-right pr-3 py-0.5">{i + 1}</span>
                      <span className="py-0.5 pr-4 whitespace-pre text-gray-100">{line}</span>
                    </div>
                  ))}
                  <div className="mt-6 px-3 space-y-3 text-xs text-gray-400">
                    <div>
                      <p className="text-gray-300 font-semibold mb-1">Where to find the values</p>
                      <p>Azure Portal → your Vision resource → Keys and Endpoint</p>
                    </div>
                    <div>
                      <p className="text-gray-300 font-semibold mb-1">How the code reads it</p>
                      <p className="text-gray-500">VisionService.cs constructor:</p>
                      <p className="text-green-400 mt-1">config[&quot;AzureVision:Endpoint&quot;]</p>
                      <p className="text-green-400">config[&quot;AzureVision:ApiKey&quot;]</p>
                    </div>
                    <div>
                      <p className="text-gray-300 font-semibold mb-1">NuGet package</p>
                      <p className="text-blue-400">Azure.AI.Vision.ImageAnalysis v1.0.0</p>
                    </div>
                    <div>
                      <p className="text-gray-300 font-semibold mb-1">Best region for this SDK</p>
                      <p>East US · West Europe · Southeast Asia</p>
                    </div>
                  </div>
                </div>
              ) : (
                CODE_LINES.map((line, i) => {
                  const highlighted = HIGHLIGHTS[activeTab].has(i);
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        if (el) lineRefs.current.set(i, el);
                        else lineRefs.current.delete(i);
                      }}
                      className={`flex transition-colors ${
                        highlighted
                          ? "bg-yellow-300/15 border-l-2 border-yellow-400"
                          : "border-l-2 border-transparent"
                      }`}
                    >
                      <span className="select-none text-gray-600 w-9 shrink-0 text-right pr-3 py-0.5">
                        {i + 1}
                      </span>
                      <span className={`py-0.5 pr-4 whitespace-pre ${highlighted ? "text-gray-100" : "text-gray-500"}`}>
                        {line || " "}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Architecture flow ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-bold text-gray-900 mb-1">How it all connects</h2>
          <p className="text-xs text-gray-400 mb-5">Follow the request from the browser all the way to Azure and back.</p>

          <div className="flex flex-wrap items-start gap-2">
            {/* Step 1 */}
            <div className="flex-1 min-w-[130px] rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs font-bold text-blue-800 mb-2">① Browser</div>
              <div className="text-xs text-blue-700 leading-snug">User drops an image</div>
              <div className="text-xs text-blue-700 leading-snug">FormData POST →</div>
              <div className="mt-2 text-xs font-mono text-blue-600 bg-blue-100 rounded px-1.5 py-0.5">
                /api/vision/analyze
              </div>
            </div>

            <div className="text-gray-300 text-lg self-center pt-1">→</div>

            {/* Step 2 */}
            <div className="flex-1 min-w-[130px] rounded-xl border border-purple-200 bg-purple-50 p-3">
              <div className="text-xs font-bold text-purple-800 mb-2">② VisionController.cs</div>
              <div className="text-xs text-purple-700 leading-snug">Validates file type</div>
              <div className="text-xs text-purple-700 leading-snug">Validates 10 MB limit</div>
              <div className="text-xs text-purple-700 leading-snug">Calls AnalyzeAsync()</div>
            </div>

            <div className="text-gray-300 text-lg self-center pt-1">→</div>

            {/* Step 3 */}
            <div className="flex-1 min-w-[130px] rounded-xl border border-green-200 bg-green-50 p-3">
              <div className="text-xs font-bold text-green-800 mb-2">③ VisionService.cs</div>
              <div className="text-xs text-green-700 leading-snug">Sets VisualFeatures flags</div>
              <div className="text-xs text-green-700 leading-snug">Calls ImageAnalysisClient</div>
              <div className="text-xs text-green-700 leading-snug">Maps SDK → our records</div>
            </div>

            <div className="text-gray-300 text-lg self-center pt-1">→</div>

            {/* Step 4 */}
            <div className="flex-1 min-w-[130px] rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-bold text-amber-800 mb-2">④ Azure AI Vision</div>
              <div className="text-xs text-amber-700 leading-snug">Runs ML models</div>
              <div className="text-xs text-amber-700 leading-snug">Caption + Tags +</div>
              <div className="text-xs text-amber-700 leading-snug">Objects + OCR text</div>
            </div>

            <div className="text-gray-300 text-lg self-center pt-1">→</div>

            {/* Step 5 */}
            <div className="flex-1 min-w-[130px] rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-bold text-gray-800 mb-2">⑤ JSON Response</div>
              <div className="text-xs text-gray-600 leading-snug">VisionAnalysisResult</div>
              <div className="text-xs text-gray-600 leading-snug">serialised to JSON</div>
              <div className="text-xs text-gray-600 leading-snug">→ displayed in tabs</div>
            </div>
          </div>

          {/* File key */}
          <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
            <span><strong className="text-purple-700">VisionController.cs</strong> — Controllers/VisionController.cs</span>
            <span><strong className="text-green-700">VisionService.cs</strong> — Services/VisionService.cs</span>
            <span><strong className="text-amber-700">ImageAnalysisClient</strong> — Azure.AI.Vision.ImageAnalysis NuGet v1.0</span>
          </div>
        </div>

      </div>
    </div>
  );
}
