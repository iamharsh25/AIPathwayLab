# AI Pathway Lab

A full-stack learning platform for the **Azure AI-102 (Azure AI Engineer)** certification.
Built with ASP.NET Core + Next.js — every Azure AI concept is implemented in the code so you learn by building.

---

## What's Inside

| Feature | Description |
|---|---|
| 💬 AI Tutor | Chat with a RAG-powered AI that knows the entire codebase |
| 📝 Mock Exam | 225 AI-102 practice questions with domain filtering |
| 🎯 Scenario Exam | Real-world architecture scenarios with multi-select support and mistake review |
| 🔬 Azure AI Vision Lab | Upload images and explore Caption, Tags, Objects, OCR results |
| 🧠 Azure OpenAI Lab | RAG pipeline visualiser and System Prompt playground |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | ASP.NET Core (.NET 10), Semantic Kernel 1.73, Azure OpenAI |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| AI Services | Azure OpenAI (GPT-4o + text-embedding-ada-002), Azure AI Vision |

---

## Prerequisites

Before you start, make sure you have these installed:

| Tool | Version | Download |
|---|---|---|
| .NET SDK | 10.0+ | https://dotnet.microsoft.com/download |
| Node.js | 20.0+ | https://nodejs.org |
| Git | Any | https://git-scm.com |

You also need:
- An **Azure OpenAI** resource with two model deployments:
  - `tutor-gpt` → GPT-4o
  - `tutor-embedding` → text-embedding-ada-002
- An **Azure AI Vision** (Computer Vision) resource

---

## Step-by-Step Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/iamharsh25/AIPathwayLab.git
cd AIPathwayLab
```

---

### Step 2 — Install backend NuGet packages

The packages are already listed in the `.csproj` file. Just run:

```bash
cd AIPathwayLab.Api
dotnet restore
```

This installs all four backend packages automatically:

| Package | Version | Purpose |
|---|---|---|
| `Microsoft.SemanticKernel` | 1.73.0 | AI orchestration, chat, planners |
| `Microsoft.SemanticKernel.Connectors.AzureOpenAI` | 1.73.0 | Azure OpenAI connector for SK |
| `Azure.AI.Vision.ImageAnalysis` | 1.0.0 | Azure AI Vision (caption, tags, OCR) |
| `Microsoft.AspNetCore.OpenApi` | 10.0.3 | Swagger / OpenAPI docs |
| `Swashbuckle.AspNetCore` | 10.1.4 | Swagger UI |

> If you ever need to add a package manually, use:
> ```bash
> dotnet add package <PackageName>
> ```

---

### Step 3 — Add your Azure credentials

Create the file `AIPathwayLab.Api/appsettings.Development.json`.
This file is **gitignored** — your keys will never be committed.

```bash
# From inside AIPathwayLab.Api/
touch appsettings.Development.json
```

Open it and paste the following, replacing the placeholder values with your own:

```json
{
  "AzureOpenAI": {
    "Endpoint": "https://<your-resource-name>.openai.azure.com/",
    "ApiKey": "<your-azure-openai-key>",
    "DeploymentName": "tutor-gpt",
    "EmbeddingDeployment": "tutor-embedding"
  },
  "AzureVision": {
    "Endpoint": "https://<your-resource-name>.cognitiveservices.azure.com/",
    "ApiKey": "<your-azure-vision-key>"
  }
}
```

> Find these values in **Azure Portal** → your resource → **Keys and Endpoint**

---

### Step 4 — Run the backend

```bash
# Make sure you are inside AIPathwayLab.Api/
cd AIPathwayLab.Api

dotnet build
dotnet run
```

You should see:

```
Now listening on: http://localhost:5236
Application started. Press Ctrl+C to shut down.
```

> **Keep this terminal open.** The backend must be running for the frontend to work.

---

### Step 5 — Install frontend dependencies

Open a **new terminal window** and run:

```bash
cd AIPathwayLab/ai-tutor-ui

