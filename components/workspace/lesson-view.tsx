"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { TopicCheckpointQuiz, TopicStorylineCard } from "@/types";
import type { StoryBeat } from "@/app/api/upload/route";
import { ChevronLeft, ChevronRight, Loader2, Mic, MicOff, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/use-voice-input";

interface TopicQuizAttempt {
  mcqSelections: (number | null)[];
  mcqChecked: boolean[];
  mcqCorrect: boolean[];
  openAnswer: string;
  openSubmitted: boolean;
  openPassed: boolean;
  openFeedback: string;
}

interface LessonViewProps {
  activeTopicId: string | null;
  missionTitle: string;
  missionStory: string;
  tutorContext: string;
  topicStorylines: TopicStorylineCard[];
  storyBeats: StoryBeat[];
  currentStoryIndex: number;
  totalStories: number;
  canGoPrevStory: boolean;
  canGoNextStory: boolean;
  showQuizPage: boolean;
  canAdvanceFromQuizPage: boolean;
  currentTopicPassed: boolean;
  requireQuizToAdvance: boolean;
  topicQuiz: TopicCheckpointQuiz | null;
  quizAttempt: TopicQuizAttempt | null;
  quizLoading: boolean;
  onPrevStory: () => void;
  onNextStory: () => void;
  onMcqSelect: (topicIdx: number, questionIdx: number, optionIdx: number) => void;
  onMcqCheck: (topicIdx: number, questionIdx: number) => void;
  onOpenAnswerChange: (topicIdx: number, value: string) => void;
  onOpenAnswerSubmit: (topicIdx: number) => void;
  onSkipQuiz: (topicIdx: number) => void;
  onVoiceListeningChange?: (isListening: boolean) => void;
  loading: boolean;
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
        className="mx-auto h-auto max-h-[360px] w-full object-contain sm:max-h-[420px]"
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
  tutorContext,
  topicStorylines,
  storyBeats,
  currentStoryIndex,
  totalStories,
  canGoPrevStory,
  canGoNextStory,
  showQuizPage,
  canAdvanceFromQuizPage,
  currentTopicPassed,
  requireQuizToAdvance,
  topicQuiz,
  quizAttempt,
  quizLoading,
  onPrevStory,
  onNextStory,
  onMcqSelect,
  onMcqCheck,
  onOpenAnswerChange,
  onOpenAnswerSubmit,
  onSkipQuiz,
  onVoiceListeningChange,
  loading,
}: LessonViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const narrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const narrationUrlRef = useRef<string | null>(null);
  const [narratingTopicIndex, setNarratingTopicIndex] = useState<number | null>(null);
  const {
    isSupported: voiceSupported,
    isListening: isVoiceListening,
    transcript: voiceTranscript,
    startListening: startVoiceListening,
    stopListening: stopVoiceListening,
    clearTranscript: clearVoiceTranscript,
  } = useVoiceInput();

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

  const playTtsText = useCallback(async (text: string): Promise<boolean> => {
    const payload = text.trim().slice(0, 5000);
    if (!payload) return false;
    stopNarration();
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payload }),
      });
      if (!resp.ok) {
        stopNarration();
        return false;
      }
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
      return true;
    } catch {
      stopNarration();
      return false;
    }
  }, [stopNarration]);

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
    const ok = await playTtsText(text);
    if (!ok) {
      setNarratingTopicIndex(null);
    }
  }, [playTtsText, stopNarration]);

  const speakDriftHint = useCallback(
    async (params: {
      topicTitle: string;
      question: string;
      selectedOption: string;
      correctOption: string;
      fallbackHint?: string;
    }) => {
      const {
        topicTitle,
        question,
        selectedOption,
        correctOption,
        fallbackHint = "Focus on the core definition, then map it to the question conditions before deciding.",
      } = params;

      let hintText = `You're drifting away from the key idea in ${topicTitle}. Hint: ${fallbackHint}`;
      try {
        const chatRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: tutorContext,
            messages: [
              {
                role: "user",
                content:
                  `I answered a quiz question incorrectly.\n` +
                  `Topic: ${topicTitle}\n` +
                  `Question: ${question}\n` +
                  `My answer: ${selectedOption}\n` +
                  `Correct answer: ${correctOption}\n` +
                  `Give exactly 2 short sentences: 1) where I'm drifting, 2) one actionable hint.`,
              },
            ],
          }),
        });
        const chatData = await chatRes.json().catch(() => ({}));
        const generated = String(chatData?.content ?? "").trim();
        if (
          generated &&
          !/tutor unavailable|connection issue|something went wrong/i.test(generated)
        ) {
          hintText = generated;
        }
      } catch {
        // fall back to local hint
      }

      setNarratingTopicIndex(null);
      await playTtsText(hintText);
    },
    [playTtsText, tutorContext]
  );

  useEffect(() => {
    return () => {
      if (narrationUrlRef.current) URL.revokeObjectURL(narrationUrlRef.current);
    };
  }, []);

  useEffect(() => {
    stopNarration();
  }, [currentStoryIndex, stopNarration]);

  useEffect(() => {
    onVoiceListeningChange?.(isVoiceListening);
  }, [isVoiceListening, onVoiceListeningChange]);

  useEffect(() => {
    return () => onVoiceListeningChange?.(false);
  }, [onVoiceListeningChange]);

  useEffect(() => {
    if (isVoiceListening || !voiceTranscript.trim()) return;
    const existing = quizAttempt?.openAnswer?.trim() ?? "";
    const next = existing ? `${existing} ${voiceTranscript.trim()}` : voiceTranscript.trim();
    onOpenAnswerChange(currentStoryIndex, next);
    clearVoiceTranscript();
  }, [
    isVoiceListening,
    voiceTranscript,
    quizAttempt?.openAnswer,
    currentStoryIndex,
    onOpenAnswerChange,
    clearVoiceTranscript,
  ]);

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
              return (
                <article
                  key={`${card.title}-${absoluteIdx}`}
                  data-topic-id={`story-${absoluteIdx}`}
                  className="rounded-lg border border-border bg-background p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      {cleanCardTitle(card.title || "", `Focus Area ${absoluteIdx + 1}`)}
                    </h3>
                    <div className="flex items-center">
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
                    </div>
                  </div>

                  {!showQuizPage && (
                    <>
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
                    </>
                  )}

                  {showQuizPage && (
                    <div className="mt-5 rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                      Topic Checkpoint
                    </p>

                    {quizLoading && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating quiz for this topic…
                      </div>
                    )}

                    {!quizLoading && topicQuiz && (
                      <div className="mt-3 space-y-4">
                        {topicQuiz.mcqs.slice(0, 2).map((question, questionIdx) => {
                          const selected = quizAttempt?.mcqSelections?.[questionIdx] ?? null;
                          const checked = quizAttempt?.mcqChecked?.[questionIdx] ?? false;
                          const correct = quizAttempt?.mcqCorrect?.[questionIdx] ?? false;
                          return (
                            <div
                              key={`checkpoint-${absoluteIdx}-${questionIdx}`}
                              className="rounded-md border border-border bg-background p-3"
                            >
                              <p className="text-xs font-medium text-foreground">
                                MCQ {questionIdx + 1}. {question.question}
                              </p>
                              <ul className="mt-2 space-y-1.5">
                                {question.options.map((option, optionIdx) => (
                                  <li key={`${absoluteIdx}-${questionIdx}-${optionIdx}`}>
                                    <button
                                      type="button"
                                      onClick={() => onMcqSelect(absoluteIdx, questionIdx, optionIdx)}
                                      className={cn(
                                        "w-full rounded-md border px-3 py-2 text-left text-xs transition-colors",
                                        selected === optionIdx
                                          ? "border-foreground bg-foreground/5 text-foreground"
                                          : "border-border text-muted-foreground hover:bg-muted"
                                      )}
                                    >
                                      <span className="mr-1.5 font-medium text-foreground">
                                        {optionIdx + 1}.
                                      </span>
                                      {option}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onMcqCheck(absoluteIdx, questionIdx);
                                    if (selected !== null && selected !== question.correctIndex) {
                                      void speakDriftHint({
                                        topicTitle:
                                          cleanCardTitle(
                                            card.title || "",
                                            `Focus Area ${absoluteIdx + 1}`
                                          ) || `Topic ${absoluteIdx + 1}`,
                                        question: question.question,
                                        selectedOption: question.options[selected] || "Unknown option",
                                        correctOption:
                                          question.options[question.correctIndex] || "Correct option",
                                        fallbackHint:
                                          question.explanation ||
                                          "Re-read the key distinction in the story and match each option to that rule.",
                                      });
                                    }
                                  }}
                                  disabled={selected === null}
                                  className={cn(
                                    "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                                    selected === null
                                      ? "cursor-not-allowed border-border text-muted-foreground/40"
                                      : "border-foreground bg-foreground text-background hover:bg-foreground/90"
                                  )}
                                >
                                  Check MCQ {questionIdx + 1}
                                </button>
                                {checked && (
                                  <span
                                    className={cn(
                                      "text-[11px]",
                                      correct ? "text-foreground" : "text-muted-foreground"
                                    )}
                                  >
                                    {correct ? "Correct" : "Retry this one"}
                                  </span>
                                )}
                              </div>
                              {checked && question.explanation && (
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                  {question.explanation}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        <div className="rounded-md border border-border bg-background p-3">
                          <p className="text-xs font-medium text-foreground">
                            Open Answer. {topicQuiz.openQuestion}
                          </p>
                          <div className="mt-2 flex items-start gap-2">
                            <textarea
                              value={quizAttempt?.openAnswer ?? ""}
                              onChange={(event) =>
                                onOpenAnswerChange(absoluteIdx, event.target.value)
                              }
                              placeholder="Type your answer or use voice dictation…"
                              className="min-h-[92px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
                            />
                            {voiceSupported && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isVoiceListening) stopVoiceListening();
                                  else startVoiceListening();
                                }}
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors",
                                  isVoiceListening
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                                title={isVoiceListening ? "Stop voice dictation" : "Start voice dictation"}
                              >
                                {isVoiceListening ? (
                                  <MicOff className="h-4 w-4" />
                                ) : (
                                  <Mic className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpenAnswerSubmit(absoluteIdx)}
                            disabled={!(quizAttempt?.openAnswer ?? "").trim()}
                            className={cn(
                              "mt-2 rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                              (quizAttempt?.openAnswer ?? "").trim()
                                ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                                : "cursor-not-allowed border-border text-muted-foreground/40"
                            )}
                          >
                            Check Open Answer
                          </button>
                          {quizAttempt?.openSubmitted && (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {quizAttempt.openFeedback}
                            </p>
                          )}
                        </div>
                        {!currentTopicPassed && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => onSkipQuiz(absoluteIdx)}
                              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              Skip this quiz for now
                            </button>
                          </div>
                        )}
                      </div>
                    )}
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
                  {showQuizPage ? "Back to Story" : "Back Topic"}
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
                  {showQuizPage ? "Next Topic" : "Go to Quiz"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {requireQuizToAdvance && showQuizPage && !canAdvanceFromQuizPage && (
              <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Complete 2 MCQs + open answer, or use Skip, to unlock the next topic.
              </p>
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
