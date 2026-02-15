import { NextResponse } from "next/server";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  POST /api/tts                                                      */
/*  Proxy to ElevenLabs TTS. Keeps the API key server-side.           */
/* ------------------------------------------------------------------ */

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

interface TTSRequestBody {
  text: string;
  voiceId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TTSRequestBody;
    const { text, voiceId } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured." },
        { status: 501 }
      );
    }

    const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

    const elevenResp = await fetch(`${ELEVENLABS_API_URL}/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!elevenResp.ok) {
      const errText = await elevenResp.text();
      console.error("ElevenLabs error:", elevenResp.status, errText.slice(0, 300));
      return NextResponse.json(
        { error: "TTS generation failed", detail: errText.slice(0, 200) },
        { status: 502 }
      );
    }

    const audioBuffer = await elevenResp.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error("TTS proxy error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
