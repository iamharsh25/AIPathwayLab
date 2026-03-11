"use client";

type Props = {
  fileName: string;
  language: string;
  content: string;
  onClose: () => void;
};

export default function CodeExplorer({ fileName, language, content, onClose }: Props) {
  return (
    <div className="flex flex-col h-full border-l bg-gray-950 text-gray-100">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-sm font-mono">📄</span>
          <span className="text-sm font-mono text-gray-200">{fileName}</span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
            {language}
          </span>
        </div>

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl leading-none"
        >
          ×
        </button>
      </div>

      {/* Code Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-sm font-mono leading-relaxed whitespace-pre-wrap break-words text-gray-200">
          <code>{content}</code>
        </pre>
      </div>

    </div>
  );
}
