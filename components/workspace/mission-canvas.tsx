"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MissionCard } from "@/types";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

interface MissionCanvasProps {
  mission: MissionCard;
  onStepChange?: (stepIndex: number) => void;
}

const CHOICES = [
  "Remove the friction force",
  "Flip friction to oppose motion",
  "Add a horizontal force",
  "Increase the normal force",
];

export function MissionCanvas({ mission, onStepChange }: MissionCanvasProps) {
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const isCorrect = selectedChoice === 1;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      {/* Mission card */}
      <div className="rounded-lg border border-border p-4">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {mission.title}
        </p>
        <p className="text-sm leading-relaxed text-foreground">
          {mission.scenarioPrompt}
        </p>
      </div>

      {/* Interactive widget: stepper / diagram placeholder */}
      <div className="rounded-lg border border-dashed border-border p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Diagram &middot; step {mission.stepIndex + 1}/{mission.stepTotal}
        </p>
        <div className="flex items-center justify-center gap-3 py-10">
          <button
            type="button"
            onClick={() => onStepChange?.(Math.max(0, mission.stepIndex - 1))}
            disabled={mission.stepIndex === 0}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: mission.stepTotal }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i === mission.stepIndex ? "bg-foreground" : "bg-border"
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onStepChange?.(Math.min(mission.stepTotal - 1, mission.stepIndex + 1))
            }
            disabled={mission.stepIndex === mission.stepTotal - 1}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Diagram / map / slider renders here
        </p>
      </div>

      {/* Answer choices */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Your answer
        </p>
        <ul className="space-y-2">
          {CHOICES.map((label, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => !submitted && setSelectedChoice(i)}
                disabled={submitted}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                  selectedChoice === i && !submitted && "border-foreground bg-foreground/5",
                  selectedChoice !== i && "border-border hover:border-foreground/30",
                  submitted && i === 1 && "border-foreground bg-foreground text-background",
                  submitted && selectedChoice === i && i !== 1 && "border-foreground/30 bg-muted text-muted-foreground line-through"
                )}
              >
                {submitted && i === 1 && <Check className="h-3.5 w-3.5" />}
                {label}
              </button>
            </li>
          ))}
        </ul>
        {!submitted ? (
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            disabled={selectedChoice === null}
            className="mt-3 w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-30"
          >
            Submit
          </button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {isCorrect
              ? "Correct. Friction must oppose the direction of motion."
              : "Not quite. Check the hints on the right."}
          </p>
        )}
      </div>
    </div>
  );
}
