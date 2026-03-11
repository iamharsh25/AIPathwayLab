import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Pathway Lab",
  description: "Azure AI Learning Platform — AI-102 Exam Prep",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>

        {/* App shell: sidebar on left, page content on right */}
        <div className="flex h-screen bg-white overflow-hidden">

          <Sidebar />

          {/* Main content area — each page renders inside here */}
          <main className="flex-1 overflow-hidden">
            {children}
          </main>

        </div>

      </body>
    </html>
  );
}
