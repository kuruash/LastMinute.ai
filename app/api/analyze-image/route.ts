import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface AnalyzeBody {
  /** Full base64 data URL of the annotated image (image/jpeg or image/png) */
  image: string;
  /** What the user did: "highlighted a rectangular area of", "circled/drawn on parts of", etc. */
  annotationType?: string;
  /** Alt text / label for the image */
  alt?: string;
  /** User's exact question so we can tailor depth (e.g. "explain in depth") */
  userMessage?: string;
}

/**
 * POST /api/analyze-image
 *
 * Pipeline: When the user highlights an area with the pencil and asks Voxi to "explain this",
 * the frontend sends the COMPOSITED image (screenshot with red pen marks) to this API.
 * We send it to Google GEMINI (generativelanguage.googleapis.com), NOT OpenAI.
 * The model must describe ONLY what is inside the marked area—no other context or filler.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as AnalyzeBody;
  const { image, annotationType, alt, userMessage } = body;

  const msg = (userMessage ?? "").trim();
  const wantsInDepth =
    !!msg &&
    /in\s*depth|in-depth|detailed|more\s*detail|tell\s*me\s*more|break\s*(it\s*)?down|expand|elaborate|deeper|thorough/i.test(
      msg
    );
  // Default is brief; only use long reply when user explicitly asks for in-depth
  const useBrief = !wantsInDepth;

  if (!image || !image.startsWith("data:image")) {
    return NextResponse.json({ error: "No valid image provided" }, { status: 400 });
  }

  const apiKey =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";

  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  // Use the text model for vision (gemini-2.5-flash supports multimodal input)
  const model = process.env.LASTMINUTE_LLM_MODEL?.trim() || "gemini-2.0-flash";

  // Parse base64 data URL
  const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
  }
  const mimeType = match[1];
  const base64Data = match[2];

  const isCroppedRegion = annotationType === "cropped region";
  const imageLabel = alt || "lesson content";
  const studentAsk = msg ? ` The student asked: "${msg}".` : "";

  let prompt: string;
  let maxTokens: number;

  const strictRule =
    "CRITICAL: Describe ONLY what is visible inside the marked/circled area. Do NOT use any context from outside the image. Do NOT add concepts, definitions, or topic knowledge that are not explicitly shown in the marked region. No filler—only what you see.";
  const styleRule =
    "Use clear, simple language. Speak directly to the student (\"you\"). Reply in PLAIN TEXT only: no markdown, no asterisks (**).";
  const noTruncate =
    "End with a complete sentence. Never stop mid-sentence.";

  if (isCroppedRegion) {
    const cropIntro =
      "This image is the EXACT region the student selected (cropped to only what they circled). Describe ONLY what is in this image. Do not add information from elsewhere.";
    if (useBrief) {
      maxTokens = 1024;
      prompt = `${cropIntro}${studentAsk}

${strictRule}
Reply: (1) One sentence—what is this? (2) 1–2 sentences on the main parts or labels you see. (3) One takeaway. ${styleRule} ${noTruncate}`;
    } else {
      maxTokens = 3072;
      prompt = `${cropIntro}${studentAsk}

${strictRule}
Reply: (1) What does this image show? (2) Walk through each visible part/label. (3) One takeaway. Use 2–4 short paragraphs. Do not introduce topics not shown. ${styleRule} ${noTruncate}`;
    }
  } else {
    const action = annotationType || "highlighted parts of";
    const scopeRule =
      "The student drew red marks (circle/highlight) around one part of the image. You must describe ONLY the content that is inside or under those red marks. Ignore everything outside the marks. Do not explain the rest of the slide or add concepts not visible in the marked area.";
    if (useBrief) {
      maxTokens = 1024;
      prompt = `A student has ${action} an image.${studentAsk}

${scopeRule}
${strictRule}
Give a brief reply: (1) what this marked part shows, (2) what the elements/labels in the marked area mean, (3) one takeaway. 2–4 sentences only. ${styleRule} ${noTruncate}`;
    } else {
      maxTokens = 3072;
      prompt = `A student has ${action} an image.${studentAsk}

${scopeRule}
${strictRule}
Give an in-depth reply only for the marked area: name each part you see in the marks, what it means. Do not add external context. 2–4 short paragraphs. ${styleRule} ${noTruncate}`;
    }
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "Unknown error");
      console.error(`Gemini vision error (${res.status}):`, err);
      return NextResponse.json(
        { error: `Analysis failed: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    let text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Could not analyze the selected area. Try highlighting a different part.";
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1").trim();

    return NextResponse.json({ content: text });
  } catch (error) {
    console.error("Analyze image error:", error);
    return NextResponse.json(
      { error: "Analysis request failed" },
      { status: 500 }
    );
  }
}
