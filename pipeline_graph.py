import base64
import json
import os
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, TypedDict

import requests as _http
from langgraph.graph import END, StateGraph

from agents.preprocessing.text_normalizer import normalize_text

try:
    import google.generativeai as genai
except Exception:
    genai = None

try:
    from langsmith import traceable
except Exception:
    def traceable(*_args, **_kwargs):
        def decorator(func):
            return func
        return decorator


class PipelineState(TypedDict):
    raw_files: list
    extracted_text: str
    cleaned_text: str
    chunks: list
    concepts: list
    normalized_concepts: list
    priority_concepts: list
    scenario_seed: dict
    learning_event: dict
    todo_checklist: list
    interactive_story: dict
    final_storytelling: str
    story_beats: list
    llm_used: bool
    llm_status: str


def _read_env_file_value(key: str) -> str:
    for filename in (".env.local", ".env"):
        if not os.path.exists(filename):
            continue
        try:
            with open(filename, "r", encoding="utf-8") as file:
                for raw_line in file:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    left, right = line.split("=", 1)
                    left = left.strip()
                    if left.startswith("export "):
                        left = left[len("export ") :].strip()
                    if left != key:
                        continue
                    value = right.strip()
                    if (value.startswith('"') and value.endswith('"')) or (
                        value.startswith("'") and value.endswith("'")
                    ):
                        value = value[1:-1]
                    elif "#" in value:
                        value = value.split("#", 1)[0].strip()
                    return value.strip()
        except Exception:
            continue
    return ""


def _llm_client():
    if genai is None:
        return None, "google-generativeai not installed"
    api_key = (
        _read_env_file_value("GEMINI_API_KEY")
        or _read_env_file_value("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )
    if not api_key:
        return None, "missing GEMINI_API_KEY/GOOGLE_API_KEY"
    genai.configure(api_key=api_key)
    return genai, "ok"


def _llm_model() -> str:
    return (
        os.getenv("LASTMINUTE_LLM_MODEL", "").strip()
        or _read_env_file_value("LASTMINUTE_LLM_MODEL")
        or "gemini-1.5-flash"
    )


def _parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except Exception:
                return {}
        return {}


@traceable(run_type="llm", name="gemini_json_call")
def _llm_json(system_prompt: str, user_prompt: str) -> tuple[dict[str, Any], str]:
    client, status = _llm_client()
    if client is None:
        return {}, status
    try:
        model = client.GenerativeModel(_llm_model())
        prompt = (
            f"{system_prompt}\n\n"
            "Return strictly valid JSON. Do not wrap in markdown.\n\n"
            f"{user_prompt}"
        )
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.2},
        )
        content = response.text or "{}"
        return _parse_json(content), "ok"
    except Exception as error:
        return {}, f"gemini request failed: {error}"


@traceable(run_type="chain", name="store_raw_files")
def store_raw_files(state: PipelineState) -> PipelineState:
    stored = [f"stored::{name}" for name in state.get("raw_files", [])]
    return {**state, "raw_files": stored}


@traceable(run_type="chain", name="extract_text")
def extract_text(state: PipelineState) -> PipelineState:
    existing_text = state.get("extracted_text", "").strip()
    if existing_text:
        return {**state, "extracted_text": existing_text}

    files = state.get("raw_files", [])
    combined = "\n".join(f"dummy extracted text from {name}" for name in files)
    if not combined:
        combined = "dummy extracted text."
    return {**state, "extracted_text": combined}


@traceable(run_type="chain", name="clean_text")
def clean_text(state: PipelineState) -> PipelineState:
    text = state.get("extracted_text", "")
    cleaned = normalize_text(text)
    return {**state, "cleaned_text": cleaned}


@traceable(run_type="chain", name="chunk_text")
def chunk_text(state: PipelineState) -> PipelineState:
    text = state.get("cleaned_text", "")
    if not text:
        return {**state, "chunks": []}

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    chunks = []
    current = ""
    max_len = 350

    for sentence in sentences:
        candidate = sentence if not current else f"{current} {sentence}"
        if len(candidate) <= max_len:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = sentence

    if current:
        chunks.append(current)

    return {**state, "chunks": chunks}


