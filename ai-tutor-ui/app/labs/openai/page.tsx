"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

type PageTab  = "rag" | "prompt" | "setup";
type RagPhase = "upload" | "chunks" | "embed" | "ask";
type PromptHL = "history" | "params" | "stream";

type PlaygroundChunk = { id: number; text: string };
type EmbedPreview    = { chunkId: number; chunkPreview: string; firstDims: number[]; totalDims: number };
type ScoredChunk     = { chunkId: number; text: string; score: number };
type AskResult       = { questionEmbedding: number[]; allScores: ScoredChunk[]; topK: ScoredChunk[]; reranked: string[]; answer: string };
type ChatMsg         = { role: "user" | "assistant"; content: string };

// ── Embedded code files (from actual source) ──────────────────────────────────

const CHUNKING_CODE = `namespace AIPathwayLab.Api.Services;

public class ChunkingService
{
    public List<string> ChunkText(string text, int chunkSize = 300, int overlap = 50)
    {
        var chunks = new List<string>();

        for (int i = 0; i < text.Length; i += chunkSize - overlap)
        {
            var length = Math.Min(chunkSize, text.Length - i);

            chunks.Add(text.Substring(i, length));
        }

        return chunks;
    }
}`;

const RAG_CODE = `using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Embeddings;
using AIPathwayLab.Api.AI;

namespace AIPathwayLab.Api.Services;

public class RagService
{
    private readonly Kernel _kernel;
    private readonly VectorStore _store;
    private readonly ChunkingService _chunker;

    public RagService(Kernel kernel, VectorStore store, ChunkingService chunker)
    {
        _kernel = kernel;
        _store = store;
        _chunker = chunker;
    }

    public async Task AddDocumentAsync(string text)
    {
        var embeddingService = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();

        var chunks = _chunker.ChunkText(text);

        foreach (var chunk in chunks)
        {
            var vector = await embeddingService.GenerateEmbeddingAsync(chunk);

            _store.Documents.Add((chunk, vector));
        }
    }

    public async Task<List<string>> SearchAsync(string question, int topK = 3)
    {
        var embeddingService = _kernel.GetRequiredService<ITextEmbeddingGenerationService>();

        var queryVector = await embeddingService.GenerateEmbeddingAsync(question);

        var candidates = _store.Documents
            .Select(d => new
            {
                Text = d.Text,
                Score = CosineSimilarity(d.Vector.Span, queryVector.Span)
            })
            .OrderByDescending(x => x.Score)
            .Take(10)   // get more candidates first
            .Select(x => x.Text)
            .ToList();

        return candidates;
    }

    private static float CosineSimilarity(ReadOnlySpan<float> v1, ReadOnlySpan<float> v2)
    {
        float dot = 0;
        float mag1 = 0;
        float mag2 = 0;

        for (int i = 0; i < v1.Length; i++)
        {
            dot += v1[i] * v2[i];
            mag1 += v1[i] * v1[i];
            mag2 += v2[i] * v2[i];
        }

        return dot / (MathF.Sqrt(mag1) * MathF.Sqrt(mag2));
    }
}`;

const RERANKER_CODE = `using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;

namespace AIPathwayLab.Api.Services;

public class RerankerService
{
    private readonly Kernel _kernel;

    public RerankerService(Kernel kernel)
    {
        _kernel = kernel;
    }

    public async Task<List<string>> RerankAsync(string question, List<string> chunks, int topK = 3)
    {
        var chat = _kernel.GetRequiredService<IChatCompletionService>();

        var prompt = $"""
You are a retrieval ranking system.

Question:
{question}

Rank the following text chunks by relevance to the question.

Chunks:
{string.Join("\\n---\\n", chunks)}

Return only the {topK} most relevant chunks.
""";

        var result = await chat.GetChatMessageContentAsync(prompt);

        return result.Content?
            .Split("---")
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrEmpty(x))
            .Take(topK)
            .ToList() ?? new List<string>();
    }
}`;

