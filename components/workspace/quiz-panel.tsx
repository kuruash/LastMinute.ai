"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  Trophy,
  X,
} from "lucide-react";
import type { QuizQuestion } from "@/types";

type QuizStep = "config" | "loading" | "quiz" | "results";

const DIFFICULTY_OPTIONS: { value: "easy" | "medium" | "hard"; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const NUM_QUESTIONS_OPTIONS = [5, 10, 15];

interface QuizPanelProps {
  /** Full context: tutor context + all topic storylines (title, topics, story, etc.) */
  quizContext: string;
  onClose: () => void;
  className?: string;
}

export function QuizPanel({ quizContext, onClose, className }: QuizPanelProps) {
  const [step, setStep] = useState<QuizStep>("config");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [numQuestions, setNumQuestions] = useState(5);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [userSelections, setUserSelections] = useState<(number | null)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuiz = useCallback(async () => {
    setError(null);
    setStep("loading");
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: quizContext,
          difficulty,
          numQuestions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to generate quiz");
        setStep("config");
        return;
      }
      const list = data?.questions ?? [];
      if (list.length === 0) {
        setError("No questions generated. Try different options.");
        setStep("config");
        return;
      }
      setQuestions(list);
      setUserSelections(list.map(() => null));
      setCurrentIndex(0);
      setStep("quiz");
    } catch {
      setError("Network error. Try again.");
      setStep("config");
    }
  }, [quizContext, difficulty, numQuestions]);

  const setSelection = useCallback((questionIndex: number, optionIndex: number) => {
    setUserSelections((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  }, []);

  const score =
    questions.length > 0
      ? questions.filter(
          (q, i) => userSelections[i] !== null && userSelections[i] === q.correctIndex
        ).length
      : 0;

  const allAnswered = userSelections.every((s) => s !== null);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col rounded-lg border border-border bg-background",
        className
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-foreground">
            {step === "config" && "Take a Quiz"}
            {step === "loading" && "Generating quiz…"}
            {step === "quiz" && `Question ${currentIndex + 1} of ${questions.length}`}
            {step === "results" && "Quiz results"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {/* ── Config ── */}
        {step === "config" && (
          <div className="space-y-6">
            {error && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {error}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Quiz questions are generated from your current lesson and story cards.
              Choose difficulty and number of questions, then start.
            </p>
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Difficulty
              </label>
              <div className="flex gap-2">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDifficulty(opt.value)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                      difficulty === opt.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Number of questions
              </label>
              <div className="flex gap-2">
                {NUM_QUESTIONS_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumQuestions(n)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                      numQuestions === n
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={generateQuiz}
              disabled={!quizContext.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Generate Quiz
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {step === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Creating questions from your material…
            </p>
          </div>
        )}

        {/* ── Quiz run ── */}
        {step === "quiz" && questions.length > 0 && (
          <div className="flex flex-1 flex-col">
            <div className="mb-4 flex items-center gap-2">
              {questions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-colors",
                    i === currentIndex
                      ? "bg-foreground text-background"
                      : userSelections[i] !== null
                        ? "bg-muted text-muted-foreground"
                        : "border border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="flex-1">
              <p className="mb-4 text-sm font-medium leading-snug text-foreground">
                {questions[currentIndex].question}
              </p>
              <ul className="space-y-2">
                {questions[currentIndex].options.map((opt, optIdx) => (
                  <li key={optIdx}>
                    <button
                      type="button"
                      onClick={() => setSelection(currentIndex, optIdx)}
                      className={cn(
                        "w-full rounded-lg border px-4 py-3 text-left text-xs transition-colors",
                        userSelections[currentIndex] === optIdx
                          ? "border-foreground bg-foreground/10 text-foreground"
                          : "border-border text-foreground hover:bg-muted"
                      )}
                    >
                      <span className="mr-2 font-medium">
                        {String.fromCharCode(65 + optIdx)}.
                      </span>
                      {opt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-foreground disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                  }
                  className="flex items-center gap-1 rounded-md border border-foreground bg-foreground px-3 py-2 text-xs text-background"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep("results")}
                  disabled={!allAnswered}
                  className="rounded-md border border-foreground bg-foreground px-4 py-2 text-xs font-medium text-background disabled:opacity-50"
                >
                  See results
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {step === "results" && questions.length > 0 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">
                {score} / {questions.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {score === questions.length
                  ? "Perfect!"
                  : score >= questions.length / 2
                    ? "Good job."
                    : "Review the material and try again."}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Review answers</span>
              <button
                type="button"
                onClick={() => setShowAnswers((v) => !v)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {showAnswers ? "Hide answers" : "Show answers"}
              </button>
            </div>
            <ul className="space-y-4">
              {questions.map((q, i) => {
                const selected = userSelections[i];
                const correct = q.correctIndex;
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <p className="mb-3 text-sm font-medium text-foreground">
                      {i + 1}. {q.question}
                    </p>
                    <ul className="space-y-1.5">
                      {q.options.map((opt, j) => (
                        <li
                          key={j}
                          className={cn(
                            "flex items-start gap-2 rounded px-2 py-1 text-xs",
                            showAnswers && j === correct && "bg-green-500/15 text-green-800 dark:text-green-200",
                            showAnswers && selected !== null && j === selected && j !== correct && "bg-red-500/15 text-red-800 dark:text-red-200",
                            !showAnswers && selected !== null && j === selected && "bg-muted"
                          )}
                        >
                          <span className="shrink-0 font-medium">
                            {String.fromCharCode(65 + j)}.
                          </span>
                          <span>{opt}</span>
                          {showAnswers && j === correct && (
                            <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-green-600" />
                          )}
                        </li>
                      ))}
                    </ul>
                    {showAnswers && q.explanation && (
                      <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                        {q.explanation}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("config");
                  setQuestions([]);
                  setUserSelections([]);
                  setShowAnswers(false);
                }}
                className="flex-1 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-muted"
              >
                New quiz
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-foreground bg-foreground px-3 py-2 text-xs text-background"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