@traceable(run_type="chain", name="concept_extraction")
def concept_extraction(state: PipelineState) -> PipelineState:
    text = state.get("cleaned_text", "")
    llm_result, llm_status = _llm_json(
        system_prompt=(
            "You extract high-signal study concepts from course materials. "
            "Return valid JSON only."
        ),
        user_prompt=(
            "Task: extract only explainable study concepts from the source text.\n"
            "Hard constraints:\n"
            "1) Return 12-30 concepts when available (do not stop at 12 if more strong concepts exist).\n"
            "2) Keep only explainable academic concepts: principles, methods, formulas, algorithms, models, "
            "processes, or technical terms.\n"
            "3) Keep only concepts useful for learning, revision, or exam questions.\n"
            "4) Exclude all administrative/logistics content: course title/number, instructor names, dates, grading, "
            "URLs, room numbers, office hours, submission rules, textbook metadata.\n"
            "5) Exclude sentences and long clauses.\n"
            "6) Each concept must be a short noun phrase (1-6 words), lowercase.\n"
            "7) Deduplicate and normalize synonyms to one canonical concept label.\n"
            "8) Rank concepts by exam usefulness (most important first).\n"
            "9) If not clearly explainable, exclude it.\n"
            "Output JSON only with exact schema: {\"concepts\": [\"...\"]}\n"
            "No markdown. No extra keys. No commentary.\n\n"
            f"TEXT:\n{text[:12000]}"
        ),
    )
    llm_concepts = llm_result.get("concepts", [])
    if isinstance(llm_concepts, list):
        cleaned_llm = [str(item).strip().lower() for item in llm_concepts if str(item).strip()]
        if cleaned_llm:
            return {
                **state,
                "concepts": cleaned_llm,
                "llm_used": True,
                "llm_status": "ok",
            }

    words = re.findall(r"\b[a-z][a-z0-9]{2,}\b", text)
    stopwords = {
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "are",
        "was",
        "were",
        "have",
        "has",
        "not",
        "you",
        "your",
        "into",
        "about",
        "can",
        "will",
        "they",
        "their",
        "then",
        "than",
        "also",
        "but",
        "all",
    }
    filtered = [w for w in words if w not in stopwords]
    freq = Counter(filtered)
    concepts = [word for word, _ in freq.most_common(12)]
    if not concepts:
        concepts = ["core-topic", "key-idea", "review-focus"]
    return {**state, "concepts": concepts, "llm_status": llm_status}


@traceable(run_type="chain", name="normalize_concepts")
def normalize_concepts(state: PipelineState) -> PipelineState:
    seen = set()
    normalized = []
    for concept in state.get("concepts", []):
        value = str(concept).strip().lower()
        if value and value not in seen:
            seen.add(value)
            normalized.append(value)
    return {**state, "normalized_concepts": normalized}


@traceable(run_type="chain", name="estimate_priority")
def estimate_priority(state: PipelineState) -> PipelineState:
    priority = state.get("normalized_concepts", [])[:5]
    return {**state, "priority_concepts": priority}


@traceable(run_type="chain", name="select_scenario_seed")
def select_scenario_seed(state: PipelineState) -> PipelineState:
    priority = state.get("priority_concepts", [])
    seed = {
        "focus": priority[0] if priority else "general review",
        "secondary": priority[1:],
        "mode": "deterministic-placeholder",
    }
    return {**state, "scenario_seed": seed}


