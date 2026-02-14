import { NextResponse } from "next/server";
import { getSession, setLessons } from "@/lib/session-store";
import type { TopicLesson, LessonSection } from "@/types";
import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

interface GenerateLessonsBody {
  sessionId: string;
}

const GEMINI_LESSON_CACHE_DIR = path.join(
  process.cwd(),
  ".cache",
  "gemini_lessons"
);
const GEMINI_LESSON_CACHE_TTL_SECONDS = Number.parseInt(
  process.env.LASTMINUTE_GEMINI_CACHE_TTL_SECONDS ?? "604800",
  10
);

function cacheTtlSeconds() {
  if (Number.isFinite(GEMINI_LESSON_CACHE_TTL_SECONDS)) {
    return Math.max(0, GEMINI_LESSON_CACHE_TTL_SECONDS);
  }
  return 604800;
}

function lessonCacheKey(input: {
  model: string;
  topicName: string;
  prompt: string;
}): string {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      provider: "gemini",
      scope: "generate-lessons",
      model: input.model,
      topicName: input.topicName,
      prompt: input.prompt,
    })
  );
  return hash.digest("hex");
}

async function readGeminiLessonCache(
  key: string
): Promise<{ rawText: string } | null> {
  const ttl = cacheTtlSeconds();
  const cachePath = path.join(GEMINI_LESSON_CACHE_DIR, `${key}.json`);

  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as {
      cachedAt?: number;
      rawText?: unknown;
    };

    const cachedAt = Number(parsed.cachedAt ?? 0);
    if (ttl > 0 && Date.now() - cachedAt * 1000 > ttl * 1000) {
      return null;
    }

    if (typeof parsed.rawText !== "string") {
      return null;
    }

    return { rawText: parsed.rawText };
  } catch {
    return null;
  }
}

