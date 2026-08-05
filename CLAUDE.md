# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Fuse** is a three-service monorepo for AI-driven resume optimization: upload a resume (PDF or `.tex`) + a job description, and a multi-agent LLM pipeline (Critic → GitHub match → Writer → QA loop) rewrites it to align with the JD, then exports an optimized PDF.

- `ai-engine/` — Python 3.11 + FastAPI microservice on **:8000**. All LLM traffic goes to **Nvidia NIM** (OpenAI-compatible API). This is a fork of HackerRank's `hiring-agent` rewritten as an HTTP service; the legacy CLI/PDF-scoring modules (`score.py`, `evaluator.py`, `pymupdf_rag.py`, `github.py`) are largely superseded by the agent pipeline in `agents.py`.
- `api-gateway/` — Node.js + Express on **:5000**. Thin proxy the browser talks to exclusively; forwards to the AI engine, stores data in Neon PostgreSQL via Drizzle.
- `frontend/` — React 19 + Vite + Tailwind v4 on **:5173**. Pages: Upload → Editor → (ResumeEditor, Dashboard, Settings, History).

## Running the stack

Three terminals (all from repo root):

```bash
# AI engine (:8000) — Windows Git Bash
cd ai-engine && source venv/Scripts/activate && uvicorn main:app --reload --port 8000

# API gateway (:5000)
cd api-gateway && npm run dev

# Frontend (:5173)
cd frontend && npm run dev
```

- Ports/hosts are **hardcoded** across services: frontend fetches `http://localhost:5000/...`, the gateway proxies to `http://localhost:8000/...`. CORS on the engine allows origins `:5000` and `:5173`.
- Secrets live in gitignored `.env` files: `ai-engine/.env` (`NVIDIA_NIM_API_KEY` — required) and `api-gateway/.env` (`DATABASE_URL`, GitHub OAuth creds). `config.py` hardcodes `MODEL_NAME = "nvidia/nemotron-3-ultra-550b-a55b"` — a slow, high-quality model by design.

## Testing & build

- **ai-engine:** `cd ai-engine && venv/Scripts/python -m pytest` (run from the `ai-engine/` dir — tests import modules directly). Tests live in `tests/` but are **gitignored** (`test_*.py` pattern) and require a **live NIM key**. Single test: `venv/Scripts/python -m pytest tests/test_metrics_integrity.py`.
- **api-gateway:** `cd api-gateway && npm test` — jest run via `node --experimental-vm-modules` (the package is ESM, `"type":"module"`). Requires `DATABASE_URL` in `.env` (the DB module throws without it).
- **frontend:** `npm run build` = plain `vite build`. The project is **pure JSX with no `tsconfig.json`** — do not add `tsc` to the build script or it will fail.

## Request flow (end to end)

1. `Upload.jsx` → gateway `POST /api/upload` (multer) → forwards multipart to engine `POST /process-resume` (PDF → `pdf.py`/`pymupdf_rag.py`; `.tex` → lossless `latex_parser.py`) → then gateway calls `POST /api/criticize` itself and returns `{ parsed_resume, critique, jd_text, tex_template }` to the frontend.
2. `Editor.jsx` "Approve & Generate" → gateway `POST /api/rewrite` → engine `POST /api/rewrite-resume` → `generate_and_qa_resume()` (see below) → returns `{ rewritten_resume, qa_score, qa_attempts, passed_qa, metric_fixes }`.
3. `.tex` flows: `POST /api/rewrite-latex` rewrites **only** EXPERIENCE/PROJECTS bodies; `POST /api/compile-tex` re-injects them and compiles via `compiler.py` (pdflatex) to a PDF.
4. PDF export (JSON path): `Editor.jsx` → gateway `POST /api/export/pdf` (puppeteer).

## Multi-agent pipeline (`ai-engine/agents.py`)

