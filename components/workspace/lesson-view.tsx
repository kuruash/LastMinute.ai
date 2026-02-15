"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { TopicStorylineCard } from "@/types";
import type { StoryBeat } from "@/app/api/upload/route";
import { ChevronLeft, ChevronRight, Loader2, Play, Square, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface LessonViewProps {
  activeTopicId: string | null;
  missionTitle: string;
  missionStory: string;
  topicStorylines: TopicStorylineCard[];
  storyBeats: StoryBeat[];
  currentStoryIndex: number;
  totalStories: number;
  canGoPrevStory: boolean;
  canGoNextStory: boolean;
  onPrevStory: () => void;
  onNextStory: () => void;
  loading: boolean;
  /** When on last topic, show "Take a Quiz" CTA; called when user clicks it */
  onTakeQuiz?: () => void;
}

/** Try to find beat images relevant to this topic card's concepts */
function findBeatsForTopic(
  card: TopicStorylineCard,
  beats: StoryBeat[]
): StoryBeat[] {
  if (!beats || beats.length === 0) return [];
  const topicLabels = [
    ...card.topics.map((t) => t.toLowerCase().trim()),
    ...card.subtopics.map((s) => s.toLowerCase().trim()),
    card.title.toLowerCase().trim(),
  ].filter(Boolean);

  return beats.filter((beat) => {
    const beatLabel = beat.label.toLowerCase().trim();
    if (!beatLabel) return false;
    return topicLabels.some(
      (tl) => tl.includes(beatLabel) || beatLabel.includes(tl)
    );
  });
}

/** Collect up to 2 images from beats for this topic (for interleaving in the story) */
function getTopicImages(beats: StoryBeat[]): Array<{ image_data: string; step_label: string }> {
  const out: Array<{ image_data: string; step_label: string }> = [];
  for (const beat of beats) {
    for (const step of beat.image_steps) {
      if (step.image_data?.trim()) {
        out.push({
          image_data: step.image_data,
          step_label: step.step_label || beat.label,
        });
        if (out.length >= 2) return out;
      }
    }
  }
  return out;
}

/** Single visual block (one image + optional caption) — compact so images don’t dominate */
function TopicVisual({ stepLabel, imageData }: { stepLabel: string; imageData: string }) {
  return (
    <div className="my-5 max-w-4xl overflow-hidden rounded-lg border border-border bg-muted/20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageData}
        alt={stepLabel}
        className="h-auto max-h-[480px] w-full object-contain"
        draggable={false}
      />
      {stepLabel && (
        <p className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          {stepLabel}
        </p>
      )}
    </div>
  );
}

export function LessonView({
  activeTopicId,
  missionTitle,
  missionStory,
  topicStorylines,
  storyBeats,
  currentStoryIndex,
  totalStories,
  canGoPrevStory,
  canGoNextStory,
  onPrevStory,
  onNextStory,
  loading,
  onTakeQuiz,
}: LessonViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationUrlRef = useRef<string | null>(null);
  const [narratingTopicIndex, setNarratingTopicIndex] = useState<number | null>(null);

  const stopNarration = useCallback(() => {
    const audio = narrationAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
    }
    if (narrationUrlRef.current) {
      URL.revokeObjectURL(narrationUrlRef.current);
      narrationUrlRef.current = null;
    }
    setNarratingTopicIndex(null);
  }, []);

  const playNarration = useCallback(async (card: TopicStorylineCard, topicIndex: number) => {
    stopNarration();
    const parts: string[] = [];
    const title = (card.title || "").trim();
    if (title) parts.push(title + ".");
    const story = (card.story || "").trim();
    if (story) parts.push(story);
    const explainers = card.friend_explainers;
    if (Array.isArray(explainers) && explainers.length > 0) {
      parts.push("Key points. " + explainers.map((e) => String(e).trim()).filter(Boolean).join(" "));
    }
    const text = parts.join("\n\n").slice(0, 5000);
    if (!text) return;
    setNarratingTopicIndex(topicIndex);
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      narrationUrlRef.current = url;
      let audio = narrationAudioRef.current;
      if (!audio) {
        audio = new Audio();
        narrationAudioRef.current = audio;
      }
      audio.onended = stopNarration;
      audio.onerror = stopNarration;
      audio.src = url;
      audio.volume = 1;
      await audio.play();
    } catch {
      setNarratingTopicIndex(null);
    }
  }, [stopNarration]);

  useEffect(() => {
    return () => {
      if (narrationUrlRef.current) URL.revokeObjectURL(narrationUrlRef.current);
    };
  }, []);

  useEffect(() => {
    stopNarration();
  }, [currentStoryIndex, stopNarration]);

  const cleanCardTitle = (rawTitle: string, fallback: string) => {
    const cleaned = rawTitle
      .replace(/^explanation\s*[-—:]\s*/i, "")
      .replace(/^story\s*card\s*\d+\s*[-—:]\s*/i, "")
      .trim();
    return cleaned || fallback;
  };

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

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm text-foreground">
            Loading your story cards...
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Preparing your mission workspace
          </p>
        </div>
      </div>
    );
  }

  if (topicStorylines.length === 0 && !missionStory.trim()) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No story cards available. Upload study materials first.
        </p>
      </div>
    );
  }

  // Match beats to topics: first by label match, then by position (1:1), then round-robin
  const beatsByTopicIndex: Map<number, StoryBeat[]> = new Map();
  const usedBeatIndices = new Set<number>();

  // Pass 1: match by label (fuzzy)
  topicStorylines.forEach((card, topicIdx) => {
    const matched = findBeatsForTopic(card, storyBeats);
    if (matched.length > 0) {
      beatsByTopicIndex.set(topicIdx, [...matched]);
      matched.forEach((b) => {
        const bi = storyBeats.indexOf(b);
        if (bi >= 0) usedBeatIndices.add(bi);
      });
    }
  });

  // Pass 2: for topics with no label match, try positional (beat[i] → topic[i])
  topicStorylines.forEach((_, topicIdx) => {
    if (beatsByTopicIndex.has(topicIdx)) return;
    if (topicIdx < storyBeats.length && !usedBeatIndices.has(topicIdx)) {
      const beat = storyBeats[topicIdx];
      if (beat.image_steps.some((s) => s.image_data)) {
        beatsByTopicIndex.set(topicIdx, [beat]);
        usedBeatIndices.add(topicIdx);
      }
    }
  });

  // Pass 3: any remaining unmatched beats → distribute round-robin to topics without images
  const unmatchedBeats = storyBeats.filter(
    (_, i) => !usedBeatIndices.has(i) && storyBeats[i].image_steps.some((s) => s.image_data)
  );
  if (unmatchedBeats.length > 0) {
    const emptyTopicIndices = Array.from(
      { length: topicStorylines.length },
      (_, i) => i
    ).filter((i) => !beatsByTopicIndex.has(i));

    unmatchedBeats.forEach((beat, i) => {
      const targetIdx =
        emptyTopicIndices.length > 0
          ? emptyTopicIndices[i % emptyTopicIndices.length]
          : i % topicStorylines.length;
      const existing = beatsByTopicIndex.get(targetIdx) ?? [];
      existing.push(beat);
      beatsByTopicIndex.set(targetIdx, existing);
    });
  }

  const currentBeats = beatsByTopicIndex.get(currentStoryIndex) ?? [];

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {topicStorylines.length > 0 ? (
          <section className="mb-8 space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-5">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {missionTitle}
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Story-driven revision guide for your exam prep.
              </p>
            </div>
            {topicStorylines
              .filter((_, idx) => idx === currentStoryIndex)
              .map((card) => {
              const absoluteIdx = currentStoryIndex;
              const importance = card.importance?.toLowerCase?.() ?? "medium";
              const importanceClass =
                importance === "high"
                  ? "border-foreground/50 bg-foreground/5 text-foreground"
                  : importance === "low"
                    ? "border-border bg-muted text-muted-foreground"
                    : "border-border bg-background text-foreground";
              return (
                <article
                  key={`${card.title}-${absoluteIdx}`}
                  data-topic-id={`story-${absoluteIdx}`}
                  className="rounded-lg border border-border bg-background p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                      Explanation —{" "}
                      {cleanCardTitle(card.title || "", `Focus Area ${absoluteIdx + 1}`)}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          narratingTopicIndex === absoluteIdx
                            ? stopNarration()
                            : playNarration(card, absoluteIdx)
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors",
                          narratingTopicIndex === absoluteIdx
                            ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        title={narratingTopicIndex === absoluteIdx ? "Stop narration" : "Play story narration"}
                      >
                        {narratingTopicIndex === absoluteIdx ? (
                          <>
                            <Square className="h-3 w-3" />
                            Stop
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3" />
                            Listen
                          </>
                        )}
                      </button>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                          importanceClass
                        )}
                      >
                        {importance.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {card.topics.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.topics.map((topic) => (
                        <span
                          key={topic}
                          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}

                  {card.subtopics.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {card.subtopics.map((subtopic, subIdx) => (
                        <li
                          key={`${subtopic}-${subIdx}`}
                          className="text-sm text-muted-foreground"
                        >
                          • {subtopic}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Story with up to 2 images interleaved (after first paragraph, then after middle) */}
                  {(() => {
                    const rawParagraphs = (card.story || "")
                      .split(/\n\n+/)
                      .map((p) => p.trim())
                      .filter(Boolean);
                    const paragraphs: string[] = [];
                    for (const p of rawParagraphs) {
                      if (paragraphs[paragraphs.length - 1] !== p) paragraphs.push(p);
                    }
                    const topicImages = getTopicImages(currentBeats);
                    if (paragraphs.length === 0) {
                      return (
                        topicImages.length > 0 && (
                          <div className="mt-4 space-y-6">
                            {topicImages.map((img, i) => (
                              <TopicVisual
                                key={i}
                                stepLabel={img.step_label}
                                imageData={img.image_data}
                              />
                            ))}
                          </div>
                        )
                      );
                    }
                    const segments: Array<
                      { type: "text"; content: string } | { type: "image"; step_label: string; image_data: string }
                    > = [];
                    let imgIdx = 0;
                    paragraphs.forEach((p, i) => {
                      segments.push({ type: "text", content: p });
                      if (imgIdx === 0 && i === 0 && topicImages[0]) {
                        segments.push({
                          type: "image",
                          step_label: topicImages[0].step_label,
                          image_data: topicImages[0].image_data,
                        });
                        imgIdx = 1;
                      } else if (
                        imgIdx === 1 &&
                        topicImages[1] &&
                        (i === 1 || (paragraphs.length > 3 && i === 2))
                      ) {
                        segments.push({
                          type: "image",
                          step_label: topicImages[1].step_label,
                          image_data: topicImages[1].image_data,
                        });
                        imgIdx = 2;
                      }
                    });
                    return (
                      <div className="mt-4 space-y-4">
                        {segments.map((seg, i) =>
                          seg.type === "text" ? (
                            <p
                              key={`p-${i}`}
                              className="text-sm leading-relaxed text-foreground whitespace-pre-line"
                            >
                              {seg.content}
                            </p>
                          ) : (
                            <TopicVisual
                              key={`img-${i}`}
                              stepLabel={seg.step_label}
                              imageData={seg.image_data}
                            />
                          )
                        )}
                      </div>
                    );
                  })()}

                  {card.friend_explainers && card.friend_explainers.length > 0 && (
                    <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
                      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Friend-style explainers
                      </p>
                      <ul className="space-y-1.5">
                        {card.friend_explainers.map((line, lineIdx) => (
                          <li
                            key={`${line}-${lineIdx}`}
                            className="text-sm text-muted-foreground"
                          >
                            • {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Topic {Math.min(currentStoryIndex + 1, Math.max(totalStories, 1))} / {Math.max(totalStories, 1)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPrevStory}
                  disabled={!canGoPrevStory}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    canGoPrevStory
                      ? "border-border text-foreground hover:bg-muted"
                      : "cursor-not-allowed border-border text-muted-foreground/40"
                  )}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back Topic
                </button>
                <button
                  type="button"
                  onClick={onNextStory}
                  disabled={!canGoNextStory}
                  className={cn(
                    "flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    canGoNextStory
                      ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                      : "cursor-not-allowed border-border text-muted-foreground/40"
                  )}
                >
                  Next Topic
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {!canGoNextStory && totalStories > 0 && onTakeQuiz && (
              <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-100">
                  You&apos;ve reached the end of the topics.
                </p>
                <p className="mb-3 text-xs text-amber-800/90 dark:text-amber-200/90">
                  Test yourself with a quiz generated from your slides and material.
                </p>
                <button
                  type="button"
                  onClick={onTakeQuiz}
                  className="flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                >
                  <Trophy className="h-4 w-4" />
                  Take a Quiz
                </button>
              </div>
            )}
          </section>
        ) : missionStory.trim() && (
          <section className="mb-8 rounded-lg border border-border bg-muted/30 p-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {missionTitle}
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {missionStory}
            </p>
          </section>
        )}

      </div>
    </div>
  );
}