async function writeGeminiLessonCache(key: string, rawText: string) {
  if (cacheTtlSeconds() === 0 || !rawText.trim()) return;

  const cachePath = path.join(GEMINI_LESSON_CACHE_DIR, `${key}.json`);
  const tmpPath = `${cachePath}.tmp-${randomUUID()}`;

  try {
    await fs.mkdir(GEMINI_LESSON_CACHE_DIR, { recursive: true });
    await fs.writeFile(
      tmpPath,
      JSON.stringify({
        cachedAt: Math.floor(Date.now() / 1000),
        rawText,
      }),
      "utf-8"
    );
    await fs.rename(tmpPath, cachePath);
  } catch {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}

/**
 * POST /api/generate-lessons
 *
 * For each concept in the session, calls Gemini to produce a structured lesson
 * with explanation, key terms, example, diagram placeholder, and practice questions.
 * Saves the result into the session store.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as GenerateLessonsBody;
  const { sessionId } = body;

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found or expired" },
      { status: 404 }
    );
  }

  // If lessons already exist, return them
  if (session.lessons.length > 0) {
    return NextResponse.json({ lessons: session.lessons });
  }

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured" },
      { status: 500 }
    );
  }

  const model =
    process.env.LASTMINUTE_LLM_MODEL?.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const concepts = session.concepts;
  if (!concepts.length) {
    return NextResponse.json(
      { error: "No concepts found in session" },
      { status: 400 }
    );
  }

  const sourceTextSnippet = (session.source_text || session.final_storytelling || "").slice(0, 10000);

  const lessons: TopicLesson[] = [];

  // Generate lessons for all concepts (sequentially to avoid rate limits)
  for (let i = 0; i < concepts.length; i++) {
    const topicName = concepts[i];
    const topicId = `topic-${i}`;

    const prompt = buildLessonPrompt(
      topicName,
      concepts,
      sourceTextSnippet,
      session.interactive_story?.title || "Study Session"
    );
    const cacheKey = lessonCacheKey({ model, topicName, prompt });

    try {
      const cached = await readGeminiLessonCache(cacheKey);
      if (cached) {
        const parsed = parseGeminiLessonResponse(cached.rawText, topicId, topicName);
        parsed.status = i === 0 ? "active" : "locked";
        lessons.push(parsed);
        continue;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: "You are an expert educator creating structured study lessons. Always return valid JSON. Never include markdown fences or extra text outside the JSON.",
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Gemini error for topic "${topicName}":`, errText);
        // Create a fallback lesson
        lessons.push(createFallbackLesson(topicId, topicName, i === 0));
        continue;
      }

      const data = await res.json();
      const rawText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      await writeGeminiLessonCache(cacheKey, rawText);

      const parsed = parseGeminiLessonResponse(rawText, topicId, topicName);
      parsed.status = i === 0 ? "active" : "locked";
      lessons.push(parsed);
    } catch (err) {
      console.error(`Failed to generate lesson for "${topicName}":`, err);
      lessons.push(createFallbackLesson(topicId, topicName, i === 0));
    }
  }

  // Persist to session
  setLessons(sessionId, lessons);

  return NextResponse.json({ lessons });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function buildLessonPrompt(
  topicName: string,
  allConcepts: string[],
  sourceText: string,
  courseTitle: string
): string {
  return `You are creating a structured study lesson for the topic "${topicName}" from a "${courseTitle}" course.

Source material:
${sourceText}

All topics in this course: ${allConcepts.join(", ")}

Generate a lesson with these EXACT sections in order:

1. "explanation" — 2-3 clear paragraphs explaining this topic thoroughly. Use concrete examples and analogies.
2. "keyTerms" — 3-6 key terms with short definitions, formatted as "Term: definition" lines separated by newlines.
3. "example" — A concrete real-world example or scenario applying this topic (1-2 paragraphs).
4. "diagram" — A short description (1-2 sentences) of a helpful diagram that would illustrate this topic. We will render it as a placeholder.
5. "practice" — Exactly 2 questions:
   - First question: A multiple-choice question (MCQ) with 4 options. Mark the correct option.
   - Second question: An open-ended question requiring a short paragraph answer.

Return a JSON object with this EXACT structure:
{
  "sections": [
    {
      "type": "explanation",
      "title": "Understanding [Topic]",
      "content": "paragraph text here..."
    },
    {
      "type": "keyTerms",
      "title": "Key Terms",
      "content": "Term1: definition\\nTerm2: definition\\n..."
    },
    {
      "type": "example",
      "title": "Real-World Example",
      "content": "example text here..."
    },
    {
      "type": "diagram",
      "title": "Visual Overview",
      "content": "description of what the diagram would show",
      "diagramAlt": "short alt text for the diagram"
    },
    {
      "type": "practice",
      "title": "Check Your Understanding",
      "content": "Which of the following best describes...?",
      "questionType": "mcq",
      "options": ["Option A", "Option B", "Option C (correct)", "Option D"],
      "hint": "Think about..."
    },
    {
      "type": "practice",
      "title": "Apply Your Knowledge",
      "content": "Explain how ... in your own words.",
      "questionType": "open",
      "hint": "Consider..."
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown fences. No extra text.`;
}

interface RawSection {
  type: string;
  title?: string;
  content?: string;
  questionType?: string;
  options?: string[];
  hint?: string;
  diagramAlt?: string;
}

function parseGeminiLessonResponse(
  rawText: string,
  topicId: string,
  topicName: string
): TopicLesson {
  try {
    // Try to extract JSON from the response
    let jsonStr = rawText.trim();
    // Remove markdown fences if present
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    const rawSections: RawSection[] = parsed.sections || [];

    const sections: LessonSection[] = rawSections.map(
      (s: RawSection, idx: number) => ({
        id: `${topicId}-s${idx}`,
        type: (s.type || "explanation") as LessonSection["type"],
        title: s.title || `Section ${idx + 1}`,
        content: s.content || "",
        questionType: s.questionType as "open" | "mcq" | undefined,
        options: s.options,
        hint: s.hint,
        diagramAlt: s.diagramAlt,
        answered: false,
      })
    );

    return {
      topicId,
      topicName,
      status: "locked",
      sections,
    };
  } catch (err) {
    console.error("Failed to parse lesson JSON:", err, rawText.slice(0, 500));
    return createFallbackLesson(topicId, topicName, false);
  }
}

function createFallbackLesson(
  topicId: string,
  topicName: string,
  isFirst: boolean
): TopicLesson {
  return {
    topicId,
    topicName,
    status: isFirst ? "active" : "locked",
    sections: [
      {
        id: `${topicId}-s0`,
        type: "explanation",
        title: `Understanding ${topicName}`,
        content: `This topic covers ${topicName}. The lesson content could not be generated at this time. Please use the tutor chat on the right panel to ask questions about this topic.`,
        answered: false,
      },
      {
        id: `${topicId}-s1`,
        type: "practice",
        title: "Quick Check",
        content: `In your own words, explain what ${topicName} means and why it matters.`,
        questionType: "open",
        hint: `Think about the core definition and practical applications of ${topicName}.`,
        answered: false,
      },
    ],
  };
}
