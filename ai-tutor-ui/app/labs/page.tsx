import Link from "next/link";

const labs = [
  {
    icon: "👁️",
    title: "Azure AI Vision",
    desc: "OCR, object detection, image captioning",
    status: "Live",
    href: "/labs/vision",
    tags: ["Caption", "Tags", "OCR", "Objects"],
  },
  {
    icon: "🧠",
    title: "Azure OpenAI Lab",
    desc: "RAG pipeline + System Prompt playground",
    status: "Live",
    href: "/labs/openai",
    tags: ["RAG", "Embeddings", "System Prompt", "Temperature"],
  },
  {
    icon: "🎤",
    title: "Azure AI Speech",
    desc: "Speech-to-text, text-to-speech",
    status: "Coming soon",
    href: null,
    tags: [],
  },
  {
    icon: "📄",
    title: "Document Intelligence",
    desc: "Form recognition, key-value extraction",
    status: "Coming soon",
    href: null,
    tags: [],
  },
];

export default function LabsPage() {
  return (
    <div className="p-8 overflow-y-auto h-full">

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Azure AI Labs</h1>
      <p className="text-gray-500 mb-8">
        Try each Azure AI service hands-on and see the code that powers it.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {labs.map((lab) =>
          lab.href ? (
            <Link
              key={lab.title}
              href={lab.href}
              className="border border-blue-200 rounded-xl p-5 bg-white hover:shadow-md hover:border-blue-400 transition-all block"
            >
              <div className="text-3xl mb-3">{lab.icon}</div>
              <h2 className="font-semibold text-gray-900 mb-1">{lab.title}</h2>
              <p className="text-sm text-gray-500 mb-3">{lab.desc}</p>
              {lab.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {lab.tags.map((t) => (
                    <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
              <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                {lab.status} →
              </span>
            </Link>
          ) : (
            <div
              key={lab.title}
              className="border border-gray-200 rounded-xl p-5 bg-white opacity-60 cursor-not-allowed"
            >
              <div className="text-3xl mb-3">{lab.icon}</div>
              <h2 className="font-semibold text-gray-900 mb-1">{lab.title}</h2>
              <p className="text-sm text-gray-500 mb-3">{lab.desc}</p>
              <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                {lab.status}
              </span>
            </div>
          )
        )}
      </div>

    </div>
  );
}
