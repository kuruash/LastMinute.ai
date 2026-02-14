"use client";

import { cn } from "@/lib/utils";
import type { WorkspaceTopic } from "@/types";

interface TopicNavProps {
  topics: WorkspaceTopic[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TopicNav({ topics, selectedId, onSelect }: TopicNavProps) {
  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Topics
        </h2>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-px px-2">
          {topics.map((topic) => (
            <li key={topic.id}>
              <button
                type="button"
                onClick={() => onSelect(topic.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  selectedId === topic.id
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-muted"
                )}
              >
                {/* Progress dot */}
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    topic.progress >= 1
                      ? "bg-foreground"
                      : selectedId === topic.id
                        ? "bg-background/50"
                        : "bg-muted-foreground/40"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                {topic.weak && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      selectedId === topic.id
                        ? "bg-background/20 text-background"
                        : "bg-foreground/10 text-foreground"
                    )}
                  >
                    Weak
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
