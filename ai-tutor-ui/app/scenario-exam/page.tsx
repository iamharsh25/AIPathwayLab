"use client";

import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

type ExamMeta = {
  id: string;
  title: string;
  description: string;
  totalParts: number;
  totalQuestions: number;
};

type Question = {
  id: number;
  scenario: string;
  requirements: string[];
  question: string;
  options: Record<string, string>;
  correctAnswer: string | string[];   // single "C" or multi ["B","E"]
  explanation: string;
  overallExplanation: string;
  optionExplanations: Record<string, string>;
};

type PartData = {
  examId: string;
  examTitle: string;
  part: number;
  partTitle: string;
  totalParts: number;
  questions: Question[];
};

// ── Progress stored in localStorage ──────────────────────────────────────────

type Mistake = {
  examId: string;
  examTitle: string;
  part: number;
  questionId: number;
  question: string;
  scenario: string;
  selectedAnswer: string;   // comma-joined for display & storage
  correctAnswer: string;    // comma-joined for display & storage
  correctText: string;
  selectedText: string;
  explanation: string;
  timestamp: string;
};

type ExamProgress = {
  completedParts: number[];
  partScores: Record<number, { correct: number; total: number }>;
};

const STORAGE_KEY = "scenario-exam-progress";
const MISTAKES_KEY = "scenario-exam-mistakes";

function loadProgress(examId: string): ExamProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completedParts: [], partScores: {} };
    const all = JSON.parse(raw);
    return all[examId] ?? { completedParts: [], partScores: {} };
  } catch { return { completedParts: [], partScores: {} }; }
}

function saveProgress(examId: string, progress: ExamProgress) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[examId] = progress;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