@traceable(run_type="chain", name="generate_learning_event")
def generate_learning_event(state: PipelineState) -> PipelineState:
    seed = state.get("scenario_seed", {})
    focus = seed.get("focus", "general review")
    secondary = seed.get("secondary", [])
    concepts = state.get("priority_concepts", [])

    llm_result, llm_status = _llm_json(
        system_prompt=(
            "You are an expert educational story writer and learning designer. "
            "You transform technical study material into engaging, accurate, exam-focused narratives. "
            "Never invent topics not present in the source text or concepts. "
            "Return valid JSON only."
        ),
        user_prompt=(
            "Task: write an interactive learning story using only the given concepts and source text.\n"
            "Goal: help a student understand concepts deeply and retain them for exams.\n\n"
            "Hard constraints:\n"
            "1) Use ONLY ideas grounded in the provided concepts/source text.\n"
            "2) Story must be second-person (\"you\") and engaging, but academically accurate.\n"
            "3) Keep explanations simple, concrete, and beginner-friendly.\n"
            "4) Include exactly 2 decision points in the story (Choice A / Choice B).\n"
            "5) Include exactly 1 quick recall question.\n"
            "6) Tie at least 3 priority concepts into the narrative naturally.\n"
            "7) Avoid fluff, fantasy drift, and generic motivational filler.\n"
            "8) Checklist must be practical and exam-oriented (4 to 6 items).\n"
            "9) Use concise sections so it is readable in one sitting.\n\n"
            "Writing style:\n"
            "- energetic, clear, and focused\n"
            "- short paragraphs\n"
            "- concept-first explanations with mini examples\n"
            "- each section should move learning forward\n\n"
            "Return JSON with exact keys:\n"
            "{"
            "\"title\": str, "
            "\"storytelling\": str, "
            "\"checklist\": [str, str, str, str, ...], "
            "\"opening\": str, "
            "\"checkpoint\": str, "
            "\"boss_level\": str"
            "}\n"
            "No markdown. No extra keys. No commentary.\n\n"
            f"CONCEPTS: {concepts}\n\n"
            f"SOURCE TEXT:\n{state.get('cleaned_text', '')[:12000]}"
        ),
    )
    if llm_result:
        title = str(llm_result.get("title", f"LastMinute Mission: {focus}")).strip()
        storytelling = str(llm_result.get("storytelling", "")).strip()
        llm_checklist = llm_result.get("checklist", [])
        checklist = [str(item).strip() for item in llm_checklist if str(item).strip()]
        if not checklist:
            checklist = [
                f"Read and annotate the section around '{focus}'.",
                "Write three flashcards from the material.",
                "Solve one timed practice question.",
                "Summarize the topic from memory.",
            ]
        story = {
            "title": title,
            "opening": str(llm_result.get("opening", "")).strip(),
            "checkpoint": str(llm_result.get("checkpoint", "")).strip(),
            "boss_level": str(llm_result.get("boss_level", "")).strip(),
        }
        story_text = storytelling or (
            f"{title}\n\n"
            f"Act 1 - The Briefing:\n{story['opening']}\n\n"
            f"Act 2 - The Checkpoint:\n{story['checkpoint']}\n\n"
            f"Final Boss:\n{story['boss_level']}\n\n"
            f"Mission Checklist:\n- " + "\n- ".join(checklist)
        )
        event = {
            "title": title.lower(),
            "format": "interactive-story",
            "tasks": checklist,
            "concepts": concepts,
            "interactive_story": story,
            "final_storytelling": story_text,
        }
        return {
            **state,
            "learning_event": event,
            "todo_checklist": checklist,
            "interactive_story": story,
            "final_storytelling": story_text,
            "llm_used": True,
            "llm_status": "ok",
        }

    checklist = [
        f"Read and annotate the section around '{focus}'.",
        f"Create 3 flashcards for '{focus}' and key terms.",
        "Answer 5 quick self-test questions from the uploaded material.",
        "Write a 4-line summary from memory.",
    ]
    if secondary:
        checklist.append(f"Link '{focus}' with '{secondary[0]}' in one example.")

    story = {
        "title": f"LastMinute Mission: {focus}",
        "opening": f"You are 24 hours from the exam. Your mission starts with {focus}.",
        "checkpoint": "Unlock the next checkpoint by solving one practice prompt.",
        "boss_level": "Teach the concept back in plain language without notes.",
    }
    concepts_text = ", ".join(concepts) if concepts else "core ideas"
    story_text = (
        f"{story['title']}\n\n"
        f"Act 1 - The Briefing:\n{story['opening']}\n\n"
        f"Act 2 - The Route:\n"
        f"Your guide marks these concepts as critical: {concepts_text}.\n"
        f"Every checkpoint you clear gives you more control of the final exam map.\n\n"
        f"Act 3 - The Checkpoint:\n{story['checkpoint']}\n\n"
        f"Final Boss:\n{story['boss_level']}\n\n"
        f"Mission Checklist:\n- " + "\n- ".join(checklist)
    )

    event = {
        "title": f"mission: {focus}",
        "format": "guided practice",
        "tasks": checklist,
        "concepts": concepts,
        "interactive_story": story,
        "final_storytelling": story_text,
    }
    return {
        **state,
        "learning_event": event,
        "todo_checklist": checklist,
        "interactive_story": story,
        "final_storytelling": story_text,
        "llm_status": llm_status or state.get("llm_status", "fallback"),
    }


