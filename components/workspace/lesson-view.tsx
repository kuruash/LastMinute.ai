"use client";

import { useRef, useEffect } from "react";
import type { TopicLesson } from "@/types";
import { SectionCard } from "@/components/workspace/section-card";
import { Lock, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LessonViewProps {
  lessons: TopicLesson[];
  activeTopicId: string | null;
  loading: boolean;
  onSubmitAnswer: (
    topicId: string,
    sectionId: string,
    answer: string
  ) => Promise<void>;
  onCompleteTopic: (topicId: string) => void;
}

export function LessonView({
  lessons,
  activeTopicId,
  loading,
  onSubmitAnswer,
  onCompleteTopic,
}: LessonViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to active topic when it changes
  useEffect(() => {
    if (activeTopicId && scrollRef.current) {
      const el = scrollRef.current.querySelector(
        `[data-topic-id="${activeTopicId}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [activeTopicId]);

  /* ---- Loading state ---- */
  if (loading && lessons.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm text-foreground">
            Generating your lessons...
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Building structured content for each topic
          </p>
        </div>
      </div>
    );
  }

  if (lessons.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No lessons available. Upload study materials first.
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {lessons.map((lesson) => {
          const isActive = lesson.status === "active";
          const isCompleted = lesson.status === "completed";
          const isLocked = lesson.status === "locked";

          const practiceCount = lesson.sections.filter(
            (s) => s.type === "practice"
          ).length;
          const answeredCount = lesson.sections.filter(
            (s) => s.type === "practice" && s.answered
          ).length;
          const allAnswered = practiceCount > 0 && answeredCount === practiceCount;

          return (
            <div
              key={lesson.topicId}
              data-topic-id={lesson.topicId}
              className={cn(
                "mb-10 last:mb-0",
                isLocked && "opacity-50 pointer-events-none"
              )}
            >
              {/* Topic header */}
              <div className="mb-6 flex items-center gap-3">
                {isCompleted && (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-foreground" />
                )}
                {isLocked && (
                  <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                {isActive && (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-foreground" />
                )}
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {lesson.topicName}
                </h2>
                {isCompleted && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Completed
                  </span>
                )}
                {isActive && practiceCount > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {answeredCount}/{practiceCount} answered
                  </span>
                )}
              </div>

              {/* Sections */}
              {!isLocked && (
                <div className="space-y-5">
                  {lesson.sections.map((section) => (
                    <SectionCard
                      key={section.id}
                      section={section}
                      onSubmitAnswer={async (sectionId, answer) => {
                        await onSubmitAnswer(lesson.topicId, sectionId, answer);
                      }}
                    />
                  ))}

                  {/* Complete topic button */}
                  {isActive && allAnswered && (
                    <div className="flex justify-center pt-4">
                      <button
                        type="button"
                        onClick={() => onCompleteTopic(lesson.topicId)}
                        className="flex items-center gap-2 rounded-md border border-foreground bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                      >
                        Complete Topic
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Locked placeholder */}
              {isLocked && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <Lock className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Complete the previous topic to unlock
                  </p>
                </div>
              )}

              {/* Divider between topics */}
              <div className="mt-10 border-t border-border" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
