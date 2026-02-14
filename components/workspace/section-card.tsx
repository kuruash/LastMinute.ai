"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LessonSection } from "@/types";
import {
  BookOpen,
  List,
  Lightbulb,
  Image as ImageIcon,
  HelpCircle,
  Check,
  X,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface SectionCardProps {
  section: LessonSection;
  onSubmitAnswer: (sectionId: string, answer: string) => Promise<void>;
}

const sectionIcons: Record<string, typeof BookOpen> = {
  explanation: BookOpen,
  keyTerms: List,
  example: Lightbulb,
  diagram: ImageIcon,
  practice: HelpCircle,
};

const sectionLabels: Record<string, string> = {
  explanation: "Explanation",
  keyTerms: "Key Terms",
  example: "Example",
  diagram: "Diagram",
  practice: "Practice",
};

export function SectionCard({ section, onSubmitAnswer }: SectionCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const Icon = sectionIcons[section.type] || BookOpen;
  const label = sectionLabels[section.type] || section.type;

  async function handleSubmit() {
    const answer =
      section.questionType === "mcq" ? selectedOption || "" : openAnswer.trim();
    if (!answer) return;

    setSubmitting(true);
    try {
      await onSubmitAnswer(section.id, answer);
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- Diagram placeholder ---- */
  if (section.type === "diagram") {
    return (
      <div className="rounded-lg border border-dashed border-border p-6">
        <div className="mb-3 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {section.title}
          </span>
        </div>
        <div className="flex min-h-[120px] items-center justify-center rounded-md bg-muted/30">
          <div className="text-center">
            <ImageIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {section.diagramAlt || section.content || "Visual diagram"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Key Terms ---- */
  if (section.type === "keyTerms") {
    const terms = section.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return (
      <div className="rounded-lg border border-border p-6">
        <div className="mb-4 flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {section.title}
          </span>
        </div>
        <dl className="space-y-2.5">
          {terms.map((term, i) => {
            const colonIdx = term.indexOf(":");
            const termName = colonIdx > 0 ? term.slice(0, colonIdx).trim() : term;
            const termDef = colonIdx > 0 ? term.slice(colonIdx + 1).trim() : "";
            return (
              <div key={i} className="flex gap-2">
                <dt className="shrink-0 font-medium text-foreground text-sm">
                  {termName}
                  {termDef ? ":" : ""}
                </dt>
                {termDef && (
                  <dd className="text-sm text-muted-foreground">{termDef}</dd>
                )}
              </div>
            );
          })}
        </dl>
      </div>
    );
  }

  /* ---- Practice question ---- */
  if (section.type === "practice") {
    return (
      <div
        className={cn(
          "rounded-lg border p-6",
          section.answered
            ? "border-border"
            : "border-foreground/20"
        )}
      >
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {section.title}
          </span>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-foreground">
          {section.content}
        </p>

        {/* MCQ options */}
        {section.questionType === "mcq" && section.options && (
          <div className="mb-4 space-y-2">
            {section.options.map((option, i) => {
              const cleanOption = option.replace(/\s*\(correct\)\s*/i, "");
              const isSelected = selectedOption === option;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={section.answered}
                  onClick={() => setSelectedOption(option)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left text-sm transition-colors",
                    section.answered
                      ? "cursor-default border-border text-muted-foreground"
                      : isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs",
                      isSelected && !section.answered
                        ? "border-background bg-background text-foreground"
                        : "border-current"
                    )}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{cleanOption}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Open answer textarea */}
        {section.questionType === "open" && !section.answered && (
          <textarea
            value={openAnswer}
            onChange={(e) => setOpenAnswer(e.target.value)}
            placeholder="Type your answer here..."
            rows={3}
            className="mb-4 w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
          />
        )}

        {/* User's submitted answer (open-ended) */}
        {section.questionType === "open" && section.answered && section.userAnswer && (
          <div className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground mb-1">Your answer:</p>
            <p className="text-sm text-foreground">{section.userAnswer}</p>
          </div>
        )}

        {/* Hint */}
        {!section.answered && section.hint && (
          <p className="mb-4 text-xs text-muted-foreground">
            <span className="font-medium">Hint:</span> {section.hint}
          </p>
        )}

        {/* Submit button */}
        {!section.answered && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              (section.questionType === "mcq" ? !selectedOption : !openAnswer.trim())
            }
            className="flex items-center gap-2 rounded-md border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                Submit Answer
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        )}

        {/* AI Feedback */}
        {section.answered && section.aiFeedback && (
          <div
            className={cn(
              "mt-4 rounded-md border px-4 py-3",
              "border-border bg-muted/20"
            )}
          >
            <div className="mb-1 flex items-center gap-1.5">
              {section.aiFeedback.toLowerCase().includes("correct") &&
              !section.aiFeedback.toLowerCase().includes("incorrect") ? (
                <Check className="h-3.5 w-3.5 text-foreground" />
              ) : (
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-foreground">
                Feedback
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {section.aiFeedback}
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ---- Default: explanation / example ---- */
  return (
    <div className="rounded-lg border border-border p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {label} — {section.title}
        </span>
      </div>
      <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
        {section.content.split("\n\n").map((paragraph, i) => (
          <p
            key={i}
            className="mb-3 text-sm leading-relaxed text-foreground last:mb-0"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
