"use client";

import { useState, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import CodeExplorer from "./CodeExplorer";
import { API_URL } from "@/lib/config";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ActiveFile = {
  fileName: string;
  language: string;
  content: string;
};

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [fileList, setFileList] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await fetch(`${API_URL}/api/session`, { method: "POST" });
        const sessionData = await sessionRes.json();
        setSessionId(sessionData.sessionId);
      } catch {
        console.error("Backend not reachable — start the API server.");
      }

      try {
        const filesRes = await fetch(`${API_URL}/api/code/files`);
        if (filesRes.ok) {
          const files = await filesRes.json();
          setFileList(files);
        }
      } catch {
        // Files chip bar stays empty if backend is down
      }
    };

    init();
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileOpen = async (name: string) => {
    const res = await fetch(
      `${API_URL}/api/code/file?name=${encodeURIComponent(name)}`
    );

    if (!res.ok) return;

    const data = await res.json();
    setActiveFile(data);
  };

  const handleFileChipClick = async (fileName: string) => {
    // Open the file in code explorer
    await handleFileOpen(fileName);

    // Send a structured explanation request
    const question = `Explain ${fileName} — walk through its purpose, explain the key lines of code, and show how it connects to the rest of the system.`;
    await sendMessage(question);
  };

  const sendMessage = async (text: string) => {
    if (!sessionId) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(newMessages);

    const response = await fetch(`${API_URL}/api/tutor/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId, question: text }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    let assistantMessage = "";
    let buffer = "";

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    while (true) {
      const { done, value } = await reader!.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;

          const token = line
            .replace(/^data: ?/, "")
            .replace(/\\n/g, "\n");

          if (!token) continue;

          assistantMessage += token;

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantMessage,
            };
            return updated;
          });
        }
      }
    }
  };

  return (
    <div className="flex h-screen bg-white text-gray-900">

      {/* Chat Panel */}
      <div className={`flex flex-col ${activeFile ? "w-1/2" : "w-full"} transition-all duration-300 bg-white`}>

        {/* File Chips Bar */}
        {fileList.length > 0 && (
          <div className="border-b border-gray-100 px-4 py-2 bg-gray-50">
            <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Explore a file</p>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {fileList.map((file) => (
                <button
                  key={file}
                  onClick={() => handleFileChipClick(file)}
                  className="text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 hover:border-blue-400 transition-colors font-mono"
                >
                  {file}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-12">
              <p className="text-lg font-medium mb-2">Azure AI Tutor</p>
              <p className="text-sm">Ask anything about the codebase, or click a file chip above to explore it.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              role={m.role}
              content={m.content}
              onFileOpen={handleFileOpen}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <ChatInput onSend={sendMessage} />
      </div>

      {/* Code Explorer Panel */}
      {activeFile && (
        <div className="w-1/2 h-screen">
          <CodeExplorer
            fileName={activeFile.fileName}
            language={activeFile.language}
            content={activeFile.content}
            onClose={() => setActiveFile(null)}
          />
        </div>
      )}

    </div>
  );
}
