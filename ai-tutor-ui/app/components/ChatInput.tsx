"use client";

import { useState } from "react";

type ChatInputProps = {
  onSend: (message: string) => void;
};

export default function ChatInput({ onSend }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const send = () => {
    if (!message.trim()) return;

    onSend(message);
    setMessage("");
  };

  return (
    <div className="flex gap-2 p-4 border-t border-gray-200 bg-white">
      <input
        className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        placeholder="Ask a question..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
        }}
      />

      <button
        onClick={send}
        className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        Send
      </button>
    </div>
  );
}
