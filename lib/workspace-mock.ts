import type {
  WorkspaceTopic,
  MissionCard,
  HintLevel,
  ChecklistItem,
  MisconceptionLogEntry,
} from "@/types";

export const MOCK_TOPICS: WorkspaceTopic[] = [
  { id: "1", name: "Force diagrams", progress: 1, weak: false },
  { id: "2", name: "Newton's laws", progress: 0.6, weak: true },
  { id: "3", name: "Friction & drag", progress: 0, weak: false },
  { id: "4", name: "Energy conservation", progress: 0, weak: false },
];

export const MOCK_MISSION: MissionCard = {
  id: "m1",
  title: "Mission 1: Fix the free-body diagram",
  scenarioPrompt:
    "The block on the ramp is sliding at constant velocity. The diagram below has one error. Identify and fix it to proceed.",
  stepIndex: 0,
  stepTotal: 3,
};

export const MOCK_HINTS: HintLevel[] = [
  { level: 1, text: "Consider which forces act along the ramp.", revealed: false },
  { level: 2, text: "If velocity is constant, what is the net force?", revealed: false },
  { level: 3, text: "Friction opposes motion; check its direction.", revealed: false },
];

export const MOCK_CHECKLIST: ChecklistItem[] = [
  { id: "c1", label: "Draw all contact forces", done: true },
  { id: "c2", label: "Add weight and normal", done: true },
  { id: "c3", label: "Check net force = 0 for constant v", done: false },
];

export const MOCK_MISCONCEPTIONS: MisconceptionLogEntry[] = [
  { id: "x1", text: "Friction direction on inclined plane", topicId: "2" },
  { id: "x2", text: "Normal force ≠ weight on slope", topicId: "2" },
];
