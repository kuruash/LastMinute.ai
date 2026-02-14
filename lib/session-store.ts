/**
 * In-memory session store.
 *
 * Stores upload results keyed by session ID so the workspace page
 * can fetch data via API instead of relying on sessionStorage.
 *
 * Good enough for dev / single-server. Swap for Redis / DB later.
 */

import { randomUUID } from "crypto";

export interface SessionData {
  id: string;
  createdAt: number;
  filename: string;
  concepts: string[];
  checklist: string[];
  interactive_story: {
    title: string;
    opening: string;
    checkpoint: string;
    boss_level: string;
  };
  final_storytelling: string;
  llm_used: boolean;
  llm_status: string;
  /** Full extracted source text — used as context for tutor + interact APIs */
  source_text: string;
  /** Interaction history for this session */
  interactions: InteractionEntry[];
}

export interface InteractionEntry {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
  /** Which phase the user was in when this was generated */
  phase: "briefing" | "checkpoint" | "boss" | "complete" | "freeform";
}

// Use globalThis to survive Next.js hot-reloads in dev
const globalKey = "__lastminute_sessions__";
const globalObj = globalThis as unknown as Record<string, Map<string, SessionData>>;

if (!globalObj[globalKey]) {
  globalObj[globalKey] = new Map<string, SessionData>();
}

const store = globalObj[globalKey];

// Auto-expire sessions after 2 hours
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, session] of store) {
    if (now - session.createdAt > MAX_AGE_MS) {
      store.delete(id);
    }
  }
}

export function createSession(data: Omit<SessionData, "id" | "createdAt" | "interactions">): SessionData {
  cleanup();
  const session: SessionData = {
    ...data,
    id: randomUUID(),
    createdAt: Date.now(),
    interactions: [],
  };
  store.set(session.id, session);
  return session;
}

export function getSession(id: string): SessionData | null {
  cleanup();
  return store.get(id) ?? null;
}

export function addInteraction(sessionId: string, entry: Omit<InteractionEntry, "id" | "timestamp">): InteractionEntry | null {
  const session = store.get(sessionId);
  if (!session) return null;
  const interaction: InteractionEntry = {
    ...entry,
    id: randomUUID(),
    timestamp: Date.now(),
  };
  session.interactions.push(interaction);
  return interaction;
}
