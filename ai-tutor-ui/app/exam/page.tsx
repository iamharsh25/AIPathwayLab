"use client";

import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

type Question = {
  id: number;
  domain: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: { A: string; B: string; C: string; D: string };
};

type EvaluateResult = {
  isCorrect: boolean;
  correctAnswer: string;
  correctAnswerText: string;
  explanation: string;
};

// ── Difficulty badge colour ───────────────────────────────────────────────────

const difficultyStyle: Record<string, string> = {
  easy:   "bg-green-100 text-green-700 border-green-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  hard:   "bg-red-100 text-red-700 border-red-200",
};

// ── Option button state colour ────────────────────────────────────────────────

function optionStyle(
  letter: string,
  selected: string | null,
  result: EvaluateResult | null
): string {
  const base = "w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all text-sm font-medium";

  if (!result) {
    // Not yet answered
    if (selected === letter)
      return `${base} border-blue-500 bg-blue-50 text-blue-800`;
    return `${base} border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50 cursor-pointer`;
  }

  // Already answered
  if (letter === result.correctAnswer)
    return `${base} border-green-500 bg-green-50 text-green-800`;
  if (letter === selected && !result.isCorrect)
    return `${base} border-red-400 bg-red-50 text-red-800`;

  return `${base} border-gray-100 bg-white text-gray-400`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExamPage() {
  const [question, setQuestion]         = useState<Question | null>(null);
  const [selected, setSelected]         = useState<string | null>(null);
  const [result, setResult]             = useState<EvaluateResult | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [score, setScore]               = useState({ correct: 0, total: 0 });
  const [answeredIds, setAnsweredIds]   = useState<number[]>([]);
  const [domainFilter, setDomainFilter] = useState("");
  const [domains, setDomains]           = useState<string[]>([]);

  // Load available domains for the filter dropdown
  useEffect(() => {
    fetch(`${API_URL}/api/exam/domains`)
      .then((r) => r.json())
      .then(setDomains)
      .catch(() => {});
  }, []);

  // Fetch a new random question
  const fetchQuestion = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    setResult(null);
    setQuestion(null);
    setError(null);

    try {
      const exclude = answeredIds.join(",");
      const params  = new URLSearchParams();
      if (domainFilter)  params.set("domain", domainFilter);
      if (exclude)       params.set("exclude", exclude);

      const res = await fetch(
        `${API_URL}/api/exam/question?${params.toString()}`
      );

      if (res.status === 404) {
        // All questions in this filter have been answered — reset
        setAnsweredIds([]);
        return;
      }

      if (!res.ok) {
        setError(`API error: ${res.status}`);
        return;
      }

      const data: Question = await res.json();
      setQuestion(data);
    } catch {
      setError("Cannot connect to backend. Make sure the .NET API is running on port 5236.");
    } finally {
      setLoading(false);
    }
  }, [answeredIds, domainFilter]);

  // Load first question on mount
  useEffect(() => {
    fetchQuestion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When user clicks an option
  const handleAnswer = async (letter: string) => {
    if (result || !question) return; // already answered

    setSelected(letter);

    const res = await fetch(`${API_URL}/api/exam/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, selectedAnswer: letter }),
    });

    const data: EvaluateResult = await res.json();
    setResult(data);

    setScore((prev) => ({
      correct: data.isCorrect ? prev.correct + 1 : prev.correct,
      total:   prev.total + 1,
    }));

    setAnsweredIds((prev) => [...prev, question.id]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mock Exam — AI-102</h1>
            <p className="text-sm text-gray-500 mt-0.5">Azure AI Engineer Certification</p>
          </div>

          {/* Score */}
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {score.total === 0 ? "—" : `${score.correct}/${score.total}`}
            </div>
            <div className="text-xs text-gray-400">Score</div>
          </div>
        </div>

        {/* Domain filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => { setDomainFilter(""); setAnsweredIds([]); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !domainFilter
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            All Domains
          </button>
          {domains.map((d) => (
            <button
              key={d}
              onClick={() => { setDomainFilter(d); setAnsweredIds([]); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                domainFilter === d
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Error state */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">⚠️</div>
            <p className="text-red-700 font-medium text-sm mb-1">Could not load question</p>
            <p className="text-red-500 text-xs mb-4">{error}</p>
            <button
              onClick={fetchQuestion}
              className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            Loading question...
          </div>
        )}

        {/* Question card */}
        {question && !loading && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">

            {/* Domain + difficulty badges */}
            <div className="flex items-center gap-2 px-6 pt-5 pb-4 border-b border-gray-100">
              <span className="text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                📚 {question.domain}
              </span>
              <span className={`text-xs font-medium border px-2.5 py-1 rounded-full ${difficultyStyle[question.difficulty]}`}>
                {question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1)}
              </span>
            </div>

            {/* Question text */}
            <div className="px-6 py-5">
              <p className="text-base font-medium text-gray-900 leading-relaxed">
                {question.question}
              </p>
            </div>

            {/* Options */}
            <div className="px-6 pb-5 space-y-2.5">
              {(["A", "B", "C", "D"] as const).map((letter) => (
                <button
                  key={letter}
                  onClick={() => handleAnswer(letter)}
                  disabled={!!result}
                  className={optionStyle(letter, selected, result)}
                >
                  {/* Letter badge */}
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    result && letter === result.correctAnswer
                      ? "bg-green-500 text-white"
                      : result && letter === selected && !result.isCorrect
                      ? "bg-red-400 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {letter}
                  </span>
                  <span>{question.options[letter]}</span>

                  {/* Result icon */}
                  {result && letter === result.correctAnswer && (
                    <span className="ml-auto text-green-500">✓</span>
                  )}
                  {result && letter === selected && !result.isCorrect && letter !== result.correctAnswer && (
                    <span className="ml-auto text-red-400">✗</span>
                  )}
                </button>
              ))}
            </div>

            {/* Explanation — shown after answering */}
            {result && (
              <div className={`mx-6 mb-6 rounded-xl p-4 border ${
                result.isCorrect
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}>
                {/* Result header */}
                <div className={`text-sm font-semibold mb-2 ${
                  result.isCorrect ? "text-green-700" : "text-red-700"
                }`}>
                  {result.isCorrect ? "✅ Correct!" : `❌ Incorrect — correct answer: ${result.correctAnswer}. ${result.correctAnswerText}`}
                </div>

                {/* Explanation text */}
                <p className="text-sm text-gray-700 leading-relaxed">
                  {result.explanation}
                </p>
              </div>
            )}

            {/* Next question button */}
            {result && (
              <div className="px-6 pb-6 flex justify-end">
                <button
                  onClick={fetchQuestion}
                  className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Next Question →
                </button>
              </div>
            )}

          </div>
        )}

        {/* All questions answered */}
        {!loading && !question && score.total > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              Session Complete!
            </h2>
            <p className="text-gray-500 mb-2">
              You scored <strong>{score.correct} out of {score.total}</strong>
            </p>
            <p className="text-2xl font-bold text-blue-600 mb-6">
              {Math.round((score.correct / score.total) * 100)}%
            </p>
            <button
              onClick={() => {
                setScore({ correct: 0, total: 0 });
                setAnsweredIds([]);
                fetchQuestion();
              }}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Start Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
