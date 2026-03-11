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
| Backend | ASP.NET Core (.NET 10), Semantic Kernel, Azure OpenAI |
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4 |
| AI Services | Azure OpenAI (GPT-4o + text-embedding-ada-002), Azure AI Vision |

---

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org)
- An **Azure OpenAI** resource with two model deployments:
  - `tutor-gpt` → GPT-4o
  - `tutor-embedding` → text-embedding-ada-002
- An **Azure AI Vision** (Computer Vision) resource

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/iamharsh25/AIPathwayLab.git
cd AIPathwayLab
```

### 2. Add your Azure credentials (backend)

Create the file `AIPathwayLab.Api/appsettings.Development.json` — this file is gitignored so your keys stay private:

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

You can find these values in the **Azure Portal** under your resource → **Keys and Endpoint**.

### 3. Run the backend

```bash
cd AIPathwayLab.Api
dotnet run
# API starts on http://localhost:5236
```

### 4. Run the frontend

```bash
cd ai-tutor-ui
npm install
npm run dev
# UI starts on http://localhost:3000
```

### 5. Open the app

Go to [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
AIPathwayLab/
├── AIPathwayLab.Api/           # ASP.NET Core backend
│   ├── AI/                     # Semantic Kernel, embeddings, vector store
│   ├── Controllers/            # REST API endpoints
│   ├── Services/               # RAG pipeline, Vision, caching, observability
│   ├── Knowledge/              # Text files indexed into the RAG store
│   ├── Questions/              # Exam question JSON files
│   └── appsettings.json        # Config template (no secrets)
│
└── ai-tutor-ui/                # Next.js frontend
    ├── app/
    │   ├── components/         # Chat, Sidebar, Code Explorer
    │   ├── exam/               # Mock Exam page
    │   ├── scenario-exam/      # Scenario Exam page
    │   └── labs/               # Vision and OpenAI lab pages
    └── lib/
        └── config.ts           # API URL config (override via .env.local)
```

---

## Adding Your Own Scenario Exam Questions

Drop a JSON file into `AIPathwayLab.Api/Questions/` named `ai102-scenario-*.json`.
The backend auto-detects it. Schema:

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
