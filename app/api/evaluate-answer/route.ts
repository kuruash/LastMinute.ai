import { NextResponse } from "next/server";
import { getSession, updateSection } from "@/lib/session-store";

export const runtime = "nodejs";

interface EvaluateBody {
  sessionId: string;
  topicId: string;
  sectionId: string;
  answer: string;
}

/**
 * POST /api/evaluate-answer
 *
 * Evaluates a user's answer to a practice question using Gemini.
 * Returns inline feedback and stores it on the session.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as EvaluateBody;
  const { sessionId, topicId, sectionId, answer } = body;

  if (!sessionId || !topicId || !sectionId || !answer?.trim()) {
    return NextResponse.json(
      { error: "sessionId, topicId, sectionId, and answer are required" },
      { status: 400 }
    );
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  const topic = session.lessons.find((l) => l.topicId === topicId);
  if (!topic) {
    return NextResponse.json(
      { error: "Topic not found" },
      { status: 404 }
    );
  }

  const section = topic.sections.find((s) => s.id === sectionId);
  if (!section) {
    return NextResponse.json(
      { error: "Section not found" },
      { status: 404 }
    );
  }

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    // No API key — give simple feedback
    const fallback = buildFallbackFeedback(section, answer);
    updateSection(sessionId, topicId, sectionId, {
      userAnswer: answer,
      aiFeedback: fallback.feedback,
      answered: true,
    });
    return NextResponse.json(fallback);
  }

  const model =
    process.env.LASTMINUTE_LLM_MODEL?.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build context from the entire topic's content sections
  const topicContext = topic.sections
    .filter((s) => s.type !== "practice")
    .map((s) => `${s.title}:\n${s.content}`)
    .join("\n\n");

  const prompt = buildEvalPrompt(section, answer, topicContext, topic.topicName);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: "You are an expert study evaluator. Evaluate the student's answer fairly and helpfully. Always return valid JSON.",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini evaluate error:", errText);
      const fallback = buildFallbackFeedback(section, answer);
      updateSection(sessionId, topicId, sectionId, {
        userAnswer: answer,
        aiFeedback: fallback.feedback,
        answered: true,
      });
      return NextResponse.json(fallback);
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const result = parseEvalResponse(rawText, section, answer);

    // Store in session
    updateSection(sessionId, topicId, sectionId, {
      userAnswer: answer,
      aiFeedback: result.feedback,
      answered: true,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Evaluate API error:", err);
    const fallback = buildFallbackFeedback(section, answer);
    updateSection(sessionId, topicId, sectionId, {
      userAnswer: answer,
      aiFeedback: fallback.feedback,
      answered: true,
    });
    return NextResponse.json(fallback);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function buildEvalPrompt(
  section: { content: string; questionType?: string; options?: string[]; hint?: string },
  answer: string,
  topicContext: string,
  topicName: string
): string {
  const questionInfo =
    section.questionType === "mcq"
      ? `This is a multiple-choice question with options: ${(section.options || []).join(", ")}`
      : "This is an open-ended question.";

  return `Topic: ${topicName}

Context (what the student learned):
${topicContext}

Question: ${section.content}
${questionInfo}

Student's answer: ${answer}

Evaluate the answer. Return JSON:
{
  "correct": true/false,
  "feedback": "2-3 sentences. If correct, affirm and add a small insight. If wrong, explain the right answer clearly without being harsh."
}

For MCQ: check if the selected option matches the correct one (options containing '(correct)' in the lesson data).
For open-ended: evaluate based on accuracy and understanding. Be fair — partial credit is fine.

Return ONLY the JSON.`;
}

interface EvalResult {
  correct: boolean;
  feedback: string;
}

function parseEvalResponse(
  rawText: string,
  section: { content: string; questionType?: string; options?: string[] },
  answer: string
): EvalResult {
  try {
    let jsonStr = rawText.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(jsonStr);
    return {
      correct: Boolean(parsed.correct),
      feedback: parsed.feedback || "Answer recorded.",
    };
  } catch {
    console.error("Failed to parse eval JSON:", rawText.slice(0, 300));
    return buildFallbackFeedback(section, answer);
  }
}

function buildFallbackFeedback(
  section: { questionType?: string; options?: string[] },
  answer: string
): EvalResult {
  if (section.questionType === "mcq") {
    const correctOption = (section.options || []).find((o) =>
      o.toLowerCase().includes("(correct)")
    );
    if (correctOption) {
      const isCorrect = answer
        .toLowerCase()
        .includes(correctOption.replace(/\s*\(correct\)\s*/i, "").toLowerCase());
      return {
        correct: isCorrect,
        feedback: isCorrect
          ? "That's correct! Well done."
          : `The correct answer is: ${correctOption.replace(/\s*\(correct\)\s*/i, "")}. Review the explanation above to understand why.`,
      };
    }
  }
  return {
    correct: false,
    feedback: "Your answer has been recorded. Review the explanation section to verify your understanding.",
  };
}
