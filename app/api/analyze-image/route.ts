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
 * Gemini's multimodal vision API. The image must be the COMPOSITED
 * image (original diagram + user's red/yellow marks on top) so the
 * model sees exactly what the user circled—that is the "right context."
 * The prompt instructs the model to explain only that marked section.
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
  const wantsBrief =
    !!msg &&
    /brief(ly)?|short|quick|concise|in\s*short|summar(y|ize)|just\s*(the\s*)?basics|keep\s*it\s*short/i.test(
      msg
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

  const isCroppedRegion = annotationType === "cropped region";
  const imageLabel = alt || "lesson content";
  const studentAsk = msg ? ` The student asked: "${msg}".` : "";

  let prompt: string;
  let maxTokens: number;

  const styleRule =
    "Use clear, simple language and short sentences. Speak directly to the student (use \"you\"). Name what you see (e.g. \"The circle shows...\", \"The formula below means...\").";
  const noTruncate =
    "IMPORTANT: Your reply must be complete. Always end with a full sentence. Never stop mid-sentence or mid-word—the student will see exactly what you output in a chat bubble.";

  if (isCroppedRegion) {
    const cropIntro =
      "This image is the EXACT region a student selected (we cropped to only what they drew around). Explain this image clearly so they understand it.";
    if (wantsBrief) {
      maxTokens = 1024;
      prompt = `${cropIntro}${studentAsk}

Structure your reply: (1) In one sentence, what is this diagram or content about? (2) In 1–2 sentences, what do the main parts or labels mean? (3) End with one clear takeaway or the formula in words.
${styleRule}
${noTruncate}`;
    } else if (wantsInDepth) {
      maxTokens = 3072;
      prompt = `${cropIntro}${studentAsk}

Structure your reply: (1) What does this image show overall? (2) Walk through each part (labels, segments, formula) and what it means. (3) How does it connect to the topic? (4) Key formula or definition. (5) A short takeaway. Use 2–4 short paragraphs. End with a closing sentence.
${styleRule}
${noTruncate}`;
    } else {
      maxTokens = 1024;
      prompt = `${cropIntro}${studentAsk}

Structure your reply: (1) What is this (diagram, formula, table)? (2) What do the main elements mean—name them (e.g. \"The large segment is...\", \"The equation says...\")? (3) One-sentence takeaway. Use complete sentences only. End with a full concluding sentence.
${styleRule}
${noTruncate}`;
    }
  } else {
    const action = annotationType || "highlighted parts of";
    const scopeRule =
      "Explain ONLY the content inside or indicated by the red pen marks. Do not explain the rest of the image.";
    if (wantsBrief) {
      maxTokens = 1024;
      prompt = `A student has ${action} this image: "${imageLabel}".${studentAsk} ${scopeRule} Give a brief explanation: (1) what this part shows, (2) what the main elements mean, (3) one takeaway. Use 2–4 complete sentences. ${styleRule} ${noTruncate}`;
    } else if (wantsInDepth) {
      maxTokens = 3072;
      prompt = `A student has ${action} this image: "${imageLabel}".${studentAsk} ${scopeRule} Give an in-depth explanation: name each part, what it means, how it fits the topic, and a takeaway. Use 2–4 short paragraphs. End with a closing sentence. ${styleRule} ${noTruncate}`;
    } else {
      maxTokens = 1024;
      prompt = `A student has ${action} this image: "${imageLabel}".${studentAsk} ${scopeRule} Explain clearly: (1) what this part is, (2) what the elements/labels mean, (3) one-sentence takeaway. Use complete sentences. End with a full concluding sentence. ${styleRule} ${noTruncate}`;
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
