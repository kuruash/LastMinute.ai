"use client";

import { cn } from "@/lib/utils";
import { Lock, CheckCircle2 } from "lucide-react";
import type { TopicLessonStatus } from "@/types";

interface TopicNavItem {
  id: string;
  name: string;
  progress: number;
  weak: boolean;
  status?: TopicLessonStatus;
}

interface TopicNavProps {
  topics: TopicNavItem[];
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
          {topics.map((topic) => {
            const isLocked = topic.status === "locked";
            const isCompleted = topic.status === "completed";
            const isActive = topic.status === "active";
            const isSelected = selectedId === topic.id;

            return (
              <li key={topic.id}>
                <button
                  type="button"
                  onClick={() => !isLocked && onSelect(topic.id)}
                  disabled={isLocked}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    isLocked
                      ? "cursor-not-allowed text-muted-foreground/40"
                      : isSelected
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-muted"
                  )}
                >
                  {/* Status icon */}
                  {isCompleted ? (
                    <CheckCircle2
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isSelected ? "text-background" : "text-foreground"
                      )}
                    />
                  ) : isLocked ? (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  ) : (
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        isActive
                          ? isSelected
                            ? "bg-background"
                            : "bg-foreground"
                          : isSelected
                            ? "bg-background/50"
                            : "bg-muted-foreground/40"
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{topic.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
