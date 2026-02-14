import { NextResponse } from "next/server";
import { createSession, getSession } from "@/lib/session-store";

export const runtime = "nodejs";

/**
 * POST /api/session — create a new session from upload data
 *
 * Body: the full upload API response
 * Returns: { sessionId, ...sessionData }
 */
export async function POST(request: Request) {
  const body = await request.json();

  const session = createSession({
    filename: body.filename ?? "",
    concepts: Array.isArray(body.concepts) ? body.concepts : [],
    checklist: Array.isArray(body.checklist) ? body.checklist : [],
    interactive_story: {
      title: body.interactive_story?.title ?? "",
      opening: body.interactive_story?.opening ?? "",
      checkpoint: body.interactive_story?.checkpoint ?? "",
      boss_level: body.interactive_story?.boss_level ?? "",
      topic_storylines: Array.isArray(body.interactive_story?.topic_storylines)
        ? body.interactive_story.topic_storylines
            .filter(
              (item: unknown) => !!item && typeof item === "object"
            )
            .map((item: Record<string, unknown>) => ({
              title: String(item.title ?? "").trim(),
              topics: Array.isArray(item.topics)
                ? item.topics.map((t) => String(t).trim()).filter(Boolean)
                : [],
              importance: String(item.importance ?? "medium").trim().toLowerCase(),
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
        : [],
    },
    final_storytelling: body.final_storytelling ?? "",
    llm_used: Boolean(body.llm_used),
    llm_status: body.llm_status ?? "",
    source_text: body.text ?? body.final_storytelling ?? "",
  });

  return NextResponse.json({ sessionId: session.id, ...session });
}

/**
 * GET /api/session?id=<sessionId> — retrieve session data
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing session id" }, { status: 400 });
  }

  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  return NextResponse.json(session);
}
