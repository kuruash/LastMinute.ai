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
 * Accepts an annotated image (base64 data URL) and sends it to
 * Gemini's multimodal vision API for analysis/explanation.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as AnalyzeBody;
  const { image, annotationType, alt, userMessage } = body;

  const wantsInDepth =
    !!userMessage &&
    /in\s*depth|in-depth|detailed|more\s*detail|tell\s*me\s*more|break\s*(it\s*)?down|expand|elaborate|deeper|thorough/i.test(
      userMessage
    );

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

  const action = annotationType || "highlighted parts of";
  const imageLabel = alt || "an educational diagram";
  const studentAsk = userMessage?.trim()
    ? ` The student asked: "${userMessage.trim()}".`
    : "";

  const prompt = wantsInDepth
    ? `A student is studying and has ${action} this image: "${imageLabel}".${studentAsk}
The red pen marks and/or highlighted areas show what they want explained.

Give an IN-DEPTH explanation. Include:
1. What the marked area shows (labels, axes, curves, and what they mean).
2. Step-by-step: how to read it and what each part represents.
3. How this connects to the broader topic and why it matters.
4. Any formulas, definitions, or key terms that apply—spell them out.
5. A short practical takeaway or exam tip if relevant.

Use clear paragraphs. Be thorough and educational; the student asked for depth. Speak directly to the student (use "you"). Aim for a full, detailed explanation (several paragraphs if needed).`
    : `A student is studying and has ${action} this image: "${imageLabel}".${studentAsk}
The red pen marks and/or highlighted areas show what they want explained.

Instructions:
1. Focus on the ANNOTATED (marked/highlighted) area specifically.
2. Explain what that part shows—labels, terms, and relationships.
3. How does it relate to the overall concept?
4. Give a clear, helpful explanation (one or two short paragraphs). Speak directly to the student (use "you").`;

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
          maxOutputTokens: wantsInDepth ? 2048 : 1024,
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
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Could not analyze the selected area. Try highlighting a different part.";

    return NextResponse.json({ content: text });
  } catch (error) {
    console.error("Analyze image error:", error);
    return NextResponse.json(
      { error: "Analysis request failed" },
      { status: 500 }
    );
  }
}
