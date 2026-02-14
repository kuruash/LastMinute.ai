# LastMinute.ai Pipeline Agent Guide

This file explains what each function in `pipeline_graph.py` does and how it is used by uploads.

## Entry Point

- `run_pipeline(raw_files: list, extracted_text: str = "") -> PipelineState`
  - Builds an initial `PipelineState`.
  - Invokes the compiled LangGraph (`PIPELINE_GRAPH.invoke(...)`).
  - Returns final state with concepts, checklist, and storytelling output.

## State Shape (`PipelineState`)

- `raw_files`: list of file names/ids.
- `extracted_text`: raw extracted text from loaders.
- `cleaned_text`: normalized text for downstream parsing.
- `chunks`: chunked text units.
- `concepts`: initial extracted concept candidates.
- `normalized_concepts`: deduplicated/normalized concepts.
- `priority_concepts`: top concepts used for study focus.
- `scenario_seed`: compact dict with focus + secondary concepts.
- `learning_event`: structured output payload.
- `todo_checklist`: generated action list.
- `interactive_story`: structured story sections.
- `final_storytelling`: full story text shown in UI.
- `llm_used`: whether Gemini was used.
- `llm_status`: reason/status of LLM usage.

## LLM Helper Functions

- `_read_env_file_value(key: str) -> str`
  - Reads keys from `.env.local` then `.env`.
  - Supports `export KEY=...` format.
  - Strips quotes and inline comments.

- `_llm_client()`
  - Initializes Gemini SDK (`google.generativeai`).
  - Resolves API key from:
    - `.env.local` / `.env` (`GEMINI_API_KEY` or `GOOGLE_API_KEY`)
    - process environment fallback.
  - Returns `(client_or_none, status_string)`.

- `_llm_model() -> str`
  - Returns model from `LASTMINUTE_LLM_MODEL` or default `gemini-1.5-flash`.

- `_parse_json(text: str) -> dict`
  - Safely parses JSON model output.
  - Attempts brace-slice recovery for malformed wrappers.

- `_llm_json(system_prompt: str, user_prompt: str) -> tuple[dict, str]`
  - Calls Gemini model with deterministic settings (`temperature=0.2`).
  - Expects strict JSON response.
  - Returns `(parsed_json, status)`.

## Graph Node Functions (Execution Order)

1. `store_raw_files(state)`
   - Simulates raw file storage by tagging names (`stored::...`).
   - Updates only `raw_files`.

2. `extract_text(state)`
   - Uses provided `extracted_text` if already present.
   - Otherwise creates a placeholder extracted string.
   - Updates `extracted_text`.

3. `clean_text(state)`
   - Runs `normalize_text(...)` from `agents/preprocessing/text_normalizer.py`.
   - Updates `cleaned_text`.

4. `chunk_text(state)`
   - Splits cleaned text by sentence boundaries and max length.
   - Updates `chunks`.

5. `concept_extraction(state)`
   - Primary path: Gemini extracts study concepts (ignores admin noise).
   - Fallback path: regex/frequency-based concept extraction.
   - Updates `concepts`, plus `llm_used`/`llm_status` when applicable.

6. `normalize_concepts(state)`
   - Lowercases, trims, deduplicates concept list.
   - Updates `normalized_concepts`.

7. `estimate_priority(state)`
   - Picks top concepts for focus.
   - Updates `priority_concepts`.

8. `select_scenario_seed(state)`
   - Builds focus seed:
    - `focus`: first priority concept
    - `secondary`: remaining top concepts
    - `mode`: marker string
   - Updates `scenario_seed`.

9. `generate_learning_event(state)`
   - Primary path: Gemini generates interactive story + checklist JSON.
   - Fallback path: deterministic story/checklist template.
   - Updates:
    - `learning_event`
    - `todo_checklist`
    - `interactive_story`
    - `final_storytelling`
    - `llm_used`/`llm_status`

## Graph Construction

- `build_graph()`
  - Creates `StateGraph(PipelineState)`.
  - Adds all nodes in strict sequence.
  - Sets entry point `store_raw_files`.
  - Connects final node to `END`.
  - Returns compiled graph object.

- `PIPELINE_GRAPH`
  - Singleton compiled graph used by `run_pipeline(...)`.

## Upload Integration

- `app/api/upload/route.ts`
  - Saves uploaded file temporarily.
  - Extracts text through loader factory.
  - Calls `run_pipeline([path], extracted_text=text)` in Python.
  - Returns:
    - `concepts`
    - `checklist`
    - `interactive_story`
    - `final_storytelling`
    - `llm_used`
    - `llm_status`

- `components/ui/v0-ai-chat.tsx`
  - Shows story-first result card.
  - Displays `LLM-generated story` vs `Fallback story`.
  - Displays fallback reason using `llm_status`.