npm install
```

This installs all frontend packages:

| Package | Purpose |
|---|---|
| `next` 16 | React framework (App Router, SSR) |
| `react` 19 | UI library |
| `react-dom` 19 | DOM rendering |
| `react-markdown` | Render markdown in AI chat responses |
| `remark-gfm` | GitHub-flavoured markdown (tables, task lists) |
| `tailwindcss` v4 | Utility-first CSS framework |
| `typescript` | Type safety |

---

### Step 6 — Run the frontend

```bash
# Still inside ai-tutor-ui/
npm run dev
```

You should see:

```
▲ Next.js 16
- Local: http://localhost:3000
✓ Ready in ~2s
```

---

### Step 7 — Open the app

Go to **http://localhost:3000** in your browser.

---

## Running Both Together (Quick Reference)

After the first-time setup, you only need two commands — one per terminal:

**Terminal 1 — Backend:**
```bash
cd AIPathwayLab/AIPathwayLab.Api
dotnet run
```

**Terminal 2 — Frontend:**
```bash
cd AIPathwayLab/ai-tutor-ui
npm run dev
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `dotnet: command not found` | Install .NET 10 SDK from https://dotnet.microsoft.com/download |
| `npm: command not found` | Install Node.js 20+ from https://nodejs.org |
| Frontend shows "Cannot connect to backend" | Make sure `dotnet run` is running in a separate terminal |
| Azure errors on startup | Double-check your keys and endpoints in `appsettings.Development.json` |
| Port 5236 already in use | Kill the existing process or change the port in `Properties/launchSettings.json` |
| Port 3000 already in use | Run `npm run dev -- -p 3001` and update `NEXT_PUBLIC_API_URL` in `.env.local` |

---

## Project Structure

```
AIPathwayLab/
├── AIPathwayLab.Api/                  # ASP.NET Core backend (port 5236)
│   ├── AI/                            # Semantic Kernel, embeddings, vector store
│   ├── Controllers/                   # REST API endpoints
│   ├── Services/                      # RAG pipeline, Vision, caching, observability
│   ├── Knowledge/                     # Text files indexed into the RAG store at startup
│   ├── Questions/                     # Exam question JSON files
│   ├── appsettings.json               # Config template — safe to commit, no secrets
│   └── appsettings.Development.json   # YOUR secrets — gitignored, never committed
│
└── ai-tutor-ui/                       # Next.js frontend (port 3000)
    ├── app/
    │   ├── components/                # Chat, Sidebar, Code Explorer
    │   ├── exam/                      # Mock Exam page
    │   ├── scenario-exam/             # Scenario Exam page
    │   └── labs/                      # Vision and OpenAI lab pages
    ├── lib/
    │   └── config.ts                  # API URL (override with .env.local if needed)
    └── .env.example                   # Copy to .env.local to change the API port
```

---

## Adding Your Own Scenario Exam Questions

Drop a JSON file into `AIPathwayLab.Api/Questions/` named `ai102-scenario-*.json`.
The backend auto-detects it on startup. Schema:

```json
{
  "id": "ai102-scenario-test2",
  "title": "AI-102 Scenario Test 2",
  "description": "...",
  "parts": [
    {
      "part": 1,
      "title": "Part 1 — Service Selection",
      "questions": [
        {
          "id": 1,
          "scenario": "...",
          "requirements": ["...", "..."],
          "question": "Which service should you use?",
          "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
          "correctAnswer": "C",
          "explanation": "...",
          "overallExplanation": "...",
          "optionExplanations": { "A": "...", "B": "...", "C": "...", "D": "..." }
        }
      ]
    }
  ]
}
```

For **multi-select** questions, set `correctAnswer` to an array:
```json
"correctAnswer": ["B", "E"]
```

---

## License

MIT — free to use for learning and personal projects.