def _get_api_key() -> str:
    """Return the Gemini/Google API key from env or .env files."""
    return (
        _read_env_file_value("GEMINI_API_KEY")
        or _read_env_file_value("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )


# Global rate-limiter: allow at most 1 image request per _IMG_MIN_INTERVAL seconds
# to stay well within Gemini free-tier limits (~10-15 RPM for image gen).
_IMG_LOCK = threading.Lock()
_IMG_LAST_CALL = 0.0
_IMG_MIN_INTERVAL = 4.0  # seconds between requests
_IMG_MAX_RETRIES = 4
_IMG_BASE_BACKOFF = 5.0  # seconds


def _generate_image(description: str) -> str | None:
    """Call Gemini image generation API with retry + rate limiting."""
    global _IMG_LAST_CALL
    api_key = _get_api_key()
    if not api_key:
        return None

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.0-flash-exp-image-generation:generateContent"
        f"?key={api_key}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            f"{description} "
                            "Render as a single, high-clarity diagram: crisp lines, "
                            "distinct elements, no blur. Each concept must have a "
                            "unique visual — no repeated icons or duplicate labels. "
                            "No placeholder or lorem ipsum text."
                        )
                    }
                ]
            }
        ],
        "generationConfig": {"responseModalities": ["Text", "Image"]},
    }

    for attempt in range(_IMG_MAX_RETRIES):
        # ── Rate-limit: ensure minimum gap between requests ──────
        with _IMG_LOCK:
            now = time.monotonic()
            wait = _IMG_MIN_INTERVAL - (now - _IMG_LAST_CALL)
            if wait > 0:
                time.sleep(wait)
            _IMG_LAST_CALL = time.monotonic()

        try:
            resp = _http.post(url, json=payload, timeout=90)

            # Rate-limited or server error → retry with backoff
            if resp.status_code in (429, 500, 502, 503):
                backoff = _IMG_BASE_BACKOFF * (2 ** attempt)
                print(
                    f"Image API {resp.status_code} (attempt {attempt + 1}/"
                    f"{_IMG_MAX_RETRIES}), retrying in {backoff:.0f}s..."
                )
                time.sleep(backoff)
                continue

            if resp.status_code != 200:
                print(f"Image API returned {resp.status_code}: {resp.text[:300]}")
                return None

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return None
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                inline = part.get("inlineData")
                if inline and inline.get("data"):
                    mime = inline.get("mimeType", "image/png")
                    return f"data:{mime};base64,{inline['data']}"
            return None
        except Exception as exc:
            if attempt < _IMG_MAX_RETRIES - 1:
                backoff = _IMG_BASE_BACKOFF * (2 ** attempt)
                print(f"Image gen error (attempt {attempt + 1}): {exc}, retry in {backoff:.0f}s")
                time.sleep(backoff)
            else:
                print(f"Image generation failed after {_IMG_MAX_RETRIES} attempts: {exc}")
                return None

    return None


