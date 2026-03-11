"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/tutor",         label: "AI Tutor",        icon: "💬" },
  { href: "/exam",          label: "Mock Exam",        icon: "📝" },
  { href: "/scenario-exam", label: "Scenario Exam",    icon: "🎯" },
  { href: "/labs",          label: "Azure Labs",       icon: "🔬" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 h-screen bg-gray-900 text-white flex flex-col">

      {/* Logo / App Title */}
      <div className="px-5 py-6 border-b border-gray-700">
        <h1 className="text-sm font-bold text-white tracking-wide">AI Pathway Lab</h1>
        <p className="text-xs text-gray-400 mt-0.5">Azure AI · AI-102</p>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-600 text-white font-medium"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">Preparing for AI-102</p>
      </div>

    </aside>
  );
}
