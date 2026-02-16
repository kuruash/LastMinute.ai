# LastMinute.ai

**Interactive, story-driven exam preparation engine.**

Students upload study materials, pick a difficulty, and learn through missions, scenarios, and embedded visuals — not passive summaries.

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Environment:** Copy `.env.example` to `.env` and set:

- `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey); required for the LLM pipeline (concepts, story, image generation).
- `LASTMINUTE_LLM_MODEL` — optional; defaults to the model used for both text and image generation (e.g. `gemini-2.5-flash`).

Without `GEMINI_API_KEY`, uploads still work but use fallback content and no generated images.

**Python (for upload pipeline):** The upload API spawns a Python process that runs the LangGraph pipeline. Use a venv and install dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Or with uv: `uv sync` (see `pyproject.toml`).

**Commands**

| Command           | Description           |
| ----------------- | --------------------- |
| `npm run build`   | Production build      |
| `npm run start`   | Serve production      |
| `npm run lint`    | Run ESLint            |

---

## LangGraph pipeline

The learning pipeline is implemented as a **LangGraph** agent in `pipeline_graph.py`.

- **State:** A single `PipelineState` TypedDict holds raw files, extracted/cleaned text, chunks, concepts, priority concepts, scenario seed, learning event, checklist, interactive story, final narrative, story beats (with optional per-step images), and LLM status.
- **Graph:** `StateGraph(PipelineState)` with a linear flow of 10 nodes:
  1. `store_raw_files` — Persist file references.
  2. `extract_text` — Use `agents.loaders` (PDF, PPT, text, image/OCR) to get raw text.
  3. `clean_text` — Normalize and clean.
  4. `chunk_text` — Split for processing.
  5. `concept_extraction` — LLM extracts concepts from chunks.
  6. `normalize_concepts` — Dedupe and normalize.
  7. `estimate_priority` — Score and rank concepts.
  8. `select_scenario_seed` — Pick scenario focus.
  9. `generate_learning_event` — LLM produces mission title, format, tasks, and narrative.
  10. `generate_story_visuals` — LLM breaks narrative into beats; each beat has up to 3 image steps, each step optionally filled with a generated diagram (Gemini image API, rate-limited).
- **Execution:** The compiled graph is invoked with `PIPELINE_GRAPH.invoke(initial_state)`. For debugging, `run_pipeline_with_trace()` uses `PIPELINE_GRAPH.stream(..., stream_mode="updates")` and returns state plus a trace of node updates.
- **Integration:** The Next.js upload API (`app/api/upload/route.ts`) writes the uploaded file to a temp path, spawns Python, and runs either `run_pipeline` or `run_pipeline_with_trace` (when `LASTMINUTE_DEBUG_PIPELINE` is set). The pipeline output is returned as JSON (story_beats, concepts, checklist, etc.) and the front end stores it (e.g. in sessionStorage) and can redirect to the results page.

---

## Features

- **File upload:** PDF, PPT, text, images (OCR). Uploads are sent to `/api/upload`, which runs the Python pipeline and returns learning content.
- **LLM pipeline:** Concept extraction, priority ranking, scenario seed, learning event (mission/tasks), and a narrative broken into story beats. Optional per-beat diagram generation via Gemini (model from `LASTMINUTE_LLM_MODEL`).
- **Results page:** `/results` shows the generated story, beats, and step-by-step images (when image generation is enabled and succeeds).
- **Sidebar:** App-wide sidebar (chat history) lists past sessions from sessionStorage and links to Overview, New upload, Latest results, with optional search.
- **Workspace:** `/workspace` provides a 3-panel learning UI (topic nav, mission canvas, support panel) for future mission/scenario gameplay.

---

## Project structure

```
LastMinute.ai/
├── app/
│   ├── api/
│   │   ├── chat/route.ts      — POST /api/chat (tutor; stub)
│   │   └── upload/route.ts     — POST /api/upload (runs Python pipeline)
│   ├── globals.css
│   ├── layout.tsx              — Root layout + SidebarLayout
│   ├── page.tsx                — Home (upload / chat UI)
│   ├── results/page.tsx        — Learning results (story, beats, images)
│   └── workspace/page.tsx      — 3-panel learning workspace
│
├── components/
│   ├── sidebar-layout.tsx      — Wraps app with sidebar; reads chat history from sessionStorage
│   ├── ui/
│   │   ├── sidebar-with-submenu.tsx
│   │   ├── v0-ai-chat.tsx      — Upload + chat UI
│   │   └── textarea.tsx
│   └── workspace/
│       ├── topic-nav.tsx
│       ├── mission-canvas.tsx
│       └── support-panel.tsx
│
├── agents/
│   ├── loaders/                — Python: PDF, PPT, text, image (OCR) loaders
│   ├── preprocessing/         — Python: text normalization
│   ├── document.ts            — TypeScript stubs
│   ├── curriculum.ts
│   ├── story.ts
│   ├── media.ts
│   ├── tutor.ts
│   └── evaluation.ts
│
├── lib/
│   └── utils.ts
├── types/
│   └── index.ts
├── pipeline_graph.py           — LangGraph pipeline (state, 10 nodes, invoke/stream)
├── pyproject.toml / requirements.txt
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## Tech stack

| Layer     | Tech                         |
| --------- | ---------------------------- |
| Framework | Next.js 13 (App Router)      |
| Language  | TypeScript (app); Python (pipeline) |
| Styling   | Tailwind CSS, shadcn-style variables |
| Icons     | lucide-react                 |
| Pipeline  | LangGraph (StateGraph), Gemini API |

---

## Status

- [x] Project scaffold (Next.js, Tailwind, TypeScript)
- [x] Chat/upload UI and sidebar with chat history
- [x] LangGraph pipeline (extract, concepts, story, beats, optional images)
- [x] Upload API calling Python pipeline; results page with story and images
- [x] Workspace 3-panel UI (topic nav, mission canvas, support panel)
- [ ] Tutor agent wired to `/api/chat`
- [ ] Mission/scenario gameplay loop and difficulty adaptation
- [ ] Voice tutor mode

---

## Contributing

1. Branch off `main`.
2. Make changes.
3. Open a PR with a short description of what changed and why.
