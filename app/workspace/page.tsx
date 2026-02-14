"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { TopicNav } from "@/components/workspace/topic-nav";
import { MissionCanvas } from "@/components/workspace/mission-canvas";
import { SupportPanel } from "@/components/workspace/support-panel";
import {
  MOCK_TOPICS,
  MOCK_MISSION,
  MOCK_HINTS,
  MOCK_CHECKLIST,
  MOCK_MISCONCEPTIONS,
} from "@/lib/workspace-mock";
import type { ChecklistItem, HintLevel } from "@/types";

export default function WorkspacePage() {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    MOCK_TOPICS[0]?.id ?? null
  );
  const [mission, setMission] = useState(MOCK_MISSION);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(MOCK_CHECKLIST);
  const [hints, setHints] = useState<HintLevel[]>(MOCK_HINTS);

  const handleChecklistToggle = useCallback((id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  }, []);

  const handleRevealHint = useCallback((level: number) => {
    setHints((prev) =>
      prev.map((h) => (h.level === level ? { ...h, revealed: true } : h))
    );
  }, []);

  return (
    <main className="flex h-screen flex-col bg-background">
      {/* Thin header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium text-foreground">
          LastMinute.ai
        </span>
        <Link
          href="/"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Back
        </Link>
      </header>

      {/* 3-panel grid */}
      <div className="grid flex-1 grid-cols-[200px_1fr_240px] overflow-hidden">
        <TopicNav
          topics={MOCK_TOPICS}
          selectedId={selectedTopicId}
          onSelect={setSelectedTopicId}
        />
        <MissionCanvas
          mission={mission}
          onStepChange={(stepIndex) =>
            setMission((m) => ({ ...m, stepIndex }))
          }
        />
        <SupportPanel
          checklist={checklist}
          onChecklistToggle={handleChecklistToggle}
          hints={hints}
          onRevealHint={handleRevealHint}
          misconceptions={MOCK_MISCONCEPTIONS}
        />
      </div>
    </main>
  );
}