const PROMPT_CODE = `// 1. Build ChatHistory — system prompt shapes AI personality
var history = new ChatHistory();
history.AddSystemMessage(req.SystemPrompt);  // ← your system prompt

foreach (var msg in req.ConversationHistory ?? [])
{
    if (msg.Role == "user")           history.AddUserMessage(msg.Content);
    else if (msg.Role == "assistant") history.AddAssistantMessage(msg.Content);
}
history.AddUserMessage(req.Message);

// 2. Set model parameters — control creativity & length
var settings = new AzureOpenAIPromptExecutionSettings
{
    Temperature = req.Temperature,  // 0.0 = focused  1.0 = creative  1.5 = random
    MaxTokens   = req.MaxTokens,    // caps the response length
};

// 3. Stream response token by token back to the browser
await foreach (var chunk in chat.GetStreamingChatMessageContentsAsync(
    history, settings, _kernel))
{
    var escaped = chunk.Content?.Replace("\\n", "\\\\n") ?? "";
    await Response.WriteAsync($"data: {escaped}\\n\\n");
    await Response.Body.FlushAsync();
}`;

// ── Line highlight ranges (0-indexed) ─────────────────────────────────────────

const CHUNKING_LINES  = CHUNKING_CODE.split("\n");
const RAG_LINES       = RAG_CODE.split("\n");
const RERANKER_LINES  = RERANKER_CODE.split("\n");
const PROMPT_LINES    = PROMPT_CODE.split("\n");

