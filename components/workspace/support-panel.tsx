"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ChecklistItem, HintLevel, MisconceptionLogEntry } from "@/types";
import { Check, MessageSquare, MessageCircle, Sparkles, Trophy } from "lucide-react";
import { TutorChat } from "@/components/workspace/tutor-chat";
import { QuizPanel } from "@/components/workspace/quiz-panel";

interface SupportPanelProps {
  checklist: ChecklistItem[];
  onChecklistToggle: (id: string) => void;
  hints: HintLevel[];
  onRevealHint: (level: number) => void;
  misconceptions: MisconceptionLogEntry[];
  tutorContext: string;
  completedSteps: number;
  totalSteps: number;
  /** Full context for quiz (tutor context + all topic storylines) */
  quizContext?: string;
  /** Quiz panel is open (controlled by parent so LessonView CTA can open it) */
  quizOpen?: boolean;
  onQuizOpenChange?: (open: boolean) => void;
  /** External trigger to open Voxi (e.g. from wake-word "Hey Voxi") */
  voxiOpenTrigger?: number;
  /** Callback so parent knows if Voxi is open (for disabling wake-word) */
  onVoxiOpenChange?: (open: boolean) => void;
  /** Current slide image for "Draw on slide" in Voxi chat */
  currentSlideImage?: { src: string; alt: string } | null;
  /** Topic draw mode: draw anywhere on the lesson */
  drawMode?: boolean;
  onDrawModeChange?: (on: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function SupportPanel({
  checklist,
  onChecklistToggle,
  hints,
  onRevealHint,
  misconceptions,
  tutorContext,
  completedSteps,
  totalSteps,
  voxiOpenTrigger,
  onVoxiOpenChange,
  currentSlideImage,
  drawMode = false,
  onDrawModeChange,
  quizContext = "",
  quizOpen: quizOpenProp = false,
  onQuizOpenChange,
  className,
  style,
}: SupportPanelProps) {
  const [tutorOpen, setTutorOpen] = useState(false);
  const [quizOpenLocal, setQuizOpenLocal] = useState(false);
  const quizOpen = onQuizOpenChange ? quizOpenProp : quizOpenLocal;
  const setQuizOpen = onQuizOpenChange ?? setQuizOpenLocal;

  // Open Voxi when wake-word fires (voxiOpenTrigger increments)
  useEffect(() => {
    if (voxiOpenTrigger && voxiOpenTrigger > 0) {
      setTutorOpen(true);
    }
  }, [voxiOpenTrigger]);

  // Notify parent of open state
  useEffect(() => {
    onVoxiOpenChange?.(tutorOpen);
  }, [tutorOpen, onVoxiOpenChange]);

  const progressPercent =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div
      className={cn(
        "flex flex-col border-l border-border",
        tutorOpen ? "h-full min-h-0" : "h-full",
        className
      )}
      style={style}
    >
      {/* When Quiz is open: only quiz panel */}
      {quizOpen && quizContext.trim() ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <QuizPanel
            quizContext={quizContext}
            onClose={() => setQuizOpen(false)}
            className="min-h-0 flex-1"
          />
        </div>
      ) : null}

      {/* When Voxi is open: only chat. When closed: checklist + progress + Ask Voxi + Take Quiz. */}
      {!tutorOpen && !quizOpen && (
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Progress summary */}
        <section>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Topics {completedSteps}/{totalSteps}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </section>

        {/* Checklist generated from pipeline */}
        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Subtopics checklist
          </h3>
          <ul className="space-y-0.5">
            {checklist.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onChecklistToggle(item.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                      item.done
                        ? "border-foreground bg-foreground text-background"
                        : "border-border"
                    )}
                  >
                    {item.done && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      item.done && "text-muted-foreground line-through"
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Ask tutor + Take quiz */}
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setTutorOpen(true);
              setQuizOpen(false);
              onVoxiOpenChange?.(true);
            }}
            className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask Voxi
          </button>
          <button
            type="button"
            onClick={() => {
              setQuizOpen(true);
              setTutorOpen(false);
            }}
            disabled={!quizContext.trim()}
            className="flex w-full items-center gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-200"
          >
            <Trophy className="h-3.5 w-3.5" />
            Take a Quiz
          </button>
        </section>

        {/* Misconceptions (only show when tutor closed) */}
        {misconceptions.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Misconceptions
            </h3>
            <ul className="space-y-1.5">
              {misconceptions.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-2 rounded-md border border-border px-3 py-2"
                >
                  <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    {m.text}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      )}

      {/* Tutor chat: take remaining height when Voxi open and quiz closed */}
      <div
        className={cn(
          "min-h-0 overflow-hidden",
          tutorOpen && !quizOpen ? "flex flex-1 flex-col" : "hidden"
        )}
      >
        <TutorChat
          context={tutorContext}
          open={tutorOpen}
          onClose={() => setTutorOpen(false)}
          drawMode={drawMode}
          onDrawModeToggle={onDrawModeChange ? () => onDrawModeChange(!drawMode) : undefined}
          voxiOpenTrigger={voxiOpenTrigger ?? 0}
        />
      </div>
    </div>
  );
}
