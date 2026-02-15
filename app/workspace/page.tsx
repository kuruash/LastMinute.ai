"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopicNav } from "@/components/workspace/topic-nav";
import { LessonView } from "@/components/workspace/lesson-view";
import { SupportPanel } from "@/components/workspace/support-panel";
import { TopicDrawingOverlay } from "@/components/workspace/topic-drawing-overlay";
import { VercelV0Chat } from "@/components/ui/v0-ai-chat";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type {
  ChecklistItem,
  HintLevel,
  MisconceptionLogEntry,
  QuizQuestion,
  TopicCheckpointQuiz,
  TopicStorylineCard,
} from "@/types";
import type { StoryBeat } from "@/app/api/upload/route";
import {
  AnnotationStoreContext,
  useCreateAnnotationStore,
} from "@/hooks/use-annotation-store";
import { useWakeWord } from "@/hooks/use-wake-word";

type LoadState = "loading" | "generating" | "ready" | "error";
const RECENT_SESSIONS_KEY = "lastminute_recent_sessions";

interface RecentSessionItem {
  id: string;
  title: string;
  updatedAt: number;
}

interface TopicQuizAttempt {
  mcqSelections: (number | null)[];
  mcqChecked: boolean[];
  mcqCorrect: boolean[];
  openAnswer: string;
  openSubmitted: boolean;
  openPassed: boolean;
  openFeedback: string;
}

function defaultTopicQuizAttempt(questionCount: number): TopicQuizAttempt {
  return {
    mcqSelections: Array.from({ length: questionCount }, () => null),
    mcqChecked: Array.from({ length: questionCount }, () => false),
    mcqCorrect: Array.from({ length: questionCount }, () => false),
    openAnswer: "",
    openSubmitted: false,
    openPassed: false,
    openFeedback: "",
  };
}

function buildFallbackTopicQuiz(card: TopicStorylineCard): TopicCheckpointQuiz {
  const lead = card.topics[0] || card.subtopics[0] || card.title || "this topic";
  const second = card.topics[1] || card.subtopics[1] || lead;
  const mcqs: QuizQuestion[] = [
    {
      question: `Which idea is most central in this topic: ${lead}?`,
      options: [
        `${lead} is the core concept that should anchor your explanation.`,
        `${second} fully replaces ${lead} in every case.`,
        "You should ignore both and memorize random examples.",
        "The best approach is to skip concept links entirely.",
      ],
      correctIndex: 0,
      explanation: `Start from ${lead}, then connect to supporting concepts like ${second}.`,
    },
    {
      question: `What is the best exam strategy when a question mixes ${lead} and ${second}?`,
      options: [
        `Start with ${lead}, then map it to ${second} step by step.`,
        "Write the final answer first and skip reasoning.",
        "Only define one term and stop there.",
        "Use unrelated formulas to save time.",
      ],
      correctIndex: 0,
      explanation: `Explain the logic chain from ${lead} to ${second} clearly for full marks.`,
    },
  ];

  return {
    mcqs,
    openQuestion: `In 2-4 lines, explain how you would solve a question using ${lead}${second !== lead ? ` and ${second}` : ""}.`,
    openModelAnswer: `Start from ${lead}, connect it to ${second}, and state the reasoning that leads to the result.`,
    focusConcept: lead,
  };
}

function checklistLabelFromCard(card: TopicStorylineCard, index: number): string {
  const preferred = card.subtopics[0] || card.topics[0] || card.title || `Subtopic ${index + 1}`;
  const cleaned = preferred
    .replace(/^explanation\s*[-—:]\s*/i, "")
    .replace(/^story\s*card\s*\d+\s*[-—:]\s*/i, "")
    .trim();
  return cleaned || `Subtopic ${index + 1}`;
}