`generate_and_qa_resume()` is the core orchestration:
1. Writer Agent generates a rewritten resume (`generate_json_completion` in `llm_utils.py` — JSON retry/validation logic, NIM client).
2. `evaluate_resume()` (in `resume_evaluator.py`) LLM-scores it against the JD (0–100).
3. **QA loop:** if score < `QA_SCORE_THRESHOLD` (85), re-run Writer with evaluator feedback — up to `QA_MAX_RETRIES` (2), total 3 attempts, keeping the best.
4. Every return path passes a `finalize()` hard gate: `enforce_metrics_integrity()` strips hallucinated metric clauses, and `_skills_grounding` is popped before serialization (see `main.py`).

The other agents: `run_critic_agent` (JD gap critique), `run_github_matching_agent` (repo selection), `rewrite_latex_sections` (surgical `.tex` rewrite). Prompts are Jinja templates in `prompts/templates/`.

## Anti-hallucination guardrails (why the QA loop is slow)

Enforced in **two layers** — prompt constraints in `prompt.py` (`IMMUTABLE_CONTENT_CONSTRAINT`, `SKILL_GROUNDING_CONSTRAINT`, `METRIC_FABRICATION_CONSTRAINT`) plus deterministic code in `validator.py`:

- **Skill grounding** (`ground_resume_skills`): a proposed skill survives only if it appears (or a fuzzy/alias match) in the generated work/project bullets.
- **Metric integrity** (`verify_metrics_integrity`): the **original resume is the only permitted source of numbers**. Comparison is LaTeX-aware and normalizes both sides before comparing pure numeric values — strips LaTeX control words (`\sim`, `\textbf`) and `%`/`x`/ordinal/`K`/`M`/`L`/comma qualifiers, so a source `.tex` `$\sim$60\%` matches the LLM's clean `60%`. Years (1900–2099) and phone-like runs are safe.

**Timeouts are deliberately long (5 min) because this pipeline makes several slow NIM round-trips** on a 550B model: gateway `/api/rewrite` uses axios `timeout: 300000`, and `Editor.jsx` uses an `AbortController` with a 300000 ms abort. Don't shrink them, and remember the frontend aborts on its own timer.

## Gotchas / non-obvious

- **Jinja templates are not auto-discovered.** `TemplateManager._load_templates()` hardcodes a name→file dict — a new `.jinja` in `prompts/templates/` must be registered there or you get "Template not found".
- **LaTeX ingestion quarantines immutable data.** `latex_parser.py` protects contact/education/awards and `\href` links (`[[LINK_N]]` tokens) so the LLM never sees or corrupts them; order is protect → extract(editable only) → LLM → inject → restore → compile.
- **`pdflatex` (MiKTeX) on Windows:** first compile after install is slow; a missing package with `[MPM]AutoInstall=ask` can hang the non-interactive subprocess (the 300 s timeout in `compiler.py` turns this into a `LatexCompileError`); the denylist regex blocks file-access macros because `-no-shell-escape` alone is not a sandbox.
- **The `ai-engine/README.md` is the upstream HackerRank README and is stale** — it describes a CLI/Ollama scoring tool, not this service. The active LLM config is `config.py` (Nvidia NIM); the `DEFAULT_MODEL`/`LLM_PROVIDER`/`MODEL_PARAMETERS` machinery in `prompt.py` is legacy.
- **Data shapes matter.** For PDFs, `parsed_resume` is a **dict** `{raw_text, pages, metadata, chunks}`, not an array — the Editor normalizes it defensively. For `.tex` it's `{format:"latex", raw_tex, sections, read_only_sections, link_placeholders, chunks}`.
- The gateway `POST /api/compile` validates the engine's response with a `%PDF-` magic-byte check and forwards upstream status codes (422 = client's LaTeX rejected).
- Root files: `tasks.md` (original Phase 1–4 task list) and `design.md` (the "Warm Editorial Minimalism" design system) are useful context but aspirational/historical.
