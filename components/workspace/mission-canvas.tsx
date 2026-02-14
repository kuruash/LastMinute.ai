"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, Loader2, Trophy } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FlowBlock {
  id: string;
  role: "narrative" | "prompt" | "user" | "feedback";
  content: string;
  phase: string;
}

interface MissionCanvasProps {
  sessionId: string;
  title: string;
  concepts: string[];
  /** Initial flow blocks (opening narrative + first prompt) */
  initialBlocks: FlowBlock[];
  /** Current phase of the mission */
  phase: string;
  onPhaseChange: (phase: string) => void;
  onInteraction: () => void;
}

/* ------------------------------------------------------------------ */
/*  Block renderer                                                     */
/* ------------------------------------------------------------------ */

function FlowBlockView({ block }: { block: FlowBlock }) {
  switch (block.role) {
    case "narrative":
      return (
        <div className="rounded-lg border border-border p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">
            {block.phase === "briefing"
              ? "The Briefing"
              : block.phase === "checkpoint"
                ? "The Checkpoint"
                : block.phase === "boss"
                  ? "Final Boss"
                  : "Mission"}
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {block.content}
          </p>
        </div>
      );

    case "prompt":
      return (
        <div className="rounded-lg border border-dashed border-foreground/30 bg-muted/20 p-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {block.content}
          </p>
        </div>
      );

    case "user":
      return (
        <div className="ml-12 rounded-lg bg-foreground px-4 py-3 text-sm text-background">
          {block.content}
        </div>
      );

    case "feedback":
      return (
        <div className="rounded-lg border border-border bg-muted/10 p-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
            Feedback
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {block.content}
          </p>
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Mission complete                                                   */
/* ------------------------------------------------------------------ */

function MissionComplete() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-foreground">
        <Trophy className="h-7 w-7 text-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        Mission complete
      </h3>
      <p className="max-w-xs text-sm text-muted-foreground">
        Check off your study tasks on the right. Use the tutor if you need help
        with anything.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function MissionCanvas({
  sessionId,
  title,
  concepts,
  initialBlocks,
  phase,
  onPhaseChange,
  onInteraction,
}: MissionCanvasProps) {
  const [blocks, setBlocks] = useState<FlowBlock[]>(initialBlocks);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isDone = phase === "complete";

  // Sync initial blocks when they change (e.g. session loaded)
  useEffect(() => {
    if (initialBlocks.length > 0) {
      setBlocks(initialBlocks);
    }
  }, [initialBlocks]);

  // Auto-scroll when new blocks arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [blocks, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || isDone) return;

    // Add user's response to the flow
    const userBlock: FlowBlock = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      phase,
    };
    setBlocks((prev) => [...prev, userBlock]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userInput: text,
          phase,
        }),
      });
      const data = await res.json();

      const newBlocks: FlowBlock[] = [];

      // AI feedback
      if (data.feedback) {
        newBlocks.push({
          id: `feedback-${Date.now()}`,
          role: "feedback",
          content: data.feedback,
          phase: data.phase ?? phase,
        });
      }

      // Next prompt (if not done)
      if (data.nextPrompt && !data.done) {
        newBlocks.push({
          id: `prompt-${Date.now()}`,
          role: "prompt",
          content: data.nextPrompt,
          phase: data.phase ?? phase,
        });
      }

      setBlocks((prev) => [...prev, ...newBlocks]);

      if (data.phase && data.phase !== phase) {
        onPhaseChange(data.phase);
      }

      onInteraction();
    } catch {
      setBlocks((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "feedback",
          content: "Something went wrong. Try again.",
          phase,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {title || "Your Mission"}
        </h2>
        {concepts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {concepts.map((c) => (
              <span
                key={c}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Scrolling flow */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {blocks.map((block) => (
          <FlowBlockView key={block.id} block={block} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-border px-4 py-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Evaluating your response...
            </span>
          </div>
        )}

        {isDone && <MissionComplete />}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      {!isDone && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              rows={2}
              disabled={loading}
              className={cn(
                "flex-1 resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground focus:border-foreground focus:outline-none",
                "disabled:opacity-50"
              )}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