const CHUNK_HL  = new Set([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const EMBED_HL  = new Set([19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
const SEARCH_HL = new Set([33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
const COSINE_HL = new Set([53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68]);
const RERANK_HL = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]);
const HIST_HL   = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const PARAM_HL  = new Set([11, 12, 13, 14, 15, 16]);
const STREAM_HL = new Set([18, 19, 20, 21, 22, 23, 24, 25]);

// ── Sample document for quick testing ─────────────────────────────────────────

const SAMPLE_TEXT = `Azure AI Services is a suite of AI APIs that developers use to build intelligent applications. The suite includes Vision, Speech, Language, and Decision services.

Azure AI Vision allows you to analyze images and extract information. It supports image captioning, object detection, OCR text extraction, and smart cropping.

Azure OpenAI Service provides access to GPT-4o and other OpenAI models. It supports streaming responses, function calling, and structured output.

Retrieval-Augmented Generation (RAG) is a technique combining information retrieval with text generation. Documents are split into chunks and converted to numerical vectors called embeddings. When a user asks a question, the most similar document chunks are retrieved using cosine similarity. These chunks provide context for the language model to generate an accurate, grounded answer.

Cosine similarity measures the angle between two vectors. A score of 1.0 means identical direction (very similar), while 0.0 means perpendicular (unrelated). Embeddings from Azure OpenAI have 1536 dimensions.

Azure AI Search supports full-text search, vector search, and hybrid search. It integrates with Azure OpenAI to enable semantic search that understands the meaning behind queries rather than just matching keywords.`;

// ── System Prompt Presets ─────────────────────────────────────────────────────

const PRESETS = [
  { label: "AI Tutor",         prompt: "You are an expert Azure AI tutor helping someone prepare for the AI-102 exam. Ask follow-up questions to check understanding. Be encouraging and concise." },
  { label: "Formal Expert",    prompt: "You are a senior Azure Solutions Architect. Be precise, technical, and always recommend best practices. Keep responses structured with bullet points." },
  { label: "ELI5",             prompt: "Explain everything like I am 5 years old. Use simple words, fun analogies, and avoid technical jargon. Keep responses short and engaging." },
  { label: "Devil's Advocate", prompt: "Challenge every statement. Find edge cases, exceptions, and potential problems. Be constructive but critical. Always ask 'but what about...?'" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toFixed(4); }

function scoreColor(s: number) {
  if (s >= 0.88) return "bg-green-500";
  if (s >= 0.82) return "bg-amber-400";
  return "bg-red-400";
}

// ── Code Panel component ──────────────────────────────────────────────────────

function CodePanel({
  title, lines, highlights, scrollTo,
}: { title: string; lines: string[]; highlights: Set<number>; scrollTo: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs  = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const el        = lineRefs.current.get(scrollTo);
    const container = scrollRef.current;
    if (!el || !container) return;
    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + top - 60, behavior: "smooth" });
  }, [scrollTo, highlights]);

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700 shrink-0">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-2 text-xs text-gray-400 font-mono">{title}</span>
        <span className="ml-auto text-xs text-gray-600 italic">highlighted = active logic</span>
      </div>

      {/* Lines */}
      <div ref={scrollRef} className="overflow-y-auto font-mono text-xs leading-5 flex-1">
        {lines.map((line, i) => {
          const hl = highlights.has(i);
          return (
            <div
              key={i}
              ref={(el) => { if (el) lineRefs.current.set(i, el); else lineRefs.current.delete(i); }}
              className={`flex transition-colors ${hl ? "bg-yellow-300/15 border-l-2 border-yellow-400" : "border-l-2 border-transparent"}`}
            >
              <span className="select-none text-gray-600 w-9 shrink-0 text-right pr-3 py-0.5">{i + 1}</span>
              <span className={`py-0.5 pr-4 whitespace-pre ${hl ? "text-gray-100" : "text-gray-500"}`}>{line || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vector preview bar ────────────────────────────────────────────────────────

function VectorBar({ dims }: { dims: number[] }) {
  const max = Math.max(...dims.map(Math.abs), 0.001);
  return (
    <div className="flex items-end gap-0.5 h-8 mt-1">
      {dims.map((v, i) => {
        const pct = Math.abs(v) / max;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className={`w-4 rounded-sm transition-all ${v >= 0 ? "bg-blue-400" : "bg-red-400"}`}
              style={{ height: `${Math.round(pct * 28)}px` }}
            />
          </div>
        );
      })}
      <span className="text-gray-500 text-xs ml-1 self-center">…+{(dims[dims.length - 1] ? 1536 - dims.length : 0)} more</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OpenAILabPage() {
  // Page tabs
  const [pageTab, setPageTab] = useState<PageTab>("rag");

  // RAG state
  const [ragPhase,   setRagPhase]   = useState<RagPhase>("upload");
  const [inputText,  setInputText]  = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [sessionId,  setSessionId]  = useState<string | null>(null);
  const [chunks,     setChunks]     = useState<PlaygroundChunk[]>([]);
  const [embeds,     setEmbeds]     = useState<EmbedPreview[]>([]);
  const [askResult,  setAskResult]  = useState<AskResult | null>(null);
  const [question,   setQuestion]   = useState("");
  const [topK,       setTopK]       = useState(3);
  const [ragLoading, setRagLoading] = useState<string | null>(null);
  const [ragError,   setRagError]   = useState<string | null>(null);

  // Prompt state
  const [systemPrompt,    setSystemPrompt]    = useState(PRESETS[0].prompt);
  const [temperature,     setTemperature]     = useState(0.7);
  const [maxTokens,       setMaxTokens]       = useState(800);
  const [chatHistory,     setChatHistory]     = useState<ChatMsg[]>([]);
  const [chatInput,       setChatInput]       = useState("");
  const [chatStreaming,   setChatStreaming]    = useState(false);
  const [streamContent,   setStreamContent]   = useState("");
  const [promptHL,        setPromptHL]        = useState<PromptHL>("history");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, streamContent]);

  // ── RAG handlers ───────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setInputText(ev.target?.result as string ?? "");
    reader.readAsText(file);
  };

  const uploadAndChunk = async () => {
    if (!inputText.trim()) return;
    setRagLoading("Splitting document into chunks…");
    setRagError(null);
    try {
      const body = new FormData();
      body.append("text", inputText);
      const res = await fetch(`${API_URL}/api/openailab/rag/upload`, { method: "POST", body });
      if (!res.ok) { setRagError(await res.text()); return; }
      const data = await res.json();
      setSessionId(data.sessionId);
      setChunks(data.chunks);
      setRagPhase("chunks");
    } catch { setRagError("Cannot connect to backend."); }
    finally { setRagLoading(null); }
  };

  const generateEmbeddings = async () => {
    if (!sessionId) return;
    setRagLoading("Calling Azure OpenAI Embeddings API for each chunk… (this may take a few seconds)");
    setRagError(null);
    try {
      const res = await fetch(`${API_URL}/api/openailab/rag/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) { setRagError(await res.text()); return; }
      const data = await res.json();
      setEmbeds(data.previews);
      setRagPhase("embed");
    } catch { setRagError("Cannot connect to backend."); }
    finally { setRagLoading(null); }
  };

  const askQuestion = async () => {
    if (!sessionId || !question.trim()) return;
    setRagLoading("Embedding question → Cosine similarity → Reranking → Generating answer…");
    setRagError(null);
    try {
      const res = await fetch(`${API_URL}/api/openailab/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, question, topK }),
      });
      if (!res.ok) { const d = await res.json(); setRagError(d.error ?? "Error"); return; }
      const data: AskResult = await res.json();
      setAskResult(data);
      setRagPhase("ask");
    } catch { setRagError("Cannot connect to backend."); }
    finally { setRagLoading(null); }
  };

  const resetRag = () => {
    setRagPhase("upload"); setInputText(""); setSessionId(null);
    setChunks([]); setEmbeds([]); setAskResult(null); setQuestion(""); setRagError(null);
  };

  // ── System Prompt chat ──────────────────────────────────────────────────────

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatStreaming) return;
    const userMsg: ChatMsg = { role: "user", content: chatInput };
    setChatHistory(prev => [...prev, userMsg]);
    const currentInput = chatInput;
    setChatInput("");
    setChatStreaming(true);
    setStreamContent("");
    setPromptHL("stream");

    try {
      const res = await fetch(`${API_URL}/api/openailab/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          message: currentInput,
          temperature,
          maxTokens,
          conversationHistory: chatHistory,
        }),
      });

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full   = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const token = line.replace(/^data: ?/, "").replace(/\\n/g, "\n");
            if (token === "[DONE]" || !token) continue;
            full += token;
            setStreamContent(full);
          }
        }
      }

      setChatHistory(prev => [...prev, { role: "assistant", content: full }]);
      setStreamContent("");
    } finally {
      setChatStreaming(false);
      setPromptHL("history");
    }
  }, [chatInput, chatStreaming, systemPrompt, temperature, maxTokens, chatHistory]);

  // ── Code panel config per RAG phase ────────────────────────────────────────

  const codeConfig = {
    upload: { title: "Services/ChunkingService.cs",  lines: CHUNKING_LINES, hl: CHUNK_HL,  scroll: 4  },
    chunks: { title: "Services/ChunkingService.cs",  lines: CHUNKING_LINES, hl: CHUNK_HL,  scroll: 4  },
    embed:  { title: "Services/RagService.cs",        lines: RAG_LINES,      hl: EMBED_HL,  scroll: 19 },
    ask:    { title: "Services/RerankerService.cs",   lines: RERANKER_LINES, hl: RERANK_HL, scroll: 14 },
  }[ragPhase];

  const promptCode = {
    title: "Controllers/OpenAILabController.cs",
    lines: PROMPT_LINES,
    hl:    promptHL === "history" ? HIST_HL : promptHL === "params" ? PARAM_HL : STREAM_HL,
    scroll: promptHL === "history" ? 0 : promptHL === "params" ? 11 : 18,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="text-xs text-gray-400 mb-1">Azure Labs → Chapter 6</div>
          <h1 className="text-xl font-bold text-gray-900">🧠 Azure OpenAI Lab</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Build a RAG pipeline from scratch and experiment with System Prompts — see the code for every step.
          </p>
        </div>

        {/* Page tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {([["rag", "📄 RAG Pipeline"], ["prompt", "💬 System Prompt"], ["setup", "⚙️ Azure Setup"]] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setPageTab(tab)}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                pageTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ RAG TAB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {pageTab === "rag" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">

              {/* Left: pipeline stepper */}
              <div className="space-y-4">

                {/* Step indicator */}
                <div className="flex items-center gap-2 text-xs">
                  {(["upload","chunks","embed","ask"] as RagPhase[]).map((p, i) => {
                    const labels = ["① Upload","② Chunk","③ Embed","④ Ask"];
                    const done = ["upload","chunks","embed","ask"].indexOf(ragPhase) > i;
                    const active = ragPhase === p;
                    return (
                      <span key={p} className={`px-2 py-1 rounded-full font-medium transition-colors ${
                        active ? "bg-blue-600 text-white" : done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                      }`}>{labels[i]}</span>
                    );
                  })}
                  {ragPhase !== "upload" && (
                    <button onClick={resetRag} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">Reset</button>
                  )}
                </div>

                {ragError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{ragError}</div>
                )}

                {ragLoading && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block shrink-0" />
                    {ragLoading}
                  </div>
                )}

                {/* Upload phase */}
                {ragPhase === "upload" && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 mb-1">① Upload a Document</h2>
                      <p className="text-xs text-gray-500">Paste text or drop a .txt file. The pipeline will chunk, embed, and let you query it.</p>
                    </div>

                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl px-4 py-2 text-xs text-center cursor-pointer transition-all ${
                        isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input ref={fileInputRef} type="file" accept=".txt" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setInputText(ev.target?.result as string ?? ""); r.readAsText(f); } }}
                      />
                      Drop a .txt file here or click to browse
                    </div>

                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Or paste text here…"
                      className="w-full h-40 text-xs font-mono border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-blue-400 text-gray-800"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => setInputText(SAMPLE_TEXT)}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                      >
                        Try sample text
                      </button>
                      <button
                        onClick={uploadAndChunk}
                        disabled={!inputText.trim() || !!ragLoading}
                        className="ml-auto text-xs px-5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 font-semibold"
                      >
                        Chunk Document →
                      </button>
                    </div>
                  </div>
                )}

                {/* Chunks phase */}
                {(ragPhase === "chunks" || ragPhase === "embed" || ragPhase === "ask") && chunks.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-gray-900">② Chunks ({chunks.length})</h2>
                      <span className="text-xs text-gray-400">300 chars · 50 overlap</span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {chunks.map((c) => (
                        <div key={c.id} className="border border-gray-100 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-bold text-blue-600">#{c.id}</span>
                            <span className="text-xs text-gray-400">{c.text.length} chars</span>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{c.text}</p>
                        </div>
                      ))}
                    </div>
                    {ragPhase === "chunks" && (
                      <button
                        onClick={generateEmbeddings}
                        disabled={!!ragLoading}
                        className="w-full text-xs px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 font-semibold"
                      >
                        Generate Embeddings →
                      </button>
                    )}
                  </div>
                )}

                {/* Embeddings phase */}
                {(ragPhase === "embed" || ragPhase === "ask") && embeds.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
                    <div>
                      <h2 className="text-sm font-bold text-gray-900 mb-0.5">③ Embeddings</h2>
                      <p className="text-xs text-gray-500">Each chunk → a 1536-dim float vector. Similar text = similar vectors.</p>
                    </div>
                    <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                      {embeds.slice(0, 6).map((e) => (
                        <div key={e.chunkId} className="border border-gray-100 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1.5 line-clamp-1">{e.chunkPreview}</p>
                          <div className="font-mono text-xs text-blue-600 mb-1">
                            [{e.firstDims.map(fmt).join(", ")}, …]
                          </div>
                          <VectorBar dims={e.firstDims} />
                        </div>
                      ))}
                      {embeds.length > 6 && <p className="text-xs text-gray-400 text-center">+{embeds.length - 6} more vectors</p>}
                    </div>

                    {ragPhase === "embed" && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-gray-600 font-medium w-16">Top-K: {topK}</label>
                          <input type="range" min={1} max={Math.min(5, chunks.length)} value={topK}
                            onChange={(e) => setTopK(+e.target.value)}
                            className="flex-1 h-1.5 accent-blue-600" />
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") askQuestion(); }}
                            placeholder="Ask a question about the document…"
                            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                          />
                          <button
                            onClick={askQuestion}
                            disabled={!question.trim() || !!ragLoading}
                            className="text-xs px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 font-semibold shrink-0"
                          >
                            Ask →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Ask phase — results */}
                {ragPhase === "ask" && askResult && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                    <h2 className="text-sm font-bold text-gray-900">④ Ask → Results</h2>

                    {/* Question embedding */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Question Embedding</div>
                      <div className="font-mono text-xs text-blue-600">[{askResult.questionEmbedding.map(fmt).join(", ")}, …]</div>
                      <VectorBar dims={askResult.questionEmbedding} />
                    </div>

                    {/* All similarity scores */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Cosine Similarity Scores</div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {askResult.allScores.slice(0, 8).map((s) => (
                          <div key={s.chunkId} className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-6">#{s.chunkId}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className={`h-2 rounded-full ${scoreColor(s.score)}`} style={{ width: `${Math.max(s.score * 100, 5)}%` }} />
                            </div>
                            <span className="text-xs font-mono text-gray-600 w-12 text-right">{fmt(s.score)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Top-K */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Top-{topK} Chunks</div>
                      <div className="space-y-1.5">
                        {askResult.topK.map((c, i) => (
                          <div key={i} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-amber-700">Rank {i+1}</span>
                              <span className="text-xs text-amber-500">score: {fmt(c.score)}</span>
                            </div>
                            <p className="text-xs text-gray-700 line-clamp-2">{c.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reranked */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">After LLM Reranking</div>
                      <div className="space-y-1.5">
                        {askResult.reranked.map((text, i) => (
                          <div key={i} className="border border-green-200 bg-green-50 rounded-lg px-3 py-2">
                            <span className="text-xs font-bold text-green-700 mr-2">#{i+1}</span>
                            <span className="text-xs text-gray-700">{text.slice(0, 120)}{text.length > 120 ? "…" : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Answer */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="text-xs font-bold text-blue-800 mb-1.5">GPT-4o Answer</div>
                      <p className="text-sm text-blue-900 leading-relaxed">{askResult.answer}</p>
                    </div>

                    <button onClick={() => { setAskResult(null); setQuestion(""); setRagPhase("embed"); }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline">Ask another question</button>
                  </div>
                )}
              </div>

              {/* Right: code panel */}
              <div style={{ minHeight: "560px" }} className="h-full">
                <CodePanel
                  title={codeConfig.title}
                  lines={codeConfig.lines}
                  highlights={codeConfig.hl}
                  scrollTo={codeConfig.scroll}
                />
              </div>
            </div>

            {/* Architecture flow */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-bold text-gray-900 mb-4">How RAG works end-to-end</h2>
              <div className="flex flex-wrap items-start gap-2">
                {[
                  { color: "bg-blue-50 border-blue-200", title: "① Upload", lines: ["Text → ChunkingService", "300 chars / 50 overlap", "Returns sessionId + chunks"] },
                  "→",
                  { color: "bg-purple-50 border-purple-200", title: "② Embed", lines: ["Each chunk →", "Azure OpenAI Embeddings", "1536-dim float vector"] },
                  "→",
                  { color: "bg-amber-50 border-amber-200", title: "③ Question", lines: ["Question also embedded", "Cosine similarity vs", "all stored chunk vectors"] },
                  "→",
                  { color: "bg-green-50 border-green-200", title: "④ Rerank", lines: ["LLM picks best chunks", "from Top-K candidates", "(RerankerService)"] },
                  "→",
                  { color: "bg-gray-50 border-gray-200", title: "⑤ Answer", lines: ["GPT-4o reads reranked", "chunks as context", "Generates grounded answer"] },
                ].map((step, i) =>
                  step === "→" ? (
                    <div key={i} className="text-gray-300 text-lg self-center pt-2">→</div>
                  ) : (
                    <div key={i} className={`flex-1 min-w-[110px] rounded-xl border p-3 ${(step as { color: string }).color}`}>
                      <div className="text-xs font-bold text-gray-800 mb-1.5">{(step as { title: string }).title}</div>
                      {(step as { lines: string[] }).lines.map((l, j) => <div key={j} className="text-xs text-gray-500 leading-snug">{l}</div>)}
                    </div>
                  )
                )}
              </div>
            </div>
          </>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ SYSTEM PROMPT TAB ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {pageTab === "prompt" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">

              {/* Left: controls */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 mb-3">Presets</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.label}
                        onClick={() => { setSystemPrompt(p.prompt); setPromptHL("history"); }}
                        className={`text-xs px-3 py-2 rounded-lg border text-left transition-colors ${
                          systemPrompt === p.prompt
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-200 text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                    System Prompt
                    <span className="ml-2 text-gray-400 font-normal">— shapes AI personality</span>
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => { setSystemPrompt(e.target.value); setPromptHL("history"); }}
                    className="w-full h-32 text-xs border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:border-blue-400 text-gray-800"
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-700">Temperature: {temperature.toFixed(1)}</label>
                      <span className="text-xs text-gray-400">
                        {temperature < 0.3 ? "Focused / Deterministic"
                          : temperature < 0.8 ? "Balanced"
                          : temperature < 1.2 ? "Creative"
                          : "Very Random"}
                      </span>
                    </div>
                    <input type="range" min={0} max={1.5} step={0.1} value={temperature}
                      onChange={(e) => { setTemperature(+e.target.value); setPromptHL("params"); }}
                      className="w-full h-1.5 accent-blue-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>0.0 Deterministic</span>
                      <span>1.5 Random</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Controls randomness. Low = same answer every time. High = more creative but less consistent.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-gray-700">Max Tokens: {maxTokens}</label>
                      <span className="text-xs text-gray-400">≈ {Math.round(maxTokens * 0.75)} words</span>
                    </div>
                    <input type="range" min={100} max={2000} step={100} value={maxTokens}
                      onChange={(e) => { setMaxTokens(+e.target.value); setPromptHL("params"); }}
                      className="w-full h-1.5 accent-blue-600" />
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Maximum length of the response. 1 token ≈ 0.75 words. GPT-4o supports up to 16,384 output tokens.
                    </p>
                  </div>
                </div>

                {chatHistory.length > 0 && (
                  <button onClick={() => { setChatHistory([]); setStreamContent(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">
                    Clear conversation
                  </button>
                )}
              </div>

              {/* Right: chat */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: "500px" }}>
                <div className="px-5 py-3 border-b border-gray-100 text-xs text-gray-500 font-medium">
                  Chat — powered by GPT-4o with your system prompt above
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {chatHistory.length === 0 && !streamContent && (
                    <p className="text-xs text-gray-400 text-center mt-12">
                      Send a message and watch how the system prompt changes the response.
                    </p>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-gray-100 text-gray-800 rounded-bl-sm"
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {streamContent && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                        {streamContent}
                        <span className="inline-block w-1 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Type a message…"
                    disabled={chatStreaming}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-400 disabled:bg-gray-50"
                  />
                  <button
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatStreaming}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 font-semibold"
                  >
                    {chatStreaming ? "…" : "Send"}
                  </button>
                </div>
              </div>
            </div>

            {/* Code panel for System Prompt */}
            <div style={{ height: "280px" }}>
              <CodePanel
                title={promptCode.title}
                lines={promptCode.lines}
                highlights={promptCode.hl}
                scrollTo={promptCode.scroll}
              />
            </div>

            {/* Explanation */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-blue-900 mb-2">What AI-102 tests about System Prompts & Parameters</h2>
              <ul className="text-xs text-blue-800 space-y-1.5 list-disc list-inside leading-relaxed">
                <li><strong>System Prompt</strong> — Added to every request as a system message. Sets role, tone, and constraints for the model.</li>
                <li><strong>Temperature</strong> — Controls output randomness. 0.0 = deterministic (same answer every time). 1.0+ = creative and varied.</li>
                <li><strong>Max Tokens</strong> — Caps the response length. 1 token ≈ 4 characters ≈ 0.75 words in English.</li>
                <li><strong>ChatHistory</strong> — Multi-turn conversations require sending the full message history on each request (stateless API).</li>
                <li><strong>Streaming</strong> — Use Server-Sent Events (SSE) to stream tokens as they are generated instead of waiting for the full response.</li>
              </ul>
            </div>
          </>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ SETUP TAB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {pageTab === "setup" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: Step-by-step */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-sm font-bold text-gray-900 mb-4">🚀 Setting up Azure OpenAI</h2>
                <div className="space-y-4">
                  {([
                    ["1", "Request Access", "Azure OpenAI is gated — apply at aka.ms/oai/access. Approval takes 1–3 business days. Once approved, you can create resources."],
                    ["2", "Create Resource", "Azure Portal → Create a resource → search Azure OpenAI → Create. Choose East US or East US 2 for best GPT-4o availability. Pricing tier: Standard S0."],
                    ["3", "Get Credentials", "Resource → Keys and Endpoint → copy KEY 1 and the Endpoint URL (ends with .openai.azure.com/)"],
                    ["4", "Deploy Chat Model", "Go to Azure OpenAI Studio (oai.azure.com) → Deployments → Deploy base model → gpt-4o → deployment name: tutor-gpt"],
                    ["5", "Deploy Embedding Model", "In Azure OpenAI Studio → Deploy base model → text-embedding-ada-002 → deployment name: tutor-embedding"],
                    ["6", "Update appsettings.json", "Add the endpoint, key, and deployment names (see config panel on the right →)"],
                    ["7", "Restart the API", "dotnet run — KernelFactory.cs reads config and registers both models on startup"],
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
              </div>

              {/* Pricing + Tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-xs space-y-2">
                <p className="font-semibold text-amber-800">Pricing (approximate)</p>
                <div className="space-y-1 text-amber-700">
                  <p><strong>GPT-4o:</strong> ~$5 per 1M input tokens · ~$15 per 1M output tokens</p>
                  <p><strong>text-embedding-ada-002:</strong> ~$0.10 per 1M tokens</p>
                  <p className="text-amber-600 mt-1">For this course, expect &lt; $1/month. Very low usage during learning.</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-xs space-y-2">
                <p className="font-semibold text-blue-800">AI-102 exam tip</p>
                <ul className="text-blue-700 space-y-1 list-disc list-inside leading-relaxed">
                  <li>Azure OpenAI ≠ OpenAI — it&apos;s the same models but hosted in your Azure tenant</li>
                  <li>Deployment name is what your code uses — it does not have to match the model name</li>
                  <li>One resource can host multiple deployments (chat + embedding from the same endpoint)</li>
                  <li>Use Semantic Kernel or the Azure OpenAI SDK — both are valid for the exam</li>
                </ul>
              </div>
            </div>

            {/* Right: Config code + Common errors */}
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-700">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-2 text-xs text-gray-400 font-mono">appsettings.json</span>
                </div>
                <div className="p-4 font-mono text-xs">
                  {[
                    `{`,
                    `  "AzureOpenAI": {`,
                    `    "Endpoint":            "https://YOUR-NAME.openai.azure.com/",`,
                    `    "ApiKey":              "YOUR-KEY-1-HERE",`,
                    `    "DeploymentName":      "tutor-gpt",`,
                    `    "EmbeddingDeployment": "tutor-embedding"`,
                    `  }`,
                    `}`,
                  ].map((line, i) => (
                    <div key={i} className="flex border-l-2 border-yellow-400 bg-yellow-300/15">
                      <span className="select-none text-gray-600 w-9 shrink-0 text-right pr-3 py-0.5">{i + 1}</span>
                      <span className="py-0.5 pr-4 whitespace-pre text-gray-100">{line}</span>
                    </div>
                  ))}
                  <div className="mt-6 space-y-3 text-xs text-gray-400">
                    <div>
                      <p className="text-gray-300 font-semibold mb-1">How KernelFactory.cs reads it</p>
                      <p className="text-green-400">configuration[&quot;AzureOpenAI:Endpoint&quot;]</p>
                      <p className="text-green-400">configuration[&quot;AzureOpenAI:ApiKey&quot;]</p>
                      <p className="text-green-400">configuration[&quot;AzureOpenAI:DeploymentName&quot;]</p>
                      <p className="text-green-400">configuration[&quot;AzureOpenAI:EmbeddingDeployment&quot;]</p>
                    </div>
                    <div>
                      <p className="text-gray-300 font-semibold mb-1">NuGet packages used</p>
                      <p className="text-blue-400">Microsoft.SemanticKernel</p>
                      <p className="text-blue-400">Microsoft.SemanticKernel.Connectors.AzureOpenAI</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-xs font-bold text-gray-900 mb-3">Common errors & fixes</h3>
                <div className="space-y-2.5">
                  {([
                    ["AuthenticationFailure", "Wrong API key — re-copy KEY 1 from the Azure portal"],
                    ["DeploymentNotFound", "Deployment name in appsettings doesn't match the name in Azure OpenAI Studio"],
                    ["429 Too Many Requests", "Rate limit hit — reduce request frequency or upgrade quota in Azure portal"],
                    ["AccessDenied", "Azure OpenAI access not yet approved — check your application at aka.ms/oai/access"],
                    ["Model not available in region", "Try East US 2 or Sweden Central for the latest GPT-4o versions"],
                  ] as const).map(([error, fix]) => (
                    <div key={error} className="text-xs">
                      <p className="font-mono text-red-600 font-medium">{error}</p>
                      <p className="text-gray-500 mt-0.5">{fix}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