def generate_story_visuals(state: PipelineState) -> PipelineState:
    """Break the story into beats with 3 step-by-step concept images each."""
    story_text = state.get("final_storytelling", "")
    concepts = state.get("priority_concepts", [])
    if not story_text:
        return {**state, "story_beats": []}

    concepts_str = ", ".join(concepts) if concepts else "the main topics"

    # ── Step 1: Decompose story into beats with 3 image steps per beat ─
    # We also pass the original cleaned_text so the LLM can reference
    # the exact slide content, not just the story paraphrase.
    source_text = state.get("cleaned_text", "")

    result, _ = _llm_json(
        system_prompt=(
            "You are an educational visual designer. You break lecture content "
            "into sequential beats, each covering ONE concept from the slides.\n\n"
            "STRICT RULES:\n"
            "1. Each beat's narrative must contain ONLY information from the "
            "   source slides. Do NOT invent examples, names, or scenarios.\n"
            "2. Use the EXACT terminology and definitions from the slides.\n"
            "3. The beat label must be the actual concept name from the slides.\n"
            "4. For EACH beat, create exactly 3 image_steps — each step must "
            "   show a DIFFERENT visual (no repeated icons, layouts, or labels):\n"
            "     Step 1: one clear diagram (e.g. single framework or definition)\n"
            "     Step 2: a different diagram (e.g. process or mechanism)\n"
            "     Step 3: a different diagram again (e.g. result or comparison)\n"
            "5. AVOID REPETITION: Do not reuse the same icon, symbol, or label "
            "   for different concepts. Each step must have its own distinct "
            "   visual. Within one step, each element (e.g. each of the 4 Ps) "
            "   must have a unique shape/icon — no duplicate labels in one image.\n"
            "6. Image prompts must be SPECIFIC: name each element once, clearly "
            "   (e.g. 'four boxes: one labeled Product, one Price, one Place, "
            "   one Promotion — each with a different symbol').\n\n"
            "Return valid JSON only."
        ),
        user_prompt=(
            "Break this lecture content into 4-6 sequential beats.\n\n"
            f"CONCEPTS FROM SLIDES: {concepts_str}\n\n"
            "For each beat provide:\n"
            "  - label: the concept name (exact term from slides)\n"
            "  - narrative: 2-5 sentences covering what the slides say about "
            "    this concept. Use exact definitions and terms from the source.\n"
            "    Write in second-person ('you learn that...').\n"
            "  - is_decision: true if this beat has a decision point\n"
            "  - choices: array of choice labels from actual slide content "
            "    (empty if not a decision)\n"
            "  - image_steps: EXACTLY 3 objects, each with:\n"
            "      - step_label: e.g. 'Step 1: [one specific aspect]'\n"
            "      - prompt: a DETAILED description for ONE clear diagram.\n"
            "        Rules for the prompt:\n"
            "        • Describe exactly which elements appear (each with a "
            "          distinct shape or icon — no two elements the same).\n"
            "        • Step 1, 2, and 3 must describe DIFFERENT compositions "
            "          (no copy-paste; vary layout and focus).\n"
            "        • Use concrete terms from the slides (e.g. Product, Price, "
            "          Place, Promotion — each named once with a unique visual).\n"
            "        BAD: repeating 'PRODUCT' on two nodes; same icon for "
            "        different concepts; generic 'three people' icons.\n"
            "        GOOD: 'Four distinct quadrants: top-left Product (box icon), "
            "        top-right Price (coin icon), bottom-left Place (pin icon), "
            "        bottom-right Promotion (megaphone icon), all pointing to "
            "        center Target Market'\n\n"
            "Return JSON:\n"
            '{"beats": [\n'
            '  {"label": "...", "narrative": "...", "is_decision": false, '
            '"choices": [], "image_steps": [\n'
            '    {"step_label": "Step 1: ...", "prompt": "..."},\n'
            '    {"step_label": "Step 2: ...", "prompt": "..."},\n'
            '    {"step_label": "Step 3: ...", "prompt": "..."}\n'
            "  ]},\n"
            "  ...\n"
            "]}\n\n"
            f"ORIGINAL SLIDE CONTENT:\n{source_text[:8000]}\n\n"
            f"STORY (for structure reference):\n{story_text[:4000]}"
        ),
    )
    beats_raw = result.get("beats", [])
    if not isinstance(beats_raw, list) or not beats_raw:
        return {**state, "story_beats": []}

    beats: list[dict[str, Any]] = []
    for b in beats_raw[:6]:
        raw_steps = b.get("image_steps", [])
        image_steps: list[dict[str, str]] = []
        for s in raw_steps[:3]:
            image_steps.append(
                {
                    "step_label": str(s.get("step_label", "")).strip(),
                    "prompt": str(s.get("prompt", "")).strip(),
                    "image_data": "",
                }
            )
        # Pad to 3 if the LLM returned fewer
        while len(image_steps) < 3:
            image_steps.append({"step_label": "", "prompt": "", "image_data": ""})

        beats.append(
            {
                "label": str(b.get("label", "")).strip(),
                "narrative": str(b.get("narrative", "")).strip(),
                "is_decision": bool(b.get("is_decision", False)),
                "choices": [
                    str(c).strip() for c in b.get("choices", []) if str(c).strip()
                ],
                "image_steps": image_steps,
            }
        )

    # ── Step 2: Generate all step images in parallel ──────────────────
    # Each job is (beat_index, step_index, prompt_text)
    jobs: list[tuple[int, int, str]] = []
    for bi, beat in enumerate(beats):
        for si, step in enumerate(beat["image_steps"]):
            if step["prompt"]:
                jobs.append((bi, si, step["prompt"]))

    def _gen_step_image(
        beat_idx: int, step_idx: int, prompt_text: str
    ) -> tuple[int, int, str | None]:
        full_prompt = (
            f"Create a single, clear educational diagram: {prompt_text}. "
            "Style: crisp vector-style illustration, high clarity, bold shapes "
            "and clear visual hierarchy. Use bright, distinct colors per element "
            "so each part is easy to tell apart. "
            "Each element in the diagram must have a UNIQUE icon or shape — "
            "do NOT use the same icon or label for different concepts; no "
            "duplicate symbols. "
            "Do NOT add placeholder text, lorem ipsum, or gibberish. "
            "If labels are essential (e.g. Product, Price, Place, Promotion), "
            "use a few large, bold, readable labels only — no small or blurry text. "
            "Do NOT show people, faces, or generic office scenes. "
            "One focal diagram per image, no clutter."
        )
        return beat_idx, step_idx, _generate_image(full_prompt)

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [
            pool.submit(_gen_step_image, bi, si, prompt)
            for bi, si, prompt in jobs
        ]
        for future in as_completed(futures):
            try:
                bi, si, img = future.result()
                if img:
                    beats[bi]["image_steps"][si]["image_data"] = img
            except Exception:
                pass

    return {**state, "story_beats": beats}


