"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ChecklistItem, HintLevel, MisconceptionLogEntry } from "@/types";
import { Check, Mic, MessageCircle } from "lucide-react";

interface SupportPanelProps {
  checklist: ChecklistItem[];
  onChecklistToggle: (id: string) => void;
  hints: HintLevel[];
  onRevealHint: (level: number) => void;
  misconceptions: MisconceptionLogEntry[];
}

export function SupportPanel({
  checklist,
  onChecklistToggle,
  hints,
  onRevealHint,
  misconceptions,
}: SupportPanelProps) {
  const [tutorOpen, setTutorOpen] = useState(false);

  return (
    <div className="flex h-full flex-col border-l border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Support
        </h2>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* Checklist */}
        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            To do
          </h3>
          <ul className="space-y-1">
            {checklist.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onChecklistToggle(item.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
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
                  <span className={cn("text-sm", item.done && "text-muted-foreground line-through")}>
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Ask tutor */}
        <section>
          <button
            type="button"
            onClick={() => setTutorOpen(!tutorOpen)}
            className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Mic className="h-3.5 w-3.5" />
            Ask tutor
          </button>
          {tutorOpen && (
            <p className="mt-2 text-xs text-muted-foreground">
              Voice tutor connects here. Tap the mic to ask a question.
            </p>
          )}
        </section>

        {/* Hint ladder */}
        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Hints
          </h3>
          <div className="space-y-1.5">
            {hints.map((h) => (
              <div
                key={h.level}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  h.revealed ? "border-border" : "border-dashed border-border"
                )}
              >
                <button
                  type="button"
                  onClick={() => !h.revealed && onRevealHint(h.level)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm text-foreground">Hint {h.level}</span>
                  {!h.revealed && (
                    <span className="text-[11px] text-muted-foreground underline">
                      reveal
                    </span>
                  )}
                </button>
                {h.revealed && (
                  <p className="mt-1 text-xs text-muted-foreground">{h.text}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Misconception log */}
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
                <span className="text-xs text-muted-foreground">{m.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
