import { NextResponse } from "next/server";
import { getSession, addInteraction } from "@/lib/session-store";

export const runtime = "nodejs";

interface InteractBody {
  sessionId: string;
  userInput: string;
  /** Which phase the user is responding to */
  phase: "briefing" | "checkpoint" | "boss" | "freeform";
}

/**
 * POST /api/interact
 *
 * The user responded to a mission prompt (made a choice, typed an answer).
 * We call Gemini with the full context to:
 *   1. Evaluate their response
 *   2. Give feedback
 *   3. Generate the next prompt/narrative
 *
 * Returns: { feedback, nextPrompt, phase, done }
 */
export async function POST(request: Request) {
  const body = (await request.json()) as InteractBody;
  const { sessionId, userInput, phase } = body;

  if (!sessionId || !userInput?.trim()) {
    return NextResponse.json(
      { error: "sessionId and userInput are required" },
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

  // Record the user's input
  addInteraction(sessionId, {
    role: "user",
    content: userInput,
    phase,
  });

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    // No API key — return a simple acknowledgment
    const fallbackFeedback = getFallbackFeedback(phase, userInput);
    const entry = addInteraction(sessionId, {
      role: "assistant",
      content: fallbackFeedback.feedback,
      phase: fallbackFeedback.nextPhase,
    });
    return NextResponse.json({
      feedback: fallbackFeedback.feedback,
      nextPrompt: fallbackFeedback.nextPrompt,
      phase: fallbackFeedback.nextPhase,
      done: fallbackFeedback.done,
      interactionId: entry?.id,
    });
  }

  const model = process.env.LASTMINUTE_LLM_MODEL?.trim() || "gemini-2.0-flash";

  // Build the conversation for Gemini
  const systemPrompt = buildSystemPrompt(session, phase);
  const conversationHistory = session.interactions.map((entry) => ({
    role: entry.role === "assistant" ? "model" : "user",
    parts: [{ text: entry.content }],
  }));

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: conversationHistory,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      console.error("Gemini interact error:", await res.text());
      const fallback = getFallbackFeedback(phase, userInput);
      addInteraction(sessionId, {
        role: "assistant",
        content: fallback.feedback,
        phase: fallback.nextPhase,
      });
      return NextResponse.json({
        feedback: fallback.feedback,
        nextPrompt: fallback.nextPrompt,
        phase: fallback.nextPhase,
        done: fallback.done,
      });
    }

    const data = await res.json();
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // If Gemini didn't return valid JSON, use the raw text as feedback
      parsed = { feedback: rawText, nextPrompt: "", done: false };
    }

    const feedback = String(parsed.feedback ?? "Good work. Keep going.");
    const nextPrompt = String(parsed.nextPrompt ?? parsed.next_prompt ?? "");
    const nextPhase = getNextPhase(phase, Boolean(parsed.done));
    const done = nextPhase === "complete";

    addInteraction(sessionId, {
      role: "assistant",
      content: feedback + (nextPrompt ? `\n\n${nextPrompt}` : ""),
      phase: nextPhase,
    });

    return NextResponse.json({
      feedback,
      nextPrompt,
      phase: nextPhase,
      done,
    });
  } catch (error) {
    console.error("Interact API error:", error);
    const fallback = getFallbackFeedback(phase, userInput);
    return NextResponse.json({
      feedback: fallback.feedback,
      nextPrompt: fallback.nextPrompt,
      phase: fallback.nextPhase,
      done: fallback.done,
    });
  }
}

function getNextPhase(current: string, aiSaysDone: boolean): string {
  if (aiSaysDone) return "complete";
  switch (current) {
    case "briefing":
      return "checkpoint";
    case "checkpoint":
      return "boss";
    case "boss":
      return "complete";
    default:
      return "freeform";
  }
}

function buildSystemPrompt(
  session: ReturnType<typeof getSession>,
  phase: string
): string {
  if (!session) return "";

  const storyContext = session.interactive_story;
  const phaseContent =
    phase === "briefing"
      ? storyContext.opening
      : phase === "checkpoint"
        ? storyContext.checkpoint
        : phase === "boss"
          ? storyContext.boss_level
          : "";

  return `You are an interactive study tutor for "${storyContext.title}".

The student is working through an exam prep mission. They are currently in the "${phase}" phase.

Study concepts: ${session.concepts.join(", ")}
Source material context: ${session.source_text.slice(0, 6000)}

Current phase content:
${phaseContent}

The student just responded to a prompt. Your job:
1. Evaluate their response — is it correct, partially correct, or wrong?
2. Give specific, encouraging feedback (2-4 sentences). If wrong, explain why without giving the full answer.
3. Provide the next prompt or question to move them forward.

Return JSON with exactly these keys:
{
  "feedback": "Your evaluation of their response",
  "nextPrompt": "The next question or instruction for the student",
  "done": false
}

Set "done" to true ONLY if the student has completed the ${phase} phase successfully.
Do not set done=true prematurely — make sure they've actually demonstrated understanding.`;
}

function getFallbackFeedback(
  phase: string,
  _userInput: string
): {
  feedback: string;
  nextPrompt: string;
  nextPhase: string;
  done: boolean;
} {
  const nextPhase = getNextPhase(phase, false);
  switch (phase) {
    case "briefing":
      return {
        feedback:
          "Good start. You've oriented yourself with the material. Let's test your understanding.",
        nextPrompt:
          "Can you explain the key concept in your own words? What's the most important thing to remember?",
        nextPhase,
        done: false,
      };
    case "checkpoint":
      return {
        feedback:
          "Nice effort on the checkpoint. Let's move to the final challenge.",
        nextPrompt:
          "Final boss: Apply what you've learned to a new scenario. How would you use this knowledge in practice?",
        nextPhase,
        done: false,
      };
    case "boss":
      return {
        feedback:
          "Mission complete. You've worked through the material. Review the checklist to make sure you've covered everything.",
        nextPrompt: "",
        nextPhase: "complete",
        done: true,
      };
    default:
      return {
        feedback: "Thanks for your input. Keep working through the material.",
        nextPrompt: "",
        nextPhase: "freeform",
        done: false,
      };
  }
}
