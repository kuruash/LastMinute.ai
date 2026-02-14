"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopicNav } from "@/components/workspace/topic-nav";
import { MissionCanvas, type FlowBlock } from "@/components/workspace/mission-canvas";
import { SupportPanel } from "@/components/workspace/support-panel";
import { buildInitialBlocks } from "@/lib/parse-story";
import { Loader2 } from "lucide-react";
import type {
  ChecklistItem,
  HintLevel,
  WorkspaceTopic,
  MisconceptionLogEntry,
} from "@/types";

type LoadState = "loading" | "ready" | "error";

export default function WorkspacePage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  /* ---- data ---- */
  const [missionTitle, setMissionTitle] = useState("");
  const [concepts, setConcepts] = useState<string[]>([]);
  const [topics, setTopics] = useState<WorkspaceTopic[]>([]);
  const [initialBlocks, setInitialBlocks] = useState<FlowBlock[]>([]);
  const [phase, setPhase] = useState("briefing");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [hints, setHints] = useState<HintLevel[]>([]);
  const [misconceptions] = useState<MisconceptionLogEntry[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [tutorContext, setTutorContext] = useState("");
  const [interactionCount, setInteractionCount] = useState(0);

  /* ---- load session from API ---- */
  useEffect(() => {
    if (!sessionId) {
      setErrorMsg("No session ID. Upload your materials first.");
      setLoadState("error");
      return;
    }

    let cancelled = false;

    async function loadSession() {
      try {
        const res = await fetch(`/api/session?id=${sessionId}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to load session");
        }

        const session = await res.json();
        if (cancelled) return;

        // Title
        setMissionTitle(
          session.interactive_story?.title || "Your Mission"
        );

        // Concepts & topics
        const sessionConcepts: string[] = session.concepts ?? [];
        setConcepts(sessionConcepts);
        const newTopics: WorkspaceTopic[] = sessionConcepts.map(
          (c: string, i: number) => ({
            id: `t-${i}`,
            name: c,
            progress: 0,
            weak: false,
          })
        );
        setTopics(newTopics);
        setSelectedTopicId(newTopics[0]?.id ?? null);

        // Initial flow blocks from the story
        const story = session.interactive_story ?? {
          title: "",
          opening: "",
          checkpoint: "",
          boss_level: "",
        };
        setInitialBlocks(buildInitialBlocks(story));

        // Checklist
        const sessionChecklist: string[] = session.checklist ?? [];
        setChecklist(
          sessionChecklist.map((label: string, i: number) => ({
            id: `cl-${i}`,
            label,
            done: false,
          }))
        );

        // Hints from storytelling
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

        // Tutor context
        setTutorContext(
          [
            story.title,
            `Concepts: ${sessionConcepts.join(", ")}`,
            storytelling,
            session.source_text?.slice(0, 4000),
          ]
            .filter(Boolean)
            .join("\n\n")
        );

        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to load session"
        );
        setLoadState("error");
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /* ---- handlers ---- */
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

  const handlePhaseChange = useCallback(
    (newPhase: string) => {
      setPhase(newPhase);
      // Update topic progress
      const phaseProgress: Record<string, number> = {
        briefing: 0,
        checkpoint: 0.33,
        boss: 0.66,
        complete: 1,
      };
      const progress = phaseProgress[newPhase] ?? 0;
      setTopics((prev) =>
        prev.map((t, i) => (i === 0 ? { ...t, progress } : t))
      );
    },
    []
  );

  /* ---- loading ---- */
  if (loadState === "loading") {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading mission...</p>
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
  const completedPhases = ["checkpoint", "boss", "complete"].indexOf(phase);

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
          topics={topics}
          selectedId={selectedTopicId ?? topics[0]?.id ?? null}
          onSelect={setSelectedTopicId}
        />
        <MissionCanvas
          sessionId={sessionId!}
          title={missionTitle}
          concepts={concepts}
          initialBlocks={initialBlocks}
          phase={phase}
          onPhaseChange={handlePhaseChange}
          onInteraction={() => setInteractionCount((c) => c + 1)}
        />
        <SupportPanel
          checklist={checklist}
          onChecklistToggle={handleChecklistToggle}
          hints={hints}
          onRevealHint={handleRevealHint}
          misconceptions={misconceptions}
          tutorContext={tutorContext}
          completedSteps={Math.max(0, completedPhases)}
          totalSteps={3}
        />
      </div>
    </main>
  );
}
