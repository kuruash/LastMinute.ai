import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface GenerateBody {
  /** Full study context: mission title, concepts, storytelling, and all topic cards (title, topics, subtopics, story, friend_explainers) */
  context: string;
  difficulty: "easy" | "medium" | "hard";
  numQuestions: number;
}

/**
 * POST /api/quiz/generate
 *
 * Generates multiple-choice quiz questions from the full lesson/slides context using Gemini.
 * Returns an array of { question, options, correctIndex, explanation }.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateBody;
    const { context, difficulty, numQuestions } = body;

    if (!context?.trim()) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    const n = Math.min(20, Math.max(3, Number(numQuestions) || 5));
    const diff =
      difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
        ? difficulty
        : "medium";

    const apiKey =
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "Quiz generation unavailable — no API key configured." },
        { status: 501 }
      );
    }

    const model =
      process.env.LASTMINUTE_LLM_MODEL?.trim() || "gemini-2.0-flash";

    const difficultyGuide = {
      easy:
        "Easy: recall of definitions, key terms, and explicit facts from the material. Straightforward wording.",
      medium:
        "Medium: apply concepts, compare ideas, or infer from the material. One step of reasoning.",
      hard:
        "Hard: apply to new scenarios, combine multiple concepts, or subtle distinctions. Two steps of reasoning.",
    };

    const systemInstruction = `You are a strict quiz generator. You must output ONLY a single valid JSON array, no other text or markdown.

RULES:
- Generate exactly ${n} multiple-choice questions.
- Each question has exactly 4 options (A, B, C, D). One option is correct (correctIndex 0–3).
- Base every question ONLY on the provided study material. Do not introduce outside concepts.
- Difficulty: ${difficultyGuide[diff]}
- Options must be plausible; the wrong answers should be reasonable distractors from the same material.
- Each item in the array must have: "question" (string), "options" (array of exactly 4 strings), "correctIndex" (number 0–3), "explanation" (string, 1–2 sentences why the answer is correct).

Output format (no code block, no backticks, no extra text — only this array):
[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}, ...]`;

    const userContent = `Study material to use for the quiz:

${context.slice(0, 28000)}

Generate ${n} ${diff} multiple-choice questions. Output ONLY the JSON array.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemInstruction + "\n\n" + userContent }] },
        ],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Quiz generate Gemini error:", res.status, err.slice(0, 400));
      return NextResponse.json(
        { error: "Quiz generation failed. Try again." },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    let questions: QuizQuestion[];
    try {
      const fallback = rawText.replace(/```\w*\n?/g, "").trim();
      const start = fallback.indexOf("[");
      const end = fallback.lastIndexOf("]") + 1;
      const slice =
        start >= 0 && end > start ? fallback.slice(start, end) : fallback;
      questions = JSON.parse(slice) as QuizQuestion[];
    } catch {
      return NextResponse.json(
        { error: "Could not parse quiz from model response." },
        { status: 502 }
      );
    }

    if (!Array.isArray(questions)) {
      return NextResponse.json(
        { error: "Invalid quiz format from model." },
        { status: 502 }
      );
    }

    const validated: QuizQuestion[] = questions.slice(0, n).filter((q) => {
      return (
        typeof q?.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctIndex === "number" &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3
      );
    });

    return NextResponse.json({ questions: validated });
  } catch (err) {
    console.error("Quiz generate error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 }
    );
  }
}
