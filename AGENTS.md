# AGENTS.md

## What this is

**Fuse**: AI resume optimization, three services in one repo. Upload a resume (PDF or `.tex`) + job description; a multi-agent LLM pipeline (Critic → GitHub match → Writer → QA loop) rewrites it and exports a PDF.

- `ai-engine/` — Python 3.11 + FastAPI on **:8000**. All LLM traffic goes to Nvidia NIM (OpenAI-compatible). Fork of HackerRank's `hiring-agent`.
- `api-gateway/` — Node/Express on **:5000**. The browser talks **only** to this; it proxies to the engine and persists via Drizzle + Neon Postgres.
- `frontend/` — React 19 + Vite + Tailwind v4 on **:5173**. Pages: Upload → Editor → ResumeEditor/Dashboard/Settings/History.

## Running the stack

Three terminals, from repo root:

```bash
# ai-engine (:8000) — Windows Git Bash
cd ai-engine && source venv/Scripts/activate && uvicorn main:app --reload --port 8000

# api-gateway (:5000)
cd api-gateway && npm run dev

# frontend (:5173)
cd frontend && npm run dev
```

- Ports are **hardcoded**, not configured: frontend fetches `http://localhost:5000/...`, gateway routes fetch `http://localhost:8000/...`. Engine CORS allows only `:5000` and `:5173` (`main.py`).
- Secrets in gitignored `.env`: `ai-engine/.env` needs `NVIDIA_NIM_API_KEY`; `api-gateway/.env` needs `DATABASE_URL` plus GitHub OAuth creds. Missing `DATABASE_URL` does **not** crash the gateway — `db/index.js` logs a warning and leaves `db` undefined, so failures surface later and look unrelated.

## Testing & build

- **ai-engine:** run from inside `ai-engine/` (tests import modules directly): `venv/Scripts/python -m pytest`. Tests live in `tests/` but are **gitignored** (`test_*.py`) and need a **live NIM key**. Single test: `venv/Scripts/python -m pytest tests/test_metrics_integrity.py`.
- **api-gateway:** `npm test` — jest must run under `node --experimental-vm-modules` because the package is ESM (`"type":"module"`); the script already wires this.
- **frontend:** `npm run build` is plain `vite build`. There is **no tsconfig.json** — do not add `tsc` to the build.
- DB schema changes: `npm run generate` / `npm run push` (drizzle-kit) from `api-gateway/`.

## Request flow (end to end)

1. `Upload.jsx` → `POST /api/upload` (gateway) → forwards multipart to engine `POST /process-resume`, then gateway itself calls `POST /api/criticize`; returns `{ parsed_resume, critique, jd_text, tex_template }`.
2. `Editor.jsx` "Approve & Generate" → `POST /api/rewrite` → engine `POST /api/rewrite-resume` → `generate_and_qa_resume()` → returns `{ rewritten_resume, qa_score, qa_attempts, passed_qa, metric_fixes }`.
3. `.tex` path: `POST /api/compile` re-injects rewritten section bodies and compiles via pdflatex; gateway validates the response starts with `%PDF-` magic bytes and forwards upstream status codes (422 = rejected LaTeX).
4. PDF export from JSON: gateway `POST /api/export/pdf` (puppeteer).

## Multi-agent pipeline (`ai-engine/agents.py`)

`generate_and_qa_resume()`: Writer generates → `evaluate_resume()` scores vs JD (0–100) → if score < `QA_SCORE_THRESHOLD` (**75**, agents.py:49), Writer reruns with evaluator feedback up to `QA_MAX_RETRIES` (2), keeping the best of 3 attempts. Every return path passes a `finalize()` hard gate: `enforce_metrics_integrity()` strips hallucinated metrics, and `_skills_grounding` is popped before serialization (`main.py`).

Other agents: `run_critic_agent`, `run_github_matching_agent`, `rewrite_latex_sections` (surgical `.tex` rewrite). Prompts are Jinja templates in `prompts/templates/`.

## Anti-hallucination guardrails

Two layers: prompt constraints in `prompt.py` (`IMMUTABLE_CONTENT_CONSTRAINT`, `SKILL_GROUNDING_CONSTRAINT`, `METRIC_FABRICATION_CONSTRAINT`) plus deterministic code in `validator.py`:

- **Skill grounding:** a proposed skill survives only if it appears (fuzzy/alias match allowed) in generated work/project bullets.
- **Metric integrity:** the **original resume is the only permitted source of numbers**. Comparison normalizes both sides — strips LaTeX control words, `%`/`x`/ordinal/`K`/`M`/comma qualifiers — so `$\sim$60\%` matches `60%`. Years (1900–2099) and phone-like runs are exempt.

## Gotchas

- **Timeouts are long by design** — the pipeline makes several round-trips to a slow 550B model (`MODEL_NAME` hardcoded in `ai-engine/config.py`). Rewrite: gateway axios + Express socket timeouts at **600000 ms**, and `Editor.jsx` aborts on its own **600000 ms** timer. Compile route: **180000 ms**. Don't shrink any of them; remember the frontend kills requests independently.
- **Jinja templates are not auto-discovered.** `TemplateManager._load_templates()` (`prompts/template_manager.py`) hardcodes name→file; register new `.jinja` files there or rendering fails with "Template not found".
- **LaTeX ingestion quarantines immutable data.** `latex_parser.py` protects contact/education/awards and hides `\href` links behind `[[LINK_N]]` tokens: protect → extract editable sections → LLM → inject → restore → compile.
- **pdflatex (MiKTeX) on Windows:** first compile is slow; a package auto-install prompt can hang the non-interactive subprocess (compiler timeout=300 s raises `LatexCompileError`); a denylist regex blocks file-access macros because `-no-shell-escape` alone isn't a sandbox.
- **Data shapes differ by input format.** PDF: `parsed_resume` is a **dict** `{raw_text, pages, metadata, chunks}`. `.tex`: `{format:"latex", raw_tex, sections, read_only_sections, link_placeholders, chunks}`. Frontend normalizes defensively.
- **Stale docs:** `ai-engine/README.md` is the upstream HackerRank README, not this service. Legacy modules (`score.py`, `evaluator.py`, `pymupdf_rag.py`, `github.py`) are superseded by `agents.py`; active GitHub fetching is `github_fetch.py`. Root `tasks.md`/`design.md` are historical/aspirational. Note: `CLAUDE.md` has good detail but its QA threshold (85) and timeout (300 s) numbers are outdated — values above are current.