def build_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("store_raw_files", store_raw_files)
    graph.add_node("extract_text", extract_text)
    graph.add_node("clean_text", clean_text)
    graph.add_node("chunk_text", chunk_text)
    graph.add_node("concept_extraction", concept_extraction)
    graph.add_node("normalize_concepts", normalize_concepts)
    graph.add_node("estimate_priority", estimate_priority)
    graph.add_node("select_scenario_seed", select_scenario_seed)
    graph.add_node("generate_learning_event", generate_learning_event)
    graph.add_node("generate_story_visuals", generate_story_visuals)

    graph.set_entry_point("store_raw_files")
    graph.add_edge("store_raw_files", "extract_text")
    graph.add_edge("extract_text", "clean_text")
    graph.add_edge("clean_text", "chunk_text")
    graph.add_edge("chunk_text", "concept_extraction")
    graph.add_edge("concept_extraction", "normalize_concepts")
    graph.add_edge("normalize_concepts", "estimate_priority")
    graph.add_edge("estimate_priority", "select_scenario_seed")
    graph.add_edge("select_scenario_seed", "generate_learning_event")
    graph.add_edge("generate_learning_event", "generate_story_visuals")
    graph.add_edge("generate_story_visuals", END)
    return graph.compile()


PIPELINE_GRAPH = build_graph()


@traceable(run_type="chain", name="run_pipeline")
def run_pipeline(raw_files: list, extracted_text: str = "") -> PipelineState:
    initial_state: PipelineState = {
        "raw_files": raw_files,
        "extracted_text": extracted_text,
        "cleaned_text": "",
        "chunks": [],
        "concepts": [],
        "normalized_concepts": [],
        "priority_concepts": [],
        "scenario_seed": {},
        "learning_event": {},
        "todo_checklist": [],
        "interactive_story": {},
        "final_storytelling": "",
        "story_beats": [],
        "llm_used": False,
        "llm_status": "",
    }
    return PIPELINE_GRAPH.invoke(initial_state)


def _state_preview_value(value: Any) -> Any:
    if isinstance(value, str):
        return value if len(value) <= 180 else f"{value[:180]}... ({len(value)} chars)"
    if isinstance(value, list):
        if len(value) <= 6:
            return value
        return value[:6] + [f"... ({len(value)} items total)"]
    if isinstance(value, dict):
        preview = {}
        for key, inner in value.items():
            preview[key] = _state_preview_value(inner)
        return preview
    return value


@traceable(run_type="chain", name="run_pipeline_with_trace")
def run_pipeline_with_trace(
    raw_files: list, extracted_text: str = ""
) -> tuple[PipelineState, list[dict[str, Any]]]:
    initial_state: PipelineState = {
        "raw_files": raw_files,
        "extracted_text": extracted_text,
        "cleaned_text": "",
        "chunks": [],
        "concepts": [],
        "normalized_concepts": [],
        "priority_concepts": [],
        "scenario_seed": {},
        "learning_event": {},
        "todo_checklist": [],
        "interactive_story": {},
        "final_storytelling": "",
        "llm_used": False,
        "llm_status": "",
    }

    current_state: dict[str, Any] = dict(initial_state)
    trace: list[dict[str, Any]] = []

    for update in PIPELINE_GRAPH.stream(initial_state, stream_mode="updates"):
        if not isinstance(update, dict):
            continue
        for node_name, node_update in update.items():
            if not isinstance(node_update, dict):
                continue
            current_state.update(node_update)
            trace.append(
                {
                    "node": node_name,
                    "updated_fields": list(node_update.keys()),
                    "state_preview": {
                        key: _state_preview_value(current_state.get(key))
                        for key in current_state.keys()
                    },
                }
            )

    final_state = PIPELINE_GRAPH.invoke(initial_state)
    return final_state, trace


if __name__ == "__main__":
    sample = """
    Page 1
    Newton's second law explains force, mass, and acceleration.
    force equals mass times acceleration.
    Practice free-body diagrams for exam problems.
    """
    result = run_pipeline(["syllabus.pdf", "week1_notes.md"], extracted_text=sample)
    print(json.dumps(result, indent=2))
