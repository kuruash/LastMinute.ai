"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopicNav } from "@/components/workspace/topic-nav";
import { LessonView } from "@/components/workspace/lesson-view";
import { SupportPanel } from "@/components/workspace/support-panel";
import { Loader2 } from "lucide-react";
import type {
  TopicLesson,
  ChecklistItem,
  HintLevel,
  MisconceptionLogEntry,
} from "@/types";

type LoadState = "loading" | "generating" | "ready" | "error";

export default function WorkspacePage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  /* ---- data ---- */
  const [lessons, setLessons] = useState<TopicLesson[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [hints, setHints] = useState<HintLevel[]>([]);
  const [misconceptions] = useState<MisconceptionLogEntry[]>([]);
  const [tutorContext, setTutorContext] = useState("");

  /* ---- load session & generate lessons ---- */
  useEffect(() => {
    if (!sessionId) {
      setErrorMsg("No session ID. Upload your materials first.");
      setLoadState("error");
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        // 1. Fetch session
        const sessionRes = await fetch(`/api/session?id=${sessionId}`);
        if (!sessionRes.ok) {
          const data = await sessionRes.json();
          throw new Error(data.error ?? "Failed to load session");
        }

        const session = await sessionRes.json();
        if (cancelled) return;

        // Build tutor context
        setTutorContext(
          [
            session.interactive_story?.title,
            `Concepts: ${(session.concepts || []).join(", ")}`,
            session.final_storytelling,
            session.source_text?.slice(0, 4000),
          ]
            .filter(Boolean)
            .join("\n\n")
        );

        // Build hints from storytelling
        const storytelling: string = session.final_storytelling ?? "";
        if (storytelling) {
          const paragraphs = storytelling
            .split("\n\n")
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 20)
            .slice(0, 5);
          setHints(
            paragraphs.map((text: string, i: number) => ({
              level: i + 1,
              text,
              revealed: false,
            }))
          );
        }

        // If the session already has lessons (e.g. from a previous load), use them
        if (session.lessons && session.lessons.length > 0) {
          setLessons(session.lessons);
          const firstActive = session.lessons.find(
            (l: TopicLesson) => l.status === "active"
          );
          setActiveTopicId(
            firstActive?.topicId || session.lessons[0]?.topicId || null
          );
          buildChecklist(session.lessons);
          setLoadState("ready");
          return;
        }

        // 2. Generate lessons
        setLoadState("generating");

        const lessonsRes = await fetch("/api/generate-lessons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (!lessonsRes.ok) {
          const data = await lessonsRes.json();
          throw new Error(data.error ?? "Failed to generate lessons");
        }

        const lessonsData = await lessonsRes.json();
        if (cancelled) return;

        const generatedLessons: TopicLesson[] = lessonsData.lessons || [];
        setLessons(generatedLessons);

        // Set active topic
        const firstActive = generatedLessons.find(
          (l) => l.status === "active"
        );
        setActiveTopicId(
          firstActive?.topicId || generatedLessons[0]?.topicId || null
        );

        buildChecklist(generatedLessons);
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to load session"
        );
        setLoadState("error");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /* ---- helpers ---- */
  function buildChecklist(topicLessons: TopicLesson[]) {
    setChecklist(
      topicLessons.map((lesson) => ({
        id: lesson.topicId,
        label: lesson.topicName,
        done: lesson.status === "completed",
      }))
    );
  }

  /* ---- handlers ---- */
  const handleSubmitAnswer = useCallback(
    async (topicId: string, sectionId: string, answer: string) => {
      if (!sessionId) return;

      const res = await fetch("/api/evaluate-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, topicId, sectionId, answer }),
      });

      if (!res.ok) {
        console.error("Failed to evaluate answer");
        return;
      }

      const result = await res.json();

      // Update the local lesson state with the feedback
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.topicId !== topicId) return lesson;
          return {
            ...lesson,
            sections: lesson.sections.map((section) => {
              if (section.id !== sectionId) return section;
              return {
                ...section,
                userAnswer: answer,
                aiFeedback: result.feedback,
                answered: true,
              };
            }),
          };
        })
      );
    },
    [sessionId]
  );

  const handleCompleteTopic = useCallback(
    async (topicId: string) => {
      // Update local state
      setLessons((prev) => {
        const updated = prev.map((lesson, idx) => {
          if (lesson.topicId === topicId) {
            return { ...lesson, status: "completed" as const };
          }
          // Unlock next topic
          const currentIdx = prev.findIndex((l) => l.topicId === topicId);
          if (idx === currentIdx + 1 && lesson.status === "locked") {
            return { ...lesson, status: "active" as const };
          }
          return lesson;
        });

        // Set active topic to the next one
        const nextActive = updated.find((l) => l.status === "active");
        if (nextActive) {
          setActiveTopicId(nextActive.topicId);
        }

        // Update checklist
        buildChecklist(updated);

        return updated;
      });

      // Persist to server
      if (sessionId) {
        try {
          // We don't have a dedicated "complete" endpoint but the session
          // store is updated via evaluate-answer calls. The completeTopicAndAdvance
          // lives server-side, so we call session API to sync.
          // For now local state is the source of truth. A proper sync would
          // use a dedicated endpoint, but this works for dev.
        } catch (err) {
          console.error("Failed to sync topic completion:", err);
        }
      }
    },
    [sessionId]
  );

  const handleChecklistToggle = useCallback((id: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      )
    );
  }, []);

  const handleRevealHint = useCallback((level: number) => {
    setHints((prev) =>
      prev.map((h) => (h.level === level ? { ...h, revealed: true } : h))
    );
  }, []);

  const handleTopicSelect = useCallback(
    (topicId: string) => {
      // Only allow navigating to active or completed topics
      const topic = lessons.find((l) => l.topicId === topicId);
      if (topic && topic.status !== "locked") {
        setActiveTopicId(topicId);
      }
    },
    [lessons]
  );

  /* ---- loading ---- */
  if (loadState === "loading") {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading session...</p>
        </div>
      </main>
    );
  }

  /* ---- error ---- */
  if (loadState === "error") {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <h1 className="font-mono text-lg font-bold tracking-tighter text-foreground">
          lastminute<span className="text-muted-foreground">.ai</span>
        </h1>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <Link
          href="/"
          className="rounded-md border border-foreground px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          Go back and upload
        </Link>
      </main>
    );
  }

  /* ---- workspace ---- */
  const completedCount = lessons.filter(
    (l) => l.status === "completed"
  ).length;

  // Build topic nav data from lessons
  const topicNavItems = lessons.map((lesson) => ({
    id: lesson.topicId,
    name: lesson.topicName,
    progress: lesson.status === "completed" ? 1 : lesson.status === "active" ? 0.5 : 0,
    weak: false,
    status: lesson.status,
  }));

  return (
    <main className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-sm font-bold tracking-tighter text-foreground">
          lastminute<span className="text-muted-foreground">.ai</span>
        </span>
        <Link
          href="/"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Back
        </Link>
      </header>

      <div className="grid flex-1 grid-cols-[200px_1fr_260px] overflow-hidden">
        <TopicNav
          topics={topicNavItems}
          selectedId={activeTopicId}
          onSelect={handleTopicSelect}
        />
        <LessonView
          lessons={lessons}
          activeTopicId={activeTopicId}
          loading={loadState === "generating"}
          onSubmitAnswer={handleSubmitAnswer}
          onCompleteTopic={handleCompleteTopic}
        />
        <SupportPanel
          checklist={checklist}
          onChecklistToggle={handleChecklistToggle}
          hints={hints}
          onRevealHint={handleRevealHint}
          misconceptions={misconceptions}
          tutorContext={tutorContext}
          completedSteps={completedCount}
          totalSteps={lessons.length}
        />
      </div>
    </main>
  );
}