export default function WorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  /* ---- data ---- */
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [hints, setHints] = useState<HintLevel[]>([]);
  const [misconceptions] = useState<MisconceptionLogEntry[]>([]);
  const [tutorContext, setTutorContext] = useState("");
  const [storytelling, setStorytelling] = useState("");
  const [storyTitle, setStoryTitle] = useState("Mission Story");
  const [topicStorylines, setTopicStorylines] = useState<TopicStorylineCard[]>(
    []
  );
  const [storyBeats, setStoryBeats] = useState<StoryBeat[]>([]);
  const [topicQuizzes, setTopicQuizzes] = useState<Record<number, TopicCheckpointQuiz>>(
    {}
  );
  const [quizAttempts, setQuizAttempts] = useState<Record<number, TopicQuizAttempt>>(
    {}
  );
  const [quizLoadingTopics, setQuizLoadingTopics] = useState<Record<number, boolean>>(
    {}
  );
  const [quizPageTopicIndex, setQuizPageTopicIndex] = useState<number | null>(null);
  const [skippedQuizTopics, setSkippedQuizTopics] = useState<Record<number, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentChats, setRecentChats] = useState<RecentSessionItem[]>([]);

  /* ---- Voxi: annotation store + wake word ---- */
  const annotationStore = useCreateAnnotationStore();
  const [voxiOpenTrigger, setVoxiOpenTrigger] = useState(0);
  const [voxiIsOpen, setVoxiIsOpen] = useState(false);
  const [lessonVoiceListening, setLessonVoiceListening] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const lessonColumnRef = useRef<HTMLDivElement>(null);

  /* ---- resizable right panel (Voxi + checklist) ---- */
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const MIN_RIGHT = 260;
  const MAX_RIGHT = 560;
  const handleResize = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = rightPanelWidth;
    const onMove = (e2: MouseEvent) => {
      const delta = startX - e2.clientX;
      setRightPanelWidth((w) => Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [rightPanelWidth]);

  const handleWakeWord = useCallback(() => {
    setVoxiOpenTrigger((prev) => prev + 1);
  }, []);

  useWakeWord({
    onWake: handleWakeWord,
    disabled: voxiIsOpen || lessonVoiceListening,
  });

  const readRecentSessions = useCallback((): RecentSessionItem[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(RECENT_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => ({
          id: String(item.id ?? "").trim(),
          title: String(item.title ?? "").trim(),
          updatedAt: Number(item.updatedAt ?? 0),
        }))
        .filter((item) => !!item.id && !!item.title && Number.isFinite(item.updatedAt))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }, []);

  const upsertRecentSession = useCallback(
    (entry: RecentSessionItem) => {
      if (typeof window === "undefined") return;
      const previous = readRecentSessions().filter((item) => item.id !== entry.id);
      const next = [entry, ...previous].slice(0, 100);
      window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next));
      setRecentChats(next);
    },
    [readRecentSessions]
  );

  const removeRecentSession = useCallback(
    (id: string) => {
      if (typeof window === "undefined") return;
      const next = readRecentSessions().filter((item) => item.id !== id);
      window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next));
      setRecentChats(next);
    },
    [readRecentSessions]
  );

  const clearRecentSessions = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify([]));
    setRecentChats([]);
  }, []);

  useEffect(() => {
    setRecentChats(readRecentSessions());
  }, [readRecentSessions, sessionId]);

  /* ---- load session & generate lessons ---- */
  useEffect(() => {
    if (!sessionId) {
      setErrorMsg("");
      setChecklist([]);
      setHints([]);
      setTutorContext("");
      setStorytelling("");
      setStoryTitle("Mission Story");
      setTopicStorylines([]);
      setTopicQuizzes({});
      setQuizAttempts({});
      setQuizLoadingTopics({});
      setQuizPageTopicIndex(null);
      setSkippedQuizTopics({});
      setActiveTopicId(null);
      setLoadState("ready");
      return;
    }

    let cancelled = false;
    const currentSessionId = sessionId;

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

        const storytellingText =
          typeof session.final_storytelling === "string"
            ? session.final_storytelling
            : "";
        setStorytelling(storytellingText);
        setStoryTitle(
          typeof session.interactive_story?.title === "string" &&
            session.interactive_story.title.trim()
            ? session.interactive_story.title.trim()
            : "Mission Story"
        );
        const cards: TopicStorylineCard[] = Array.isArray(session.interactive_story?.topic_storylines)
          ? session.interactive_story.topic_storylines
              .filter(
                (item: unknown) => !!item && typeof item === "object"
              )
              .map((item: Record<string, unknown>, idx: number) => ({
                title: String(item.title ?? `Story Card ${idx + 1}`),
                topics: Array.isArray(item.topics)
                  ? item.topics.map((t) => String(t).trim()).filter(Boolean)
                  : [],
                importance: String(item.importance ?? "medium").toLowerCase(),
                subtopics: Array.isArray(item.subtopics)
                  ? item.subtopics.map((s) => String(s).trim()).filter(Boolean)
                  : [],
                story: String(item.story ?? "").trim(),
                friend_explainers: Array.isArray(item.friend_explainers)
                  ? item.friend_explainers
                      .map((s) => String(s).trim())
                      .filter(Boolean)
                  : [],
              }))
              .filter((item: TopicStorylineCard) => item.story.length > 0)
          : [];

        const sessionChecklist = Array.isArray(session.checklist)
          ? session.checklist
              .map((item: unknown) => String(item).trim())
              .filter((item: string) => item.length > 0)
          : [];
        const fallbackChecklist = Array.isArray(session.concepts)
          ? session.concepts
              .map((item: unknown) => String(item).trim())
              .filter((item: string) => item.length > 0)
          : [];
        const checklistItems =
          cards.length > 0
            ? cards.map((card, idx) => ({
                id: `subtopic-${idx}`,
                label: checklistLabelFromCard(card, idx),
                done: false,
              }))
            : (sessionChecklist.length > 0 ? sessionChecklist : fallbackChecklist)
                .slice(0, 6)
                .map((label: string, idx: number) => ({
                  id: `subtopic-${idx}`,
                  label,
                  done: false,
                }));
        setChecklist(checklistItems);

        setTopicStorylines(cards);
        setTopicQuizzes({});
        setQuizAttempts({});
        setQuizLoadingTopics({});
        setQuizPageTopicIndex(null);
        setSkippedQuizTopics({});
        setStoryBeats(Array.isArray(session.story_beats) ? session.story_beats : []);
        setActiveTopicId(cards[0] ? `story-${0}` : null);
        upsertRecentSession({
          id: currentSessionId,
          title:
            (typeof session.interactive_story?.title === "string" &&
              session.interactive_story.title.trim()) ||
            (typeof session.filename === "string" && session.filename.trim()) ||
            "Untitled chat",
          updatedAt: Date.now(),
        });

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
        if (storytellingText) {
          const paragraphs = storytellingText
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

        // Story cards are the primary content; no lesson generation API call.
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
  }, [sessionId, upsertRecentSession]);

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

  const handleChatSelect = useCallback(
    (targetSessionId: string) => {
      if (!targetSessionId || targetSessionId === sessionId) return;
      setLoadState("loading");
      router.push(`/workspace?session=${encodeURIComponent(targetSessionId)}`);
    },
    [router, sessionId]
  );

  const handleDeleteChat = useCallback(
    (targetSessionId: string) => {
      if (!targetSessionId) return;
      removeRecentSession(targetSessionId);
      if (targetSessionId === sessionId) {
        setErrorMsg("");
        setChecklist([]);
        setHints([]);
        setTutorContext("");
        setStorytelling("");
        setStoryTitle("Mission Story");
        setTopicStorylines([]);
        setTopicQuizzes({});
        setQuizAttempts({});
        setQuizLoadingTopics({});
        setQuizPageTopicIndex(null);
        setSkippedQuizTopics({});
        setActiveTopicId(null);
        setLoadState("ready");
        router.push("/workspace");
      }
    },
    [removeRecentSession, sessionId, router]
  );

  const handleClearHistory = useCallback(() => {
    clearRecentSessions();
    setErrorMsg("");
    setChecklist([]);
    setHints([]);
    setTutorContext("");
    setStorytelling("");
    setStoryTitle("Mission Story");
    setTopicStorylines([]);
    setTopicQuizzes({});
    setQuizAttempts({});
    setQuizLoadingTopics({});
    setQuizPageTopicIndex(null);
    setSkippedQuizTopics({});
    setActiveTopicId(null);
    setLoadState("ready");
    router.push("/workspace");
  }, [clearRecentSessions, router]);

  const handleNewChat = useCallback(() => {
    setErrorMsg("");
    setChecklist([]);
    setHints([]);
    setTutorContext("");
    setStorytelling("");
    setStoryTitle("Mission Story");
    setTopicStorylines([]);
    setTopicQuizzes({});
    setQuizAttempts({});
    setQuizLoadingTopics({});
    setQuizPageTopicIndex(null);
    setSkippedQuizTopics({});
    setActiveTopicId(null);
    setLoadState("ready");
    router.push("/workspace");
  }, [router]);

  const parsedStoryIndex =
    activeTopicId && activeTopicId.startsWith("story-")
      ? Number.parseInt(activeTopicId.replace("story-", ""), 10)
      : NaN;
  const currentStoryIndex =
    Number.isFinite(parsedStoryIndex) &&
    parsedStoryIndex >= 0 &&
    parsedStoryIndex < topicStorylines.length
      ? parsedStoryIndex
      : 0;
  const currentTopicQuiz = topicQuizzes[currentStoryIndex];
  const currentQuizAttempt = quizAttempts[currentStoryIndex];
  const mcqCount = currentTopicQuiz?.mcqs?.length ?? 0;
  const mcqsPassed =
    mcqCount > 0 &&
    currentQuizAttempt?.mcqCorrect?.slice(0, mcqCount).every(Boolean) === true;
  const currentTopicPassed =
    mcqsPassed && Boolean(currentQuizAttempt?.openSubmitted && currentQuizAttempt?.openPassed);
  const showQuizPage = quizPageTopicIndex === currentStoryIndex;
  const currentTopicSkipped = Boolean(skippedQuizTopics[currentStoryIndex]);
  const canAdvanceFromQuizPage = currentTopicPassed || currentTopicSkipped;
  const canGoPrevStory = showQuizPage ? true : currentStoryIndex > 0;
  const canGoNextStory = showQuizPage
    ? currentStoryIndex < topicStorylines.length - 1 && canAdvanceFromQuizPage
    : topicStorylines.length > 0;

  const ensureTopicQuiz = useCallback(
    async (topicIdx: number) => {
      if (
        topicIdx < 0 ||
        topicIdx >= topicStorylines.length ||
        topicQuizzes[topicIdx] ||
        quizLoadingTopics[topicIdx]
      ) {
        return;
      }

      const card = topicStorylines[topicIdx];
      if (!card) return;

      setQuizLoadingTopics((prev) => ({ ...prev, [topicIdx]: true }));
      try {
        const topicContext = [
          tutorContext,
          `Topic: ${card.title}`,
          `Concepts: ${(card.topics || []).join(", ")}`,
          `Subtopics: ${(card.subtopics || []).join(", ")}`,
          card.story || "",
          Array.isArray(card.friend_explainers) ? card.friend_explainers.join("\n") : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const response = await fetch("/api/quiz/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: topicContext,
            difficulty: "medium",
            numQuestions: 2,
          }),
        });

        let quiz: TopicCheckpointQuiz | null = null;
        if (response.ok) {
          const data = await response.json();
          const generated = Array.isArray(data?.questions)
            ? (data.questions as QuizQuestion[]).slice(0, 2)
            : [];
          if (generated.length === 2) {
            const lead = card.topics[0] || card.subtopics[0] || card.title || "this topic";
            quiz = {
              mcqs: generated,
              openQuestion: `In 2-4 lines, explain how you would apply ${lead} in an exam answer.`,
              openModelAnswer: `Define ${lead}, connect it to the problem setup, and explain the reasoning chain to your conclusion.`,
              focusConcept: lead,
            };
          }
        }

        if (!quiz) {
          quiz = buildFallbackTopicQuiz(card);
        }

        setTopicQuizzes((prev) => ({ ...prev, [topicIdx]: quiz! }));
        setQuizAttempts((prev) =>
          prev[topicIdx]
            ? prev
            : {
                ...prev,
                [topicIdx]: defaultTopicQuizAttempt(quiz!.mcqs.length),
              }
        );
      } catch {
        const fallback = buildFallbackTopicQuiz(card);
        setTopicQuizzes((prev) => ({ ...prev, [topicIdx]: fallback }));
        setQuizAttempts((prev) =>
          prev[topicIdx]
            ? prev
            : {
                ...prev,
                [topicIdx]: defaultTopicQuizAttempt(fallback.mcqs.length),
              }
        );
      } finally {
        setQuizLoadingTopics((prev) => ({ ...prev, [topicIdx]: false }));
      }
    },
    [topicQuizzes, quizLoadingTopics, topicStorylines, tutorContext]
  );

  useEffect(() => {
    if (topicStorylines.length === 0) return;
    void ensureTopicQuiz(currentStoryIndex);
  }, [currentStoryIndex, topicStorylines.length, ensureTopicQuiz]);

  useEffect(() => {
    if (!currentTopicPassed) return;
    setSkippedQuizTopics((prev) => {
      if (!prev[currentStoryIndex]) return prev;
      const next = { ...prev };
      delete next[currentStoryIndex];
      return next;
    });
    setChecklist((items) =>
      items.map((item, idx) =>
        idx === currentStoryIndex ? { ...item, done: true } : item
      )
    );
  }, [currentTopicPassed, currentStoryIndex]);

  /** Current slide image for Voxi "Draw on slide" (first image of current topic) */
  const currentSlideImage = useMemo(() => {
    const card = topicStorylines[currentStoryIndex];
    if (!card || !storyBeats?.length) return null;
    const topicLabels = [
      ...(card.topics ?? []).map((t) => t.toLowerCase().trim()),
      ...(card.subtopics ?? []).map((s) => s.toLowerCase().trim()),
      (card.title ?? "").toLowerCase().trim(),
    ].filter(Boolean);
    const beat = storyBeats.find((b) => {
      const label = (b.label ?? "").toLowerCase().trim();
      return label && topicLabels.some((tl) => tl.includes(label) || label.includes(tl));
    });
    const step = beat?.image_steps?.find((s) => s.image_data);
    if (!step?.image_data) return null;
    return {
      src: step.image_data,
      alt: step.step_label || beat?.label || "Current slide",
    };
  }, [topicStorylines, currentStoryIndex, storyBeats]);

  const handleMcqSelect = useCallback(
    (topicIdx: number, questionIdx: number, optionIdx: number) => {
      const topicQuiz = topicQuizzes[topicIdx];
      const questionCount = topicQuiz?.mcqs.length ?? 2;
      setQuizAttempts((prev) => {
        const base = prev[topicIdx] ?? defaultTopicQuizAttempt(questionCount);
        const nextSelections = [...base.mcqSelections];
        nextSelections[questionIdx] = optionIdx;
        const nextChecked = [...base.mcqChecked];
        nextChecked[questionIdx] = false;
        return {
          ...prev,
          [topicIdx]: {
            ...base,
            mcqSelections: nextSelections,
            mcqChecked: nextChecked,
          },
        };
      });
    },
    [topicQuizzes]
  );

  const handleMcqCheck = useCallback(
    (topicIdx: number, questionIdx: number) => {
      const quiz = topicQuizzes[topicIdx];
      if (!quiz || !quiz.mcqs[questionIdx]) return;
      setQuizAttempts((prev) => {
        const base = prev[topicIdx] ?? defaultTopicQuizAttempt(quiz.mcqs.length);
        const selected = base.mcqSelections[questionIdx];
        const isCorrect = selected === quiz.mcqs[questionIdx].correctIndex;
        const checked = [...base.mcqChecked];
        checked[questionIdx] = selected !== null;
        const correct = [...base.mcqCorrect];
        correct[questionIdx] = Boolean(isCorrect);
        return {
          ...prev,
          [topicIdx]: {
            ...base,
            mcqChecked: checked,
            mcqCorrect: correct,
          },
        };
      });
    },
    [topicQuizzes]
  );

  const handleOpenAnswerChange = useCallback(
    (topicIdx: number, value: string) => {
      const quiz = topicQuizzes[topicIdx];
      const questionCount = quiz?.mcqs.length ?? 2;
      setQuizAttempts((prev) => {
        const base = prev[topicIdx] ?? defaultTopicQuizAttempt(questionCount);
        return {
          ...prev,
          [topicIdx]: {
            ...base,
            openAnswer: value,
            openSubmitted: false,
            openPassed: false,
            openFeedback: "",
          },
        };
      });
    },
    [topicQuizzes]
  );

  const handleOpenAnswerSubmit = useCallback(
    (topicIdx: number) => {
      const quiz = topicQuizzes[topicIdx];
      const card = topicStorylines[topicIdx];
      if (!quiz || !card) return;

      setQuizAttempts((prev) => {
        const base = prev[topicIdx] ?? defaultTopicQuizAttempt(quiz.mcqs.length);
        const raw = base.openAnswer.trim();
        if (!raw) return prev;

        const normalized = raw.toLowerCase();
        const words = normalized.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
        const focus = (quiz.focusConcept || card.topics[0] || card.subtopics[0] || "").toLowerCase();
        const model = (quiz.openModelAnswer || "").toLowerCase();

        const keywordPool = [focus, model, ...card.topics, ...card.subtopics]
          .join(" ")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((token) => token.length >= 4);
        const keywordSet = new Set(keywordPool);
        const keywordHits = words.filter((token) => keywordSet.has(token)).length;
        const hasReasoning = /because|therefore|first|next|finally|so that|which means/.test(
          normalized
        );
        const longEnough = raw.length >= 40 || words.length >= 7;
        const focusHit = focus.length > 0 && normalized.includes(focus);
        const concisePass =
          words.length > 0 &&
          words.length <= 4 &&
          words.some((token) => model.includes(token) || focus.includes(token));
        const pass =
          concisePass ||
          (longEnough && (hasReasoning || keywordHits >= 2 || focusHit));

        const feedback = pass
          ? concisePass
            ? "Good keyword-level answer. Add one reasoning sentence for full depth."
            : "Great. Your explanation shows the concept and reasoning."
          : quiz.openModelAnswer
            ? `Remember: ${quiz.openModelAnswer}`
            : "Remember: define the core concept, then explain the reasoning chain.";

        return {
          ...prev,
          [topicIdx]: {
            ...base,
            openSubmitted: true,
            openPassed: pass,
            openFeedback: feedback,
          },
        };
      });
    },
    [topicQuizzes, topicStorylines]
  );

  const handlePrevStory = useCallback(() => {
    if (showQuizPage) {
      setQuizPageTopicIndex(null);
      return;
    }
    setActiveTopicId((prev) => {
      const idx =
        prev && prev.startsWith("story-")
          ? Number.parseInt(prev.replace("story-", ""), 10)
          : 0;
      const safeIdx = Number.isFinite(idx) ? idx : 0;
      return `story-${Math.max(0, safeIdx - 1)}`;
    });
  }, [showQuizPage]);

  const handleNextStory = useCallback(() => {
    if (!showQuizPage) {
      setQuizPageTopicIndex(currentStoryIndex);
      return;
    }
    if (!canAdvanceFromQuizPage) return;
    setActiveTopicId((prev) => {
      const idx =
        prev && prev.startsWith("story-")
          ? Number.parseInt(prev.replace("story-", ""), 10)
          : 0;
      const safeIdx = Number.isFinite(idx) ? idx : 0;
      const next = Math.min(topicStorylines.length - 1, safeIdx + 1);
      return `story-${Math.max(0, next)}`;
    });
    setQuizPageTopicIndex(null);
  }, [showQuizPage, currentStoryIndex, canAdvanceFromQuizPage, topicStorylines.length]);

  const handleSkipQuiz = useCallback((topicIdx: number) => {
    setSkippedQuizTopics((prev) => ({ ...prev, [topicIdx]: true }));
  }, []);

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
  const completedCount = topicStorylines.reduce((acc, _, idx) => {
    const quiz = topicQuizzes[idx];
    const attempt = quizAttempts[idx];
    if (!quiz || !attempt) return acc;
    const mcqPassed = attempt.mcqCorrect.slice(0, quiz.mcqs.length).every(Boolean);
    const openPassed = Boolean(attempt.openSubmitted && attempt.openPassed);
    return acc + (mcqPassed && openPassed ? 1 : 0);
  }, 0);

  return (
    <AnnotationStoreContext.Provider value={annotationStore}>
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

        <div className="flex flex-1 overflow-hidden">
          <div
            className={cn(
              "flex shrink-0 flex-col",
              sidebarCollapsed ? "w-16" : "w-[200px]"
            )}
          >
            <TopicNav
              chats={recentChats}
              selectedId={sessionId}
              onSelectChat={handleChatSelect}
              onDeleteChat={handleDeleteChat}
              onClearHistory={handleClearHistory}
              onNewChat={handleNewChat}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            />
          </div>
          <div
            ref={lessonColumnRef}
            className="relative flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {sessionId ? (
              <>
                <LessonView
                  activeTopicId={activeTopicId}
                  missionTitle={storyTitle}
                  missionStory={storytelling}
                  tutorContext={tutorContext}
                  topicStorylines={topicStorylines}
                  storyBeats={storyBeats}
                  currentStoryIndex={currentStoryIndex}
                  totalStories={topicStorylines.length}
                  canGoPrevStory={canGoPrevStory}
                  canGoNextStory={canGoNextStory}
                  showQuizPage={showQuizPage}
                  canAdvanceFromQuizPage={canAdvanceFromQuizPage}
                  currentTopicPassed={currentTopicPassed}
                  requireQuizToAdvance={Boolean(currentTopicQuiz)}
                  topicQuiz={currentTopicQuiz ?? null}
                  quizAttempt={currentQuizAttempt ?? null}
                  quizLoading={Boolean(quizLoadingTopics[currentStoryIndex])}
                  onPrevStory={handlePrevStory}
                  onNextStory={handleNextStory}
                  onMcqSelect={handleMcqSelect}
                  onMcqCheck={handleMcqCheck}
                  onOpenAnswerChange={handleOpenAnswerChange}
                  onOpenAnswerSubmit={handleOpenAnswerSubmit}
                  onSkipQuiz={handleSkipQuiz}
                  onVoiceListeningChange={setLessonVoiceListening}
                  loading={false}
                />
                {drawMode && (
                  <TopicDrawingOverlay
                    captureContainerRef={lessonColumnRef}
                    currentSlideImage={currentSlideImage}
                    onExit={() => setDrawMode(false)}
                  />
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-8">
                <VercelV0Chat />
              </div>
            )}
          </div>
          <div
            role="separator"
            aria-label="Resize support panel"
            onMouseDown={handleResize}
            className="w-1.5 shrink-0 cursor-col-resize border-l border-border bg-border/50 transition-colors hover:bg-primary/20"
          />
          <SupportPanel
            checklist={checklist}
            onChecklistToggle={handleChecklistToggle}
            hints={hints}
            onRevealHint={handleRevealHint}
            misconceptions={misconceptions}
            tutorContext={tutorContext}
            completedSteps={completedCount}
            totalSteps={topicStorylines.length}
            voxiOpenTrigger={voxiOpenTrigger}
            onVoxiOpenChange={setVoxiIsOpen}
            currentSlideImage={currentSlideImage}
            drawMode={drawMode}
            onDrawModeChange={setDrawMode}
            className="shrink-0"
            style={{ width: rightPanelWidth, minWidth: rightPanelWidth }}
          />
        </div>
      </main>
    </AnnotationStoreContext.Provider>
  );
}
