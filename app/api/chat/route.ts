import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ChatBody {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: string;
}

/**
 * POST /api/chat
 *
 * Tutor chat endpoint. Sends the conversation + study context to Gemini
 * and returns the assistant reply.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as ChatBody;
  const { messages, context } = body;

  if (!messages?.length) {
    return NextResponse.json(
      { error: "Messages are required" },
      { status: 400 }
    );
  }

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    return NextResponse.json(
      { role: "assistant", content: "Tutor unavailable — no API key configured." }
    );
  }

  const model = process.env.LASTMINUTE_LLM_MODEL?.trim() || "gemini-2.0-flash";

  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const wantsInDepth =
    /in\s*depth|in-depth|detailed|more\s*detail|tell\s*me\s*more|break\s*(it\s*)?down|expand|elaborate|deeper|thorough/i.test(
      lastUser
    );
  const lengthHint = wantsInDepth
    ? " The student asked for depth — give a fuller explanation (2–4 short paragraphs) with key points and one example."
    : " DEFAULT: keep replies brief (2–4 sentences). Only go longer if they explicitly asked for in-depth or more detail.";

  const systemInstruction = [
    "You are Voxi, a helpful, encouraging study tutor for a university student. Use simple, clear language and short sentences.",
    "Reply in PLAIN TEXT only: do not use markdown, asterisks (**), or other formatting. Your reply is shown in a chat bubble as-is.",
    lengthHint,
    "Always give a complete answer: end with a full sentence. Never truncate mid-thought.",
    "Reference the study material context when relevant. A quick analogy (e.g. \"Think of X as...\") helps when it fits.",
    "Never give full exam answers — guide them to the answer instead.",
    context ? `\nStudy material context:\n${context.slice(0, 8000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: wantsInDepth ? 1536 : 512,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini error:", err);
      return NextResponse.json({
        role: "assistant",
        content: "Tutor ran into an issue. Try again in a moment.",
      });
    }

    const data = await res.json();
    let text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "I'm not sure how to answer that. Can you rephrase?";
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1").trim();

    return NextResponse.json({ role: "assistant", content: text });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({
      role: "assistant",
      content: "Connection issue. Check your network and try again.",
    });
  }
}
