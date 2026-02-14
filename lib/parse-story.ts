/**
 * Converts raw session data into the initial flow blocks for the mission canvas.
 *
 * No more regex parsing of choices. The interactive_story fields are displayed
 * as narrative, and user interaction goes through /api/interact which calls Gemini.
 */

import type { FlowBlock } from "@/components/workspace/mission-canvas";

interface SessionStory {
  title: string;
  opening: string;
  checkpoint: string;
  boss_level: string;
}

/**
 * Build the initial blocks shown when the workspace first loads.
 * Just the opening narrative + a prompt to get started.
 */
export function buildInitialBlocks(story: SessionStory): FlowBlock[] {
  const blocks: FlowBlock[] = [];

  if (story.opening) {
    blocks.push({
      id: "init-narrative",
      role: "narrative",
      content: story.opening,
      phase: "briefing",
    });
  }

  // Add a prompt to get the user started
  blocks.push({
    id: "init-prompt",
    role: "prompt",
    content: story.opening
      ? "Read the briefing above and respond. What's your approach? Make a choice or explain your thinking."
      : "Your mission is ready. Start by telling us what you know about the topic.",
    phase: "briefing",
  });

  return blocks;
}