function loadMistakes(): Mistake[] {
  try {
    const raw = localStorage.getItem(MISTAKES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMistakes(mistakes: Mistake[]) {
  try {
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(mistakes));
  } catch { /* ignore */ }
}

// ── Multi-select helpers ──────────────────────────────────────────────────────

function getCorrectAnswers(q: Question): string[] {
  return Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
}

function getSelectCount(q: Question): number {
  return getCorrectAnswers(q).length;
}

function isAnswerCorrect(q: Question, selected: string[]): boolean {
  const correct = getCorrectAnswers(q).slice().sort();
  const given   = selected.slice().sort();
  return correct.length === given.length && correct.every((c, i) => c === given[i]);
}

function joinAnswers(keys: string[]): string {
  return keys.join(", ");
}

// ── View type ─────────────────────────────────────────────────────────────────

type View = "exams" | "parts" | "question" | "results" | "mistakes";

// ── Main Component ────────────────────────────────────────────────────────────

export default function ScenarioExamPage() {
  const [view,         setView]         = useState<View>("exams");
  const [exams,        setExams]        = useState<ExamMeta[]>([]);
  const [activeExam,   setActiveExam]   = useState<ExamMeta | null>(null);
  const [partData,     setPartData]     = useState<PartData | null>(null);
  const [progress,     setProgress]     = useState<ExamProgress>({ completedParts: [], partScores: {} });
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Question flow state — answers is now string[] per question index
  const [currentIdx,   setCurrentIdx]   = useState(0);
  const [answers,      setAnswers]       = useState<Record<number, string[]>>({});
  const [revealed,     setRevealed]      = useState<Record<number, boolean>>({});
  const [mistakes,     setMistakes]      = useState<Mistake[]>([]);

  // Load exam list on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/scenarioexam/list`);
        if (res.ok) setExams(await res.json());
      } catch { setError("Cannot connect to backend."); }
      finally { setLoading(false); }
    };
    load();
    setMistakes(loadMistakes());
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const selectExam = (exam: ExamMeta) => {
    setActiveExam(exam);
    setProgress(loadProgress(exam.id));
    setView("parts");
  };

  const startPart = async (partNum: number) => {
    if (!activeExam) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/scenarioexam/${activeExam.id}/part/${partNum}`);
      if (!res.ok) { setError("Failed to load part."); return; }
      const data: PartData = await res.json();
      setPartData(data);
      setCurrentIdx(0);
      setAnswers({});
      setRevealed({});
      setView("question");
    } catch { setError("Cannot connect to backend."); }
    finally { setLoading(false); }
  };

  const selectAnswer = (questionIdx: number, option: string) => {
    if (!partData) return;
    if (revealed[questionIdx]) return;
    const q        = partData.questions[questionIdx];
    const required = getSelectCount(q);
    const current  = answers[questionIdx] ?? [];

    if (current.includes(option)) {
      // Deselect
      setAnswers(prev => ({ ...prev, [questionIdx]: current.filter(o => o !== option) }));
    } else if (current.length < required) {
      // Select up to the required count
      setAnswers(prev => ({ ...prev, [questionIdx]: [...current, option] }));
    }
  };

  const revealAnswer = useCallback(() => {
    if (!partData) return;
    const q        = partData.questions[currentIdx];
    const selected = answers[currentIdx] ?? [];
    const required = getSelectCount(q);
    if (selected.length < required) return;

    setRevealed(prev => ({ ...prev, [currentIdx]: true }));

    // Record mistake if wrong
    if (!isAnswerCorrect(q, selected)) {
      const correctKeys = getCorrectAnswers(q);
      const mistake: Mistake = {
        examId:         partData.examId,
        examTitle:      partData.examTitle,
        part:           partData.part,
        questionId:     q.id,
        question:       q.question,
        scenario:       q.scenario,
        selectedAnswer: joinAnswers(selected),
        correctAnswer:  joinAnswers(correctKeys),
        correctText:    correctKeys.map(k => `${k}. ${q.options[k]}`).join(" | "),
        selectedText:   selected.map(k => `${k}. ${q.options[k]}`).join(" | "),
        explanation:    q.explanation,
        timestamp:      new Date().toISOString(),
      };
      const updated = [...loadMistakes(), mistake];
      saveMistakes(updated);
      setMistakes(updated);
    }
  }, [partData, currentIdx, answers]);

  const nextQuestion = () => {
    if (!partData) return;
    if (currentIdx < partData.questions.length - 1) {
      setCurrentIdx(idx => idx + 1);
    } else {
      // Finish part — calculate score
      let correct = 0;
      partData.questions.forEach((q, i) => {
        if (isAnswerCorrect(q, answers[i] ?? [])) correct++;
      });

      const newProgress: ExamProgress = {
        completedParts: [...new Set([...progress.completedParts, partData.part])],
        partScores: {
          ...progress.partScores,
          [partData.part]: { correct, total: partData.questions.length },
        },
      };
      saveProgress(partData.examId, newProgress);
      setProgress(newProgress);
      setView("results");
    }
  };

  const clearMistakesForExam = (examId: string) => {
    const updated = loadMistakes().filter(m => m.examId !== examId);
    saveMistakes(updated);
    setMistakes(updated);
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const optionClass = (questionIdx: number, opt: string) => {
    if (!partData) return "";
    const q            = partData.questions[questionIdx];
    const selected     = answers[questionIdx] ?? [];
    const correctKeys  = getCorrectAnswers(q);
    const isRevealed   = revealed[questionIdx];
    const isSelected   = selected.includes(opt);
    const isCorrectOpt = correctKeys.includes(opt);

    if (!isRevealed) {
      return isSelected
        ? "border-blue-500 bg-blue-50 text-blue-900"
        : "border-gray-200 hover:border-gray-400 cursor-pointer text-gray-800";
    }

    if (isCorrectOpt)            return "border-green-500 bg-green-50 text-green-900";
    if (isSelected && !isCorrectOpt) return "border-red-400 bg-red-50 text-red-900";
    return "border-gray-100 text-gray-400";
  };

  // ── Exam Selector ─────────────────────────────────────────────────────────

  if (view === "exams") {
    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">AI-102 Exam Prep</div>
              <h1 className="text-xl font-bold text-gray-900">🎯 Scenario-Based Exams</h1>
              <p className="text-sm text-gray-500 mt-0.5">Real-world architecture scenarios — select a service, justify your answer, learn from mistakes.</p>
            </div>
            <button
              onClick={() => setView("mistakes")}
              className="flex items-center gap-2 text-xs px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
            >
              📋 Mistake Review
              {mistakes.length > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {mistakes.length > 99 ? "99+" : mistakes.length}
                </span>
              )}
            </button>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

          {loading && <p className="text-sm text-gray-400">Loading exams...</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {exams.map(exam => {
              const prog = loadProgress(exam.id);
              const done = prog.completedParts.length;
              return (
                <button
                  key={exam.id}
                  onClick={() => selectExam(exam)}
                  className="text-left border border-blue-200 rounded-2xl p-5 bg-white hover:shadow-md hover:border-blue-400 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h2 className="font-semibold text-gray-900 text-sm">{exam.title}</h2>
                    {done > 0 && (
                      <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                        {done}/{exam.totalParts} parts done
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">{exam.description}</p>
                  <div className="flex gap-3 text-xs text-gray-400">
                    <span>📋 {exam.totalParts} parts</span>
                    <span>❓ {exam.totalQuestions} questions</span>
                  </div>
                  {done > 0 && (
                    <div className="mt-3 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(done / exam.totalParts) * 100}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {exams.length === 0 && !loading && !error && (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-400">
              <p className="text-sm">No scenario exams found.</p>
              <p className="text-xs mt-1">Add <code className="bg-gray-100 px-1 rounded">ai102-scenario-*.json</code> files to the Questions folder.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Part Selector ─────────────────────────────────────────────────────────

  if (view === "parts" && activeExam) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("exams")} className="text-xs text-gray-400 hover:text-gray-600">← All Exams</button>
            <span className="text-gray-200">/</span>
            <span className="text-xs text-gray-600 font-medium">{activeExam.title}</span>
          </div>

          <div>
            <h1 className="text-xl font-bold text-gray-900">{activeExam.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Complete parts in order. Each part unlocks when the previous one is finished.</p>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

          <div className="space-y-3">
            {Array.from({ length: activeExam.totalParts }, (_, i) => {
              const partNum   = i + 1;
              const isLocked  = partNum > 1 && !progress.completedParts.includes(partNum - 1);
              const isDone    = progress.completedParts.includes(partNum);
              const score     = progress.partScores[partNum];

              return (
                <div
                  key={partNum}
                  onClick={() => !isLocked && startPart(partNum)}
                  className={`border rounded-2xl p-5 flex items-center justify-between transition-all
                    ${isLocked
                      ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                      : isDone
                        ? "border-green-200 bg-white cursor-pointer hover:shadow-sm hover:border-green-300"
                        : "border-blue-200 bg-white cursor-pointer hover:shadow-md hover:border-blue-400"
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                      ${isLocked ? "bg-gray-100 text-gray-400" : isDone ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                      {isDone ? "✓" : partNum}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Part {partNum}</p>
                      {isLocked && <p className="text-xs text-gray-400">Complete Part {partNum - 1} to unlock</p>}
                      {isDone && score && (
                        <p className="text-xs text-green-600 font-medium">{score.correct}/{score.total} correct</p>
                      )}
                      {!isLocked && !isDone && <p className="text-xs text-blue-500">Ready to start</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isDone && score && (
                      <div className="text-right">
                        <div className={`text-sm font-bold ${score.correct === score.total ? "text-green-600" : score.correct >= score.total * 0.7 ? "text-amber-600" : "text-red-500"}`}>
                          {Math.round((score.correct / score.total) * 100)}%
                        </div>
                      </div>
                    )}
                    {!isLocked && (
                      <div className={`text-xs px-3 py-1.5 rounded-lg font-semibold
                        ${isDone ? "bg-green-100 text-green-700" : "bg-blue-600 text-white"}`}>
                        {isDone ? "Redo" : "Start →"}
                      </div>
                    )}
                    {isLocked && <div className="text-gray-300 text-lg">🔒</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Exam-level mistake summary */}
          {mistakes.filter(m => m.examId === activeExam.id).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-800">
                  {mistakes.filter(m => m.examId === activeExam.id).length} mistakes recorded
                </p>
                <p className="text-xs text-red-600 mt-0.5">Review your wrong answers to strengthen weak areas</p>
              </div>
              <button onClick={() => setView("mistakes")} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                Review →
              </button>
            </div>
          )}

          {loading && <p className="text-sm text-gray-400">Loading...</p>}
        </div>
      </div>
    );
  }

  // ── Question View ─────────────────────────────────────────────────────────

  if (view === "question" && partData) {
    const q            = partData.questions[currentIdx];
    const selected     = answers[currentIdx] ?? [];
    const isRevealed   = revealed[currentIdx];
    const correctKeys  = getCorrectAnswers(q);
    const required     = getSelectCount(q);
    const isMulti      = required > 1;
    const isCorrect    = isAnswerCorrect(q, selected);
    const totalQ       = partData.questions.length;
    const canReveal    = selected.length === required;

    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setView("parts")} className="text-xs text-gray-400 hover:text-gray-600">← Parts</button>
              <span className="text-xs text-gray-400">{partData.examTitle} · {partData.partTitle}</span>
            </div>
            <span className="text-xs text-gray-500 font-medium">
              Question {currentIdx + 1} of {totalQ}
            </span>
          </div>

          {/* Progress bar */}
          <div className="bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((currentIdx + (isRevealed ? 1 : 0)) / totalQ) * 100}%` }}
            />
          </div>

          {/* Scenario */}
          <div className="bg-white border border-blue-100 rounded-2xl p-5 space-y-4">
            <div>
              <div className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Scenario</div>
              <p className="text-sm text-gray-700 leading-relaxed">{q.scenario}</p>
            </div>

            {q.requirements && q.requirements.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Requirements</div>
                <ul className="space-y-1">
                  {q.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Question */}
          <div className="bg-gray-900 rounded-2xl px-5 py-4">
            <p className="text-white font-semibold text-sm">{q.question}</p>
          </div>

          {/* Multi-select hint */}
          {isMulti && !isRevealed && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <span>☑</span>
                <span>Select <strong>{required}</strong> answers</span>
              </div>
              <span className="text-xs text-gray-400 font-medium">
                {selected.length} / {required} selected
              </span>
            </div>
          )}

          {/* Options */}
          <div className="space-y-2.5">
            {Object.entries(q.options).map(([key, text]) => {
              const isSelected   = selected.includes(key);
              const isCorrectOpt = correctKeys.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => selectAnswer(currentIdx, key)}
                  disabled={isRevealed || (!isSelected && selected.length >= required)}
                  className={`w-full text-left border-2 rounded-xl px-4 py-3 transition-all text-sm ${optionClass(currentIdx, key)}`}
                >
                  <span className="font-bold mr-3">{key}.</span>
                  {text}
                  {isRevealed && isCorrectOpt && (
                    <span className="ml-2 text-xs font-medium text-green-600">✓ Correct</span>
                  )}
                  {isRevealed && isSelected && !isCorrectOpt && (
                    <span className="ml-2 text-xs font-medium text-red-500">✗ Your answer</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Check Answer button */}
          {!isRevealed && (
            <button
              onClick={revealAnswer}
              disabled={!canReveal}
              className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            >
              {isMulti && !canReveal
                ? `Select ${required - selected.length} more answer${required - selected.length !== 1 ? "s" : ""}`
                : "Check Answer"}
            </button>
          )}

          {/* Answer revealed */}
          {isRevealed && (
            <div className="space-y-4">
              {/* Verdict */}
              <div className={`rounded-2xl p-4 border-2 ${isCorrect ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                <div className={`text-sm font-bold mb-2 ${isCorrect ? "text-green-800" : "text-red-800"}`}>
                  {isCorrect
                    ? "✓ Correct!"
                    : `✗ Incorrect — correct answer${correctKeys.length > 1 ? "s" : ""}: ${correctKeys.map(k => `${k}. ${q.options[k]}`).join(" | ")}`}
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{q.explanation}</p>
              </div>

              {/* Overall explanation */}
              {q.overallExplanation && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Overall Explanation</div>
                  <p className="text-xs text-gray-700 leading-relaxed">{q.overallExplanation}</p>
                </div>
              )}

              {/* Option explanations */}
              {q.optionExplanations && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Why each option</div>
                  {Object.entries(q.optionExplanations).map(([opt, text]) => {
                    const isCorrectOpt = correctKeys.includes(opt);
                    return (
                      <div key={opt} className="flex gap-3">
                        <span className={`text-xs font-bold shrink-0 mt-0.5 w-5 ${isCorrectOpt ? "text-green-600" : "text-gray-400"}`}>
                          {opt}.
                        </span>
                        <p className={`text-xs leading-relaxed ${isCorrectOpt ? "text-green-800" : "text-gray-500"}`}>{text}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Next */}
              <button
                onClick={nextQuestion}
                className="w-full py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
              >
                {currentIdx < totalQ - 1 ? "Next Question →" : "Finish Part →"}
              </button>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ── Results View ──────────────────────────────────────────────────────────

  if (view === "results" && partData && activeExam) {
    const score  = progress.partScores[partData.part];
    const pct    = score ? Math.round((score.correct / score.total) * 100) : 0;
    const isLast = partData.part >= partData.totalParts;
    const partMistakes = mistakes.filter(m => m.examId === partData.examId && m.part === partData.part);

    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <h1 className="text-xl font-bold text-gray-900">Part {partData.part} Complete</h1>

          {/* Score card */}
          <div className={`rounded-2xl p-6 text-center border-2 ${
            pct >= 80 ? "bg-green-50 border-green-300" : pct >= 60 ? "bg-amber-50 border-amber-300" : "bg-red-50 border-red-300"
          }`}>
            <div className={`text-5xl font-black mb-1 ${pct >= 80 ? "text-green-700" : pct >= 60 ? "text-amber-700" : "text-red-600"}`}>
              {pct}%
            </div>
            <div className="text-sm text-gray-600">
              {score?.correct} / {score?.total} correct
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {pct >= 80 ? "Excellent! You have a strong grasp of this area." : pct >= 60 ? "Good effort. Review the explanations for missed questions." : "Keep studying — review each question's explanation carefully."}
            </div>
          </div>

          {/* Per-question summary */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Question Summary</div>
            {partData.questions.map((q, i) => {
              const ans     = answers[i] ?? [];
              const correct = isAnswerCorrect(q, ans);
              const correctKeys = getCorrectAnswers(q);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                    ${correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                    {correct ? "✓" : "✗"}
                  </span>
                  <span className="text-xs text-gray-600 flex-1 leading-relaxed line-clamp-1">{q.question}</span>
                  {!correct && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {joinAnswers(ans)} → {joinAnswers(correctKeys)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mistakes summary */}
          {partMistakes.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
              <p className="text-sm text-red-800 font-medium">{partMistakes.length} mistake{partMistakes.length !== 1 ? "s" : ""} saved for review</p>
              <button onClick={() => setView("mistakes")} className="text-xs text-red-600 hover:text-red-800 font-semibold underline">Review →</button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => { setView("parts"); }}
              className="flex-1 py-3 border border-gray-200 text-sm font-semibold rounded-xl hover:bg-gray-50 text-gray-700"
            >
              ← Back to Parts
            </button>
            {!isLast && (
              <button
                onClick={() => startPart(partData.part + 1)}
                className="flex-1 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700"
              >
                Start Part {partData.part + 1} →
              </button>
            )}
            {isLast && pct >= 80 && (
              <div className="flex-1 py-3 bg-green-100 text-green-700 text-sm font-semibold rounded-xl text-center border border-green-200">
                🏆 All parts complete!
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Mistakes Review ───────────────────────────────────────────────────────

  if (view === "mistakes") {
    const groupedByExam = mistakes.reduce<Record<string, { title: string; items: Mistake[] }>>((acc, m) => {
      if (!acc[m.examId]) acc[m.examId] = { title: m.examTitle, items: [] };
      acc[m.examId].items.push(m);
      return acc;
    }, {});

    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => setView("exams")} className="text-xs text-gray-400 hover:text-gray-600 mb-2">← Back to Exams</button>
              <h1 className="text-xl font-bold text-gray-900">📋 Mistake Review</h1>
              <p className="text-sm text-gray-500 mt-0.5">Questions you got wrong — review them to reinforce the right concepts.</p>
            </div>
          </div>

          {mistakes.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-sm font-medium text-gray-700">No mistakes recorded yet!</p>
              <p className="text-xs text-gray-400 mt-1">Complete some exam parts to see your mistakes here.</p>
            </div>
          )}

          {Object.entries(groupedByExam).map(([examId, group]) => (
            <div key={examId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900">{group.title}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-500 font-medium">{group.items.length} mistake{group.items.length !== 1 ? "s" : ""}</span>
                  <button
                    onClick={() => clearMistakesForExam(examId)}
                    className="text-xs text-gray-400 hover:text-red-500 underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="divide-y divide-gray-50">
                {group.items.map((m, i) => (
                  <div key={i} className="p-5 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-gray-400 shrink-0 mt-0.5">Part {m.part} · Q{m.questionId}</span>
                      <p className="text-sm font-medium text-gray-800">{m.question}</p>
                    </div>

                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 bg-gray-50 rounded-xl px-3 py-2 italic">{m.scenario}</p>

                    <div className="flex gap-2 flex-wrap">
                      <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                        Your answer: {m.selectedAnswer}
                      </span>
                      <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                        Correct: {m.correctAnswer}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed">{m.explanation}</p>

                    <p className="text-xs text-gray-400">
                      {new Date(m.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
