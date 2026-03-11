import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  role: "user" | "assistant";
  content: string;
  onFileOpen?: (name: string) => void;
};

const FILE_REGEX = /\b(\w+\.(cs|tsx|ts|json|txt))\b/g;

// Inject file links ONLY in plain text — skip content inside ``` code blocks ``` and `inline code`
function injectFileLinks(content: string): string {
  // Split by code fences and inline code, process only the non-code segments
  const parts = content.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  return parts
    .map((part, i) => {
      const isCode = i % 2 === 1; // odd = code segment
      if (isCode) return part;

      FILE_REGEX.lastIndex = 0;
      return part.replace(FILE_REGEX, (match) => `[${match}](file:${match})`);
    })
    .join("");
}

export default function MessageBubble({ role, content, onFileOpen }: Props) {
  const isUser = role === "user";

  // ── User message: compact right-aligned bubble ──────────────────────────
  if (isUser) {
    return (
      <div className="flex justify-end mb-6 px-4">
        <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-sm text-sm max-w-lg leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  // ── Assistant message: full-width, ChatGPT-style, no bubble ─────────────
  const processedContent = injectFileLinks(content);

  return (
    <div className="flex gap-4 mb-6 px-4">

      {/* AI Avatar */}
      <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
        AI
      </div>

      {/* Content — flex-1 + min-w-0 prevents overflow */}
      <div className="flex-1 min-w-0 text-gray-900 text-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{

            // ── Headings ──────────────────────────────────────────────────
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold mt-6 mb-3 text-gray-900 border-b pb-2">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-bold mt-5 mb-2 text-gray-900">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-semibold mt-4 mb-1 text-gray-800">{children}</h3>
            ),

            // ── Paragraph ────────────────────────────────────────────────
            p: ({ children }) => (
              <p className="mb-3 leading-7 text-gray-800">{children}</p>
            ),

            // ── Inline code: `code` ───────────────────────────────────────
            code: ({ children, className }) => {
              const isBlock = !!className;
              if (isBlock) {
                return (
                  <code className="block text-xs font-mono leading-6 text-gray-100">
                    {children}
                  </code>
                );
              }
              return (
                <code className="bg-gray-100 text-rose-600 font-mono text-xs px-1.5 py-0.5 rounded border border-gray-200">
                  {children}
                </code>
              );
            },

            // ── Code block: ```lang ``` ───────────────────────────────────
            pre: ({ children }) => (
              <div className="my-4 rounded-xl overflow-hidden border border-gray-700">
                <div className="bg-gray-800 px-4 py-1.5 text-xs text-gray-400 font-mono">
                  code
                </div>
                <pre className="bg-gray-950 text-gray-100 text-xs font-mono p-4 overflow-x-auto leading-6 whitespace-pre">
                  {children}
                </pre>
              </div>
            ),

            // ── Bold & Italic ─────────────────────────────────────────────
            strong: ({ children }) => (
              <strong className="font-semibold text-gray-900">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-gray-700">{children}</em>
            ),

            // ── Lists ─────────────────────────────────────────────────────
            ul: ({ children }) => (
              <ul className="mb-3 space-y-1 pl-6 list-disc marker:text-gray-400">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 space-y-1 pl-6 list-decimal marker:text-gray-400">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-gray-800 leading-7">{children}</li>
            ),

            // ── File link buttons ─────────────────────────────────────────
            a: ({ href, children }) => {
              if (href?.startsWith("file:")) {
                const fileName = href.slice(5);
                return (
                  <button
                    onClick={() => onFileOpen?.(fileName)}
                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-mono px-2 py-0.5 rounded-md border border-blue-200 hover:bg-blue-100 hover:border-blue-400 transition-colors mx-0.5 cursor-pointer"
                  >
                    📄 {String(children)}
                  </button>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">
                  {children}
                </a>
              );
            },

            // ── Blockquote ────────────────────────────────────────────────
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-emerald-400 bg-emerald-50 pl-4 pr-2 py-1 my-3 rounded-r-lg text-gray-700 italic">
                {children}
              </blockquote>
            ),

            // ── Horizontal rule ───────────────────────────────────────────
            hr: () => <hr className="my-4 border-gray-200" />,

            // ── Table ─────────────────────────────────────────────────────
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="bg-gray-100 px-4 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2 text-gray-700 border-b border-gray-100">{children}</td>
            ),

          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

    </div>
  );
}
