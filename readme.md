# Fuse — AI Resume Builder

> **Align your experience.**
>
> Fuse is a three-service, AI-driven resume-optimization app. Upload a resume
> (PDF or LaTeX `.tex`) plus a job description (JD), and a multi-agent LLM
> pipeline — Critic → GitHub Match → Writer → QA loop — rewrites the resume to
> match the JD, without inventing skills or numbers you never had. The result
> can be edited in the browser and exported as an optimized PDF, either from
> structured JSON or by recompiling your original LaTeX template.

---

## Contents

- [What Fuse does — and does not do](#what-fuse-does--and-does-not-do)
- [How it works in 60 seconds](#how-it-works-in-60-seconds)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Quickstart — run the whole stack locally](#quickstart--run-the-whole-stack-locally)
- [Using the app](#using-the-app)
- [The AI pipeline in detail](#the-ai-pipeline-in-detail)
- [Anti-hallucination guardrails](#anti-hallucination-guardrails)
- [LaTeX path in detail](#latex-path-in-detail)
- [GitHub integration](#github-integration)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Frontend routes](#frontend-routes)
- [Design system](#design-system)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security and privacy notes](#security-and-privacy-notes)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [License and attribution](#license-and-attribution)

---

## What Fuse does — and does not do

### It does

- **Parse a resume** from PDF (via PyMuPDF) or from LaTeX source (losslessly,
  see [LaTeX path](#latex-path-in-detail)).
- **Critique the resume against a JD** — missing keywords, weak action verbs,
  and experience that does not map to the role.
- **Match your GitHub repositories to the JD** and weave the most relevant
  projects into the rewritten resume.
- **Rewrite the resume with a Writer agent**, then grade the rewrite with a
  separate evaluator and retry it (with feedback) until it passes — or until
  the retry budget is spent, keeping the best attempt.
- **Enforce, in code, not just in prompts**, that new skills must be
  demonstrated in a bullet point and that numbers must already exist in your
  original resume.
- **Export a PDF** two ways:
  - JSON path: render the rewritten resume through a Handlebars template with
    Puppeteer (`optimized-resume.pdf`).
  - LaTeX path: re-inject rewritten EXPERIENCE / PROJECTS sections into your
    own `.tex` template and compile it with `pdflatex`, so your original
    formatting survives.

### It does not do

- It is **not an ATS** and not a screening product. It is a candidate-side
  tool for tailoring *your own* resume to a job you are applying for.
- It does **not** invent experience, skills, metrics, employers, or dates.
  Anything the model proposes that is not grounded in your original resume is
  stripped by the validators (see
  [Anti-hallucination guardrails](#anti-hallucination-guardrails)).
- It does **not** guarantee an interview, a score, or a pass through any
  employer's system. The QA score is Fuse's own internal 0–100 alignment
  grade, not a recruiter's decision.
- It is a **local-development stack, not a deployed product**: service URLs
  are hardcoded to `localhost` (see [Known limitations](#known-limitations)).

---

## How it works in 60 seconds

```
You
  │  1. Upload resume (.pdf / .tex) + JD (pasted text, or file)
  ▼
Frontend (React, :5173) — /upload
  │  POST /api/upload (multipart)
  ▼
API Gateway (Express, :5000)
  │  forwards the file to the AI engine, then asks it for a critique
  ▼
AI Engine (FastAPI, :8000)
  │  PDF → PyMuPDF extraction  |  .tex → protected-section parser
  │  Critic Agent → gap analysis vs. the JD
  ▼
Frontend — /editor (critique view)
  │  You review the critique, then click "Approve & Generate"
  ▼
API Gateway → AI Engine: Writer + Evaluator QA loop
  │  rewritten resume + qa_score + qa_attempts + passed_qa
  ▼
Frontend — /editor (form view)
  │  Edit basics / work / projects / skills by hand
  ▼
Export
  ├─ JSON path: POST /api/export/pdf  → Puppeteer → optimized-resume.pdf
  └─ LaTeX path: POST /api/compile   → pdflatex  → optimized-resume.pdf
```

---

## Architecture

Fuse is a monorepo with three services that must all be running. The browser
talks **only** to the API gateway; the gateway is the only service that talks
to the AI engine, and the AI engine is the only service that talks to the LLM.

| Service     | Directory        | Stack                             | Port     | Role                                                                                                                                                                            |
| ----------- | ---------------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend    | `frontend/`    | React 19 + Vite + Tailwind CSS v4 | `5173` | All UI. Fetches `http://localhost:5000/...` only.                                                                                                                             |
| API Gateway | `api-gateway/` | Node.js + Express 5               | `5000` | Thin proxy + persistence. Forwards to the engine at `http://localhost:8000/...`, stores users / resumes / JDs / GitHub profiles in Neon PostgreSQL via Drizzle ORM.           |
| AI Engine   | `ai-engine/`   | Python 3.11 + FastAPI             | `8000` | All LLM work: parsing, Critic, GitHub matching, Writer, evaluator, validators, LaTeX compile. CORS allows origins `http://localhost:5000` and `http://localhost:5173` only. |

```text
┌──────────────────┐      localhost:5000      ┌──────────────────┐
│  Frontend        │ ──────────────────────► │  API Gateway     │
│  React + Vite    │ ◄────────────────────── │  Express +       │
│  :5173           │      JSON / PDF         │  Drizzle + Neon  │
└──────────────────┘                         └──────┬───────────┘
                                                    │ localhost:8000
                                                    ▼
                                             ┌──────────────────┐
                                             │  AI Engine       │
                                             │  FastAPI +       │
                                             │  Nvidia NIM      │
                                             └──────┬───────────┘
                                                    │ OpenAI-compatible API
                                                    ▼
                                             ┌──────────────────┐
                                             │  Nvidia NIM      │
                                             │  nemotron-3-ultra│
                                             │  -550b-a55b      │
                                             └──────────────────┘
```

### Why three services?

- **Frontend** stays a pure UI: no API keys, no LLM calls, no database
  credentials in the browser.
- **Gateway** owns everything browser-adjacent: file uploads (multer),
  GitHub OAuth, persistence, PDF export via Puppeteer, and the long timeouts
  the LLM pipeline needs.
- **Engine** owns everything model-adjacent: prompts (Jinja templates),
  validators, LaTeX handling, and compilation. It can be developed and tested
  on its own with `curl` against `:8000`.

---

## Tech stack

### AI Engine (`ai-engine/`)

- **Python 3.11.13** (pinned in `.python-version`)
- **FastAPI + Uvicorn** — HTTP service; run with
  `uvicorn main:app --reload --port 8000`
- **Nvidia NIM** (OpenAI-compatible endpoint
  `https://integrate.api.nvidia.com/v1`) via the OpenAI SDK — the only LLM
  backend used by the active pipeline
- **Model (hardcoded in `config.py`)**: `nvidia/nemotron-3-ultra-550b-a55b`
  — a large, slow, high-quality model, chosen deliberately over a fast one.
  Expect multi-minute rewrites; that is by design, not a bug.
- **PyMuPDF / pymupdf4llm** — PDF → Markdown-like text extraction
- **Pydantic v2** — request/response schemas and the JSON Resume-style
  models in `models.py`
- **Jinja2** — all agent prompts live as `.jinja` templates under
  `prompts/templates/` and are rendered by `prompts/template_manager.py`
- **pdflatex** (MiKTeX on Windows, or any TeX distribution on PATH) — LaTeX
  → PDF compilation in `compiler.py`, with `-no-shell-escape` plus a
  denylist for TeX file-access macros

> **Legacy code you will also find here:** `ai-engine/` started as a fork of
> HackerRank's `hiring-agent` CLI scoring tool. `score.py`, `evaluator.py`,
> `pymupdf_rag.py`, `github.py`, the Ollama/Gemini providers in `models.py`,
> and the `LLM_PROVIDER` / `DEFAULT_MODEL` machinery in `prompt.py` are
> largely superseded by the agent pipeline in `agents.py` and the Nvidia NIM
> config in `config.py`. The `ai-engine/README.md` is the upstream
> HackerRank README and is **stale** — it describes a CLI/Ollama scoring
> tool, not this service. This root README is the accurate one for Fuse.

### API Gateway (`api-gateway/`)

- **Node.js + Express 5**, ESM (`"type": "module"`)
- **Drizzle ORM + Neon PostgreSQL** (`@neondatabase/serverless`)
- **multer** — multipart uploads, 10 MB per-file limit (see
  [API reference](#api-reference))
- **axios** — proxying to the AI engine, with long timeouts for the rewrite
  (600 s) and LaTeX compile (180 s)
- **Puppeteer + Handlebars** — JSON-path PDF export from
  `src/templates/resumeTemplate.hbs`
- **Jest + Supertest** — gateway tests (`npm test`)

### Frontend (`frontend/`)

- **React 19 + React Router 7 + Vite 8**
- **Tailwind CSS v4** (via `@tailwindcss/postcss`), **lucide-react** icons,
  **react-dropzone** for uploads
- **Pure JSX** — there is no `tsconfig.json`, so do **not** add `tsc` to
  the build script or the build will fail. `npm run build` is plain
  `vite build`.

---

## Repository layout

```text
.
├── readme.md                    # ← this file (the project README)
├── design.md                    # UI/UX design system ("Warm Editorial Minimalism")
├── tasks.md                     # Original Phase 1–4 development task list (historical)
├── userflowdiagram.md           # System-level user-flow diagram (Mermaid)
├── CLAUDE.md                    # Contributor notes for AI-assisted development
│
├── ai-engine/                   # Python 3.11 + FastAPI, :8000
│   ├── main.py                  # FastAPI app + all HTTP endpoints (see API reference)
│   ├── config.py                # Nvidia NIM base URL + MODEL_NAME (hardcoded)
│   ├── agents.py                # Critic / GitHub-match / Writer / QA-loop orchestration
│   ├── resume_evaluator.py      # LLM evaluator: 0–100 score vs. the JD
│   ├── validator.py             # Skill grounding + metric-integrity hard gates
│   ├── llm_utils.py             # NIM client, JSON completion + retry/validation
│   ├── prompt.py                # Immutable / skill-grounding / metric constraints
│   ├── prompts/
│   │   ├── template_manager.py  # Hardcoded name → template-file registry
│   │   └── templates/           # *.jinja: critic_agent, writer_agent,
│   │                            #   github_matching_agent, latex_writer_agent,
│   │                            #   basics/work/education/skills/projects/awards,
│   │                            #   resume_evaluation_criteria, system_message, …
│   ├── pdf.py                   # PDF extraction entry point
│   ├── pymupdf_rag.py           # PyMuPDF page → Markdown-like text
│   ├── transform.py             # Loose LLM JSON → JSON Resume-style normalization
│   ├── models.py                # Pydantic schemas (JSON Resume, scores, GitHub)
│   ├── latex_parser.py          # Protect / extract / inject LaTeX sections + links
│   ├── compiler.py              # pdflatex wrapper (denylist, 300 s timeout)
│   ├── github_fetch.py          # Repo enrichment + LaTeX project-bullet generation
│   ├── github.py                # Legacy GitHub scoring module (superseded)
│   ├── evaluator.py / score.py  # Legacy CLI scoring (superseded)
│   ├── requirements.txt
│   ├── .python-version          # 3.11.13
│   ├── CONTRIBUTING.md
│   ├── LICENSE
│   └── README.md                # ⚠️ stale upstream HackerRank README — ignore
│
├── api-gateway/                 # Node.js + Express, :5000
│   ├── src/
│   │   ├── index.js             # App entry: CORS (:5173), route mounting, PORT
│   │   ├── db/
│   │   │   ├── index.js         # Neon client; throws if DATABASE_URL is missing
│   │   │   └── schema.js        # users / resumes / job_descriptions / github_profiles
│   │   ├── middleware/upload.js # multer: resume .pdf/.tex, JD .pdf/.txt, 10 MB
│   │   ├── routes/
│   │   │   ├── upload.js        # POST /api/upload (+ GET /api/upload-test form)
│   │   │   ├── rewrite.js       # POST /api/rewrite (600 s timeouts)
│   │   │   ├── compile.js       # POST /api/compile (PDF magic-byte check)
│   │   │   ├── export.js        # POST /api/export/pdf (Puppeteer)
│   │   │   ├── auth.js          # GET /api/auth/github + callback (OAuth)
│   │   │   ├── github.js        # POST /api/github/sync, GET /api/github/preview
│   │   │   └── history.js       # POST /api/history/save, GET /api/history/:userId,
│   │   │                        #   GET /api/history/resume/:id
│   │   ├── services/
│   │   │   ├── githubService.js # GitHub REST: repos, READMEs, recent commits
│   │   │   └── pdfService.js    # Handlebars + Puppeteer PDF rendering
│   │   ├── templates/resumeTemplate.hbs
│   │   └── utils/fileCleanup.js
│   ├── tests/flow.test.js
│   ├── drizzle.config.js
│   └── package.json
│
└── frontend/                    # React 19 + Vite + Tailwind v4, :5173
    ├── index.html               # Title: "Fuse — Career Alignment"
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx             # React root (StrictMode)
        ├── App.jsx              # Routes (see Frontend routes)
        ├── index.css
        ├── components/Layout.jsx
        └── pages/
            ├── Upload.jsx       # Entry page (also the "/" redirect target)
            ├── Editor.jsx       # Critique view → form view; rewrite + export
            ├── ResumeEditor.jsx # Standalone manual resume editor
            ├── Dashboard.jsx    # Overview page (static placeholders — see below)
            ├── History.jsx      # Archive page (mock data in the UI — see below)
            └── Settings.jsx     # GitHub connect page
```

---

## Prerequisites

| Requirement                          | Why                 | Notes                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python 3.11                          | AI engine           | `.python-version` pins 3.11.13.                                                                                                                                                                                                                                   |
| Node.js (LTS) + npm                  | Gateway + frontend  | No `engines` field is pinned in either `package.json`.                                                                                                                                                                                                          |
| A Nvidia NIM API key                 | All LLM calls       | Get one from Nvidia's NIM / build portal. Without it, every agent call fails.                                                                                                                                                                                       |
| A Neon PostgreSQL database           | Gateway persistence | Only needed for auth / history / GitHub sync. The core upload → critique → rewrite → export flow does not read the database.                                                                                                                                     |
| GitHub OAuth app (optional)          | GitHub integration  | Only needed for the Settings → Connect GitHub flow. Skip it if you only want resume + JD rewriting.                                                                                                                                                                |
| A TeX distribution with `pdflatex` | LaTeX path only     | MiKTeX on Windows, TeX Live / MacTeX elsewhere. Not needed for the PDF/JSON path. First MiKTeX compile after install can be slow, and a missing package with auto-install set to "ask" can hang the non-interactive compile until the 300 s compiler timeout fires. |

---

## Configuration

There are **no `.env.example` files in this repo** — create the `.env` files
below by hand. Both are gitignored; never commit a real key.

### AI engine — `ai-engine/.env`

| Variable               | Required | Description                                                                                                                 |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NVIDIA_NIM_API_KEY` | Yes      | Nvidia NIM API key. Read by `config.py` via `os.getenv`.                                                                |
| `PDFLATEX`           | No       | Full path to the `pdflatex` binary. Only used if `pdflatex` is not on `PATH` (e.g. a MiKTeX install path on Windows). |

The model and endpoint are **not** environment-configurable — they are
hardcoded in `ai-engine/config.py`:

```python
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"  # trailing "/v1" required
MODEL_NAME = "nvidia/nemotron-3-ultra-550b-a55b"
```

To use a different NIM model, edit `MODEL_NAME` in `config.py` to an ID
from `https://integrate.api.nvidia.com/v1/models`.

### API gateway — `api-gateway/.env`

| Variable                 | Required              | Description                                                                                                                                                                                                                                                                                     |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes, for any DB route | Neon PostgreSQL connection string. `src/db/index.js` logs a warning and the DB module throws without it, so auth / history / GitHub-sync routes will fail — but the upload → rewrite → export proxy routes do not need it.                                                                 |
| `GITHUB_CLIENT_ID`     | Only for GitHub OAuth | GitHub OAuth app client ID.                                                                                                                                                                                                                                                                     |
| `GITHUB_CLIENT_SECRET` | Only for GitHub OAuth | GitHub OAuth app client secret.                                                                                                                                                                                                                                                                 |
| `FRONTEND_URL`         | No                    | Where the OAuth callback redirects after success. Defaults to `http://localhost:5173`.                                                                                                                                                                                                        |
| `PORT`                 | No                    | Gateway port. Defaults to `5000`. **Do not change it casually**: the frontend fetches `http://localhost:5000/...` and the engine's CORS allow-list is `http://localhost:5000` / `http://localhost:5173`, so a different port breaks the stack unless you update all three places. |

### Frontend

No environment variables. The frontend hardcodes
`http://localhost:5000/...` for every API call.

---

## Quickstart — run the whole stack locally

Three terminals, all from the repo root. Start the engine first, then the
gateway, then the frontend.

### 1. AI engine — `:8000`

```bash
cd ai-engine

# Create + activate a virtual environment
python -m venv venv
# Windows (Git Bash / PowerShell):
source venv/Scripts/activate
# macOS / Linux:
source venv/bin/activate

pip install -r requirements.txt

# Create ai-engine/.env with NVIDIA_NIM_API_KEY (see Configuration above)

uvicorn main:app --reload --port 8000
```

Sanity check: `http://localhost:8000/docs` serves FastAPI's interactive
docs for the engine endpoints.

### 2. API gateway — `:5000`

```bash
cd api-gateway
npm install

# Create api-gateway/.env with DATABASE_URL (and GitHub OAuth vars if used)

npm run dev        # nodemon src/index.js
# or: npm start    # node src/index.js (no auto-reload)
```

Sanity check: `http://localhost:5000/` returns `API Gateway is running`.

### 3. Frontend — `:5173`

```bash
cd frontend
npm install
npm run dev        # vite
```

Open **http://localhost:5173** — it redirects `/` to `/upload`.

> The old root README only listed these three commands with no setup,
> environment, or ordering. The commands above replace it: install
> dependencies, create the `.env` files, and start the services in order.

---

## Using the app

### Path A — PDF resume (the main flow)

1. **Upload** (`/upload`): drop a PDF resume and paste the JD text (or attach
   a JD file — but see the JD-file caveat in
   [Known limitations](#known-limitations): for a reliable rewrite, paste
   the JD text). Click to analyze.
2. **Critique** (`/editor`, critique view): read the Critic agent's gap
   analysis — missing keywords, weak verbs, irrelevant experience — next to
   your parsed resume.
3. **Approve & Generate**: the Writer agent rewrites the resume, the
   evaluator grades it, and the QA loop retries with feedback if needed.
   This takes minutes on the 550B model; the frontend and gateway allow up
   to 10 minutes before timing out. Do not close the tab mid-rewrite.
4. **Edit** (`/editor`, form view): fix anything by hand — basics, work,
   projects, skills. Your edits are the final word; nothing is re-run
   through the LLM after this point unless you generate again.
5. **Finalize & Export**: downloads `optimized-resume.pdf`, rendered from
   the JSON resume through the Handlebars template with Puppeteer.

### Path B — LaTeX resume (formatting-preserving flow)

1. Upload a `.tex` resume instead of a PDF. The parser quarantines your
   contact / education / awards sections and `\href` links before any LLM
   sees the document, and returns only the editable section bodies.
2. The Critic and Writer flows work the same way, but the LaTeX rewrite
   (`/api/rewrite-latex`) changes **only EXPERIENCE and PROJECTS bodies** —
   never the preamble, layout, or read-only sections.
3. Compile (`POST /api/compile` → engine `/api/compile-tex`) re-injects the
   rewritten sections, restores the original links, optionally appends
   GitHub project blocks to PROJECTS, and runs `pdflatex`. A rejected
   document returns **422** with the LaTeX log tail; a missing `pdflatex`
   binary returns **500**.

### Path C — GitHub enrichment

1. **Settings** (`/settings`) → *Connect GitHub Profile* → GitHub OAuth →
   callback stores your user + access token in Neon and redirects back to
   `/settings?github_connected=true`.
2. **Sync** (`POST /api/github/sync` with your `userId`) fetches your
   repositories (see [GitHub integration](#github-integration)) and stores
   them in `github_profiles`.
3. The GitHub Matching agent selects the repos most relevant to the JD, and
   the Writer weaves them into the rewritten resume; on the LaTeX path they
   are rendered as `\resumeProjectHeading` / `\resumeItem` blocks.

---

## The AI pipeline in detail

All prompts are Jinja templates in `ai-engine/prompts/templates/`, rendered
by `TemplateManager`. **Templates are not auto-discovered**: the
name → file mapping is hardcoded in `template_manager.py`, so a new
`.jinja` file must be registered there or you get `Template not found`.

### 1. Parse

| Input    | Engine route             | What happens                                                                                                                                                                  |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF      | `POST /process-resume` | `pdf.py` / `pymupdf_rag.py` convert pages to Markdown-like text. Result shape: `{ raw_text, pages, metadata, chunks }`.                                                 |
| `.tex` | `POST /process-resume` | `latex_parser.py` protects links, extracts editable sections only. Result shape: `{ format: "latex", raw_tex, sections, read_only_sections, link_placeholders, chunks }`. |
| JD       | same request             | JD as pasted text (`jd_text` form field) or as a file (`jd_file`). One of the two is required (400 otherwise).                                                            |

Uploads are written to `ai-engine/temp_uploads/` with a UUID prefix and
**deleted in a `finally` block even on failure**; the gateway likewise
deletes its multer temp files after forwarding.

### 2. Critic Agent — `run_critic_agent()` (`agents.py`)

- Persona: "Ruthless but Constructive Senior Technical Recruiter".
- Input: parsed resume JSON + JD text. Output: structured JSON critique
  (overall match score, missing keywords, weak verbs, irrelevant sections).
- Prompt: `prompts/templates/critic_agent.jinja`, plus the immutable-content
  constraint from `prompt.py`.

### 3. GitHub Matching Agent — `run_github_matching_agent()` (`agents.py`)

- Persona: "Principal Engineering Manager".
- Input: repository list (name, README, commits, etc.) + JD text.
- Output: the selected projects plus match reasoning.
- Prompt: `prompts/templates/github_matching_agent.jinja`.
- On the LaTeX compile path, `github_fetch.py` separately enriches repos
  (metadata, README snippet, commits) and generates project bullets that
  are appended to the PROJECTS section.

### 4. Writer Agent + QA loop — `generate_and_qa_resume()` (`agents.py`)

This is the core of Fuse:

1. **Writer** generates a rewritten resume as JSON
   (`generate_json_completion` in `llm_utils.py`, with JSON retry and
   validation logic). Prompt: `writer_agent.jinja`.
2. **Evaluator** (`resume_evaluator.py`) LLM-scores the *generated* resume
   against the JD, 0–100, clamped to that range:

   - Keyword Coverage — **40 points**
   - Action Verb Strength — **20 points**
   - Quantifiable Impact — **20 points**
   - JD Alignment & Relevance — **20 points**

   plus `feedback` and `missing_keywords`.
3. **QA loop:** if the score is below `QA_SCORE_THRESHOLD = 75`, the Writer
   re-runs with the evaluator's feedback. Up to `QA_MAX_RETRIES = 2`
   retries — **3 attempts total** — and the **best-scoring attempt is
   kept**, not necessarily the last one.
4. **`finalize()` hard gate** (every return path): metric-integrity
   enforcement and skill grounding (next section) run in code, and the
   internal `_skills_grounding` audit key is stripped before the response
   is serialized (`main.py` pops it).

The response of `POST /api/rewrite-resume` is:

```json
{
  "status": "success",
  "rewritten_resume": { "...": "JSON Resume-style object" },
  "qa_score": 82,
  "qa_feedback": "…",
  "qa_attempts": 2,
  "passed_qa": true,
  "metric_fixes": 3
}
```

### 5. LaTeX rewrite — `rewrite_latex_sections()` (`agents.py`)

- Rewrites **only** EXPERIENCE and PROJECTS section bodies, using
  `latex_writer_agent.jinja`.
- Only the extracted section text is sent to the LLM — never the preamble
  or any read-only section — so custom formatting and personal data are
  preserved.

---

## Anti-hallucination guardrails

Fuse's selling point is restraint, and it is enforced in **two layers**:

### Layer 1 — Prompt constraints (`ai-engine/prompt.py`)

- `IMMUTABLE_CONTENT_CONSTRAINT` — do not change protected personal data.
- `SKILL_GROUNDING_CONSTRAINT` — a skill may only appear if it is
  demonstrated in a work/project bullet.
- `METRIC_FABRICATION_CONSTRAINT` — do not invent numbers.

### Layer 2 — Deterministic code (`ai-engine/validator.py`)

These run even if the model ignores the prompts.

**Skill grounding — `ground_resume_skills()`**

A proposed skill survives only if it appears (or fuzzy/alias-matches) in
the generated work/project bullet text. A skill listed in the Skills
section but never demonstrated in a bullet is **deleted**. The Writer is
told this explicitly (`GROUNDING_VALIDATOR_RULE` in `agents.py`): to add
a skill, it must organically rewrite a bullet to demonstrate it — appending
it to the Skills list alone will fail evaluation and re-trigger the QA
loop.

**Metric integrity — `verify_metrics_integrity()` /
`enforce_metrics_integrity()`**

- **The original resume is the only permitted source of numbers.** Any
  metric clause in the generated resume whose numbers do not appear in the
  original is stripped (`strip_hallucinated_metrics`); the count is
  reported as `metric_fixes`.
- Comparison is **LaTeX-aware** and normalizes both sides before comparing
  pure numeric values: it strips LaTeX control words (`\sim`, `\textbf`)
  and `%` / `x` / ordinal / `K` / `M` / `L` / comma qualifiers, so a
  source `.tex` value of `$\sim$60\%` matches the LLM's clean `60%`.
- **Safe numbers are never flagged**: years in 1900–2099 and phone-like
  digit runs are exempt.

**Practical consequence:** if the rewritten resume comes back with fewer
skills or plainer numbers than you hoped, that is usually the validator
doing its job — check the original resume for the missing evidence first,
then add the evidence to a bullet and re-run.

---

## LaTeX path in detail

`ai-engine/latex_parser.py` works in five steps, and the order matters:

1. **Protect** — raw `\href` commands are replaced with `[[LINK_N]]`
   tokens and recorded in a `link_map`, so the LLM never sees or corrupts
   a URL.
2. **Extract (editable only)** — section bodies that may be rewritten
   (EXPERIENCE, PROJECTS, …) are extracted.
3. **Extract (protected)** — contact / education / awards sections are
   extracted separately as read-only blocks. Which titles count as
   protected is decided by `PROTECTED_TITLE_KEYWORDS` in `latex_parser.py`.
4. **LLM** — only the editable bodies are sent to the Writer.
5. **Inject → restore → compile** — rewritten bodies are injected back
   into the template, links are restored from `link_map`, and `pdflatex`
   compiles the result.

Compilation (`compiler.py`) runs:

```text
pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape
```

with a **300 s timeout**. `-no-shell-escape` alone does not sandbox TeX
file operations, so a denylist regex additionally blocks `\write18`,
`\shellescape`, and other file-access macros; a denylist hit or a
`pdflatex` rejection raises `LatexCompileError` (→ HTTP 422), while a
missing binary raises `RuntimeError` (→ HTTP 500).

---

## GitHub integration

### OAuth (gateway)

```
GET  /api/auth/github           → redirect to github.com/login/oauth/authorize
                                  (scope: user:email repo)
GET  /api/auth/github/callback  → exchange code for token, fetch /user and
                                  /user/emails, upsert into users table
                                  (keyed on github_id), redirect to
                                  FRONTEND_URL/settings?github_connected=true
```

Tokens are stored in the `users.access_token` column in Neon. Treat that
table as sensitive — see [Security notes](#security-and-privacy-notes).

### Sync (gateway → GitHub REST)

`POST /api/github/sync` (`{ userId }`) uses the stored token to fetch, via
`src/services/githubService.js`:

- The user's own repos, sorted by updated, **15 per page, forks skipped**
- Each repo's README (base64-decoded; a 404 is tolerated silently)
- Each repo's **5 most recent commit messages** (a 409 is tolerated)

and upserts the result into `github_profiles.repo_data` (keyed on
`user_id`). `GET /api/github/preview` serves a small test form for this
sync in the browser.

### Matching + enrichment (engine)

- `run_github_matching_agent()` selects the JD-relevant repos.
- `github_fetch.py` enriches a repo (owner/name parsing, README snippet
  up to 300 chars, metadata) and generates LaTeX project bullets
  (`build_project_heading` → `\resumeProjectHeading` /
  `\resumeItemListStart` / `\resumeItem` / `\resumeItemListEnd` blocks).

---

## API reference

### API Gateway — `http://localhost:5000`

Base mounting is in `src/index.js`; `GET /` returns `API Gateway is running`. CORS allows `http://localhost:5173` with credentials.

| Method & path                             | Body / params                                                                                                                                                                                   | What it does                                                                                                                                                                                                                          | Notes                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/upload`                      | multipart: `resume` (required), `jd_file` (optional), `jd_text` (optional)                                                                                                                | Forwards the resume to the engine, then requests a critique, returns `{ parsed_resume, critique, jd_text, format, tex_template }`                                                                                                   | Resume: `.pdf` / `.tex` only, by extension (browsers label `.tex` inconsistently, so MIME is not trusted). JD file: `.pdf` / `.txt`. **10 MB per-file limit.** A JD file or JD text is required. Temp files are deleted afterwards. |
| `GET /api/upload-test`                  | —                                                                                                                                                                                              | Serves a standalone HTML upload form (same fields) for testing without the React app.                                                                                                                                                 |                                                                                                                                                                                                                                                     |
| `POST /api/rewrite`                     | JSON: `parsedResume` / `parsed_resume` / `resume`, `jdText` / `jd_text` / `jd`, `criticFeedback` (optional), `selected_github_projects` / `selectedGithubProjects` (optional) | Proxies to the engine's `/api/rewrite-resume` and returns its result unchanged.                                                                                                                                                     | **600 s** Express socket + axios timeouts — the QA loop can take minutes. Both snake_case and camelCase field names are accepted.                                                                                                            |
| `POST /api/compile`                     | JSON: `tex` (required), `sections` (optional map), `github_repos` (optional), `jd_text` (optional)                                                                                      | Proxies to the engine's `/api/compile-tex`. Returns the PDF bytes with `Content-Disposition: attachment; filename="optimized-resume.pdf"`.                                                                                        | **180 s** axios timeout. Validates the response starts with `%PDF-`; otherwise 502. Forwards the engine's status (e.g. 422 for rejected LaTeX).                                                                                             |
| `POST /api/export/pdf`                  | JSON resume object (must contain `basics`)                                                                                                                                                    | Renders `resumeTemplate.hbs` with Handlebars and Puppeteer, returns PDF bytes.                                                                                                                                                      | 400 if `basics` is missing.                                                                                                                                                                                                                       |
| `GET /api/auth/github`                  | —                                                                                                                                                                                              | Redirects to GitHub OAuth authorize.                                                                                                                                                                                                  |                                                                                                                                                                                                                                                     |
| `GET /api/auth/github/callback?code=…` | —                                                                                                                                                                                              | Token exchange + user upsert + redirect to Settings.                                                                                                                                                                                  |                                                                                                                                                                                                                                                     |
| `POST /api/github/sync`                 | JSON: `{ userId }`                                                                                                                                                                            | Fetches the user's GitHub data and upserts `github_profiles`.                                                                                                                                                                       | 400 if the user is missing or has no token/username.                                                                                                                                                                                                |
| `GET /api/github/preview`               | —                                                                                                                                                                                              | HTML test form for the sync endpoint.                                                                                                                                                                                                 |                                                                                                                                                                                                                                                     |
| `POST /api/history/save`                | JSON: `{ userId, jdText, generatedJson, originalFilePath? }`                                                                                                                                  | Inserts a JD row and a resume row; returns `{ status, resumeId }`.                                                                                                                                                                  | All three of `userId`, `jdText`, `generatedJson` are required.                                                                                                                                                                                |
| `GET /api/history/:userId`              | —                                                                                                                                                                                              | Returns the user's resumes newest-first, each paired (by index) with a JD snippet (first 120 chars). `targetRole` comes from `generatedJson.basics.role`; `companyName` is currently a fixed placeholder, `"Target Company"`. |                                                                                                                                                                                                                                                     |
| `GET /api/history/resume/:id`           | —                                                                                                                                                                                              | Returns one saved resume's `generatedJson`. 404 if not found.                                                                                                                                                                       |                                                                                                                                                                                                                                                     |

### AI Engine — `http://localhost:8000`

FastAPI docs at `/docs`. CORS allows `http://localhost:5000` and
`http://localhost:5173`.

| Method & path                | Body                                                                                              | Returns                                                                                                                                     | Errors                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /process-resume`     | multipart: `resume` (file, required), `jd_file` (optional), `jd_text` (optional form field) | `{ status, message, resume_filename, jd_filename, has_jd_text, extracted_data }`                                                          | 400 if neither JD input is given, or if extraction fails. Uploaded files are deleted afterwards.                                                                              |
| `POST /api/criticize`      | JSON: `{ resume_data, jd_text }`                                                                | `{ status, critique }`                                                                                                                    | 400 / 500 from the Critic agent.                                                                                                                                              |
| `POST /api/match-github`   | JSON: `{ github_repos, jd_text }`                                                               | `{ status, matches }`                                                                                                                     | 400 / 500 from the matching agent.                                                                                                                                            |
| `POST /api/rewrite-resume` | JSON: `{ parsed_resume, jd_text, selected_github_projects }`                                    | `{ status, rewritten_resume, qa_score, qa_feedback, qa_attempts, passed_qa, metric_fixes }` (internal `_skills_grounding` key stripped) | 400 / 500 from the Writer/QA pipeline.                                                                                                                                        |
| `POST /api/parse-tex`      | JSON: `{ tex_string }` (max 10,000,000 chars)                                                   | `{ status, sections, read_only_sections, link_placeholders }`                                                                             | 400 on parse failure.                                                                                                                                                         |
| `POST /api/rewrite-latex`  | JSON: `{ tex, jd_text, github_repos? }` (tex max 10,000,000 chars)                              | `{ status, sections, read_only_sections, link_placeholders }` — only EXPERIENCE / PROJECTS bodies are new.                               | 400 / 500.                                                                                                                                                                    |
| `POST /api/compile-tex`    | JSON: `{ tex, sections?, github_repos?, jd_text? }` (tex / sections max 10,000,000 chars)       | Raw PDF bytes (`application/pdf`).                                                                                                        | **422** if `pdflatex` rejects the document, **413** if sections are too large, **400** on bad input, **500** if `pdflatex` is missing/unrunnable. |

---

## Data model

Drizzle ORM, Neon PostgreSQL (`api-gateway/src/db/schema.js`). No
migrations are checked in — schema is applied with Drizzle Kit
(`npm run generate` / `npm run push` in `api-gateway/`).

| Table                | Columns                                                                                                                                | Purpose                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `users`            | `id` (serial PK), `email` (not null), `github_id` (unique), `github_username`, `access_token`, `created_at`                | GitHub OAuth users.                                             |
| `resumes`          | `id` (serial PK), `user_id` (FK → users, not null), `original_file_path` (not null), `generated_json` (jsonb), `created_at` | Saved rewritten resumes.                                        |
| `job_descriptions` | `id` (serial PK), `user_id` (FK → users, not null), `jd_text` (not null), `created_at`                                        | Saved JDs, one row per save (no link to a specific resume row). |
| `github_profiles`  | `id` (serial PK), `user_id` (FK → users, not null, unique), `repo_data` (jsonb), `created_at`                                 | Latest synced GitHub portfolio per user.                        |

---

## Frontend routes

All routes render inside `Layout`. `/` and any unknown path redirect to
`/upload`.

| Route              | Page                 | Status                                                                                                                                                                                                          |
| ------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/upload`        | `Upload.jsx`       | **Core flow.** Resume + JD upload, navigates to `/editor` with the upload payload in router state.                                                                                                      |
| `/editor`        | `Editor.jsx`       | **Core flow.** Critique view → "Approve & Generate" (rewrite, 10 min abort timer) → form view (edit basics / work / projects / skills) → "Finalize & Export" (`optimized-resume.pdf`).               |
| `/resume-editor` | `ResumeEditor.jsx` | Standalone manual editor. Starts from built-in sample data (a "Harshvardhan Patil / Full-Stack Developer" example with KIXX and SentinelAI projects) — it is a form demo, not a loaded saved resume.           |
| `/dashboard`     | `Dashboard.jsx`    | Overview shell only: the three stat cards are hardcoded (`0`, `0`, `—`). Not wired to the history API.                                                                                                   |
| `/history`       | `History.jsx`      | Archive UI only: currently renders hardcoded mock entries and notes in comments that the real fetch (`/api/history/:userId`) and real export are not wired yet. The backend history endpoints above do exist. |
| `/settings`      | `Settings.jsx`     | GitHub connect page: "Connect GitHub Profile" → `http://localhost:5000/api/auth/github`; reads `?github_connected=true` after the callback.                                                                |

> Editor state lives in React Router location state. **Refreshing `/editor`
> loses the upload payload** — re-upload to continue. This is expected
> with the current implementation, not a data-loss bug in the backend.

---

## Design system

See `design.md` for the full mandate. In short, Fuse uses **Warm
Editorial Minimalism**: a warm paper canvas, editorial typography, and
structural borders instead of shadows.

- **Canvas:** `#F7F5F0` (warm beige), panels `#F2F0EA`, cards white
- **Accent (sparingly, 1–2× per screen):** `#BFDBFE` / `#93C5FD` fills and
  borders, `#1E40AF` text on accent, `#60A5FA` focus rings only
- **Text:** `#1C1917` headings, `#78716C` body, `#A8A29E` hints
- **Type:** Inter / DM Sans for UI, Playfair Display / DM Serif Display
  for a single accent per screen, JetBrains Mono / Fira Code for code
- **Hard rules:** no dark mode, no neon/saturated colors, no purple /
  magenta "AI" palettes or glowing gradients, no glassmorphism, no deep
  shadows, no pill buttons on primary actions, no emoji-heavy UI
- **Copy voice:** confident, editorial, noun-led, calm — "Align your
  experience.", "Upload", "Generate", "Connect". No "magical" language.

---

## Testing

```bash
# AI engine — from the ai-engine/ directory (tests import modules directly)
cd ai-engine
venv/Scripts/python -m pytest            # Windows
# or: python -m pytest                    # macOS / Linux
# Single test:
venv/Scripts/python -m pytest tests/test_metrics_integrity.py
```

⚠️ Engine tests live in `tests/` but are **gitignored** (`test_*.py`
pattern), so a fresh clone has no tests to run, and the tests that exist
locally require a **live NIM key**.

```bash
# API gateway — Jest via node --experimental-vm-modules (package is ESM)
cd api-gateway
npm test
# Requires DATABASE_URL in .env — the DB module throws without it.

# Frontend — plain Vite build (no tsc)
cd frontend
npm run build
```

---

## Troubleshooting

| Symptom                                              | Likely cause                                                          | Fix                                                                                                                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend shows network errors on every action        | A service is not running, or on a different port                      | Start all three services (engine `:8000`, gateway `:5000`, frontend `:5173`). URLs are hardcoded — do not change a port without updating the frontend fetches, the gateway proxies, and the engine CORS list.        |
| Engine CORS errors in the browser                    | Origin not allow-listed                                               | The engine only allows `http://localhost:5000` and `http://localhost:5173`. Serve the frontend from `:5173` (Vite default), not another port.                                                                         |
| Every LLM call fails / 404 from NIM                  | Wrong model ID, or missing key                                        | Check `NVIDIA_NIM_API_KEY` in `ai-engine/.env` and that `MODEL_NAME` in `config.py` is a real NIM model ID. The old `THUDM/glm-4-9b-chat` value 404s on every request.                                            |
| Rewrite "took too long" / aborts                     | Model is slow, or a timeout was shrunk                                | The 550B model + up to 3 QA attempts can take minutes. Gateway rewrite timeout is 600 s and the Editor abort is 600 s — do not shrink them. Check the gateway logs: they distinguish timeout/reset from an engine 422/500. |
| `Template not found`                               | New `.jinja` not registered                                         | Add the name → file mapping in `prompts/template_manager.py`. Templates are not auto-discovered.                                                                                                                         |
| LaTeX compile 422                                    | Rejected document                                                     | Read the error detail — it includes the tail of the LaTeX log. Common causes: a macro on the denylist, or a missing package.                                                                                               |
| LaTeX compile hangs, then 500/timeout                | MiKTeX auto-install prompting                                         | Set MiKTeX package auto-install to non-interactive, or pre-install the packages your template needs. The compiler timeout is 300 s.                                                                                         |
| `pdflatex not found` (500)                         | No TeX distribution on PATH                                           | Install one, or set the `PDFLATEX` env var to the full binary path.                                                                                                                                                       |
| Gateway crashes on startup / DB routes fail          | `DATABASE_URL` missing                                              | Add it to `api-gateway/.env`. The upload → rewrite → export proxy flow does not need it, but any DB route does.                                                                                                         |
| Editor says "Missing resume or job description data" | JD was supplied as a file only (see below), or the page was refreshed | Re-upload, pasting the JD text. Refreshing `/editor` loses router state.                                                                                                                                                  |
| QA score stuck below 75 after 3 attempts             | Validator keeps stripping the model's additions                       | That is the guardrail working: add the missing skill/metric evidence to a bullet in your original resume (or in the form view) and re-run, rather than asking the model to invent it.                                       |
| History / Dashboard show 0s or sample data           | UI not wired yet                                                      | Expected — see [Frontend routes](#frontend-routes). The backend history endpoints exist; the pages do not call them yet.                                                                                                    |

---

## Security and privacy notes

- **Keys live in gitignored `.env` files only.** `NVIDIA_NIM_API_KEY`,
  `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `DATABASE_URL` must
  never be committed. There are no `.env.example` files to copy — create
  the files by hand.
- **GitHub access tokens are stored in the database** (`users.access_token`)
  so the gateway can sync repos later. Protect the Neon database
  accordingly, and scope the OAuth app to what you need.
- **Uploaded files are temporary.** The gateway deletes its multer files
  after forwarding, and the engine deletes its `temp_uploads/` files in a
  `finally` block — even on failure.
- **LaTeX compilation is sandboxed as far as `pdflatex` allows:**
  `-no-shell-escape` plus a denylist for TeX file-access macros. Do not
  compile untrusted `.tex` from strangers without reviewing it — TeX is
  a programming language, and no denylist is a perfect sandbox.
- **Resume + JD content is sent to Nvidia NIM** for every agent call.
  Do not upload resumes containing information you would not share with
  a third-party API.
- **No authentication on the engine or on most gateway routes.** Anyone
  who can reach `localhost:8000` / `:5000` can call them. This stack is
  for local development — do not expose these ports publicly without
  adding auth in front of them.

---

## Known limitations

Read these before demoing or extending the project — they are properties
of the code as it stands, not roadmap promises:

1. **JD supplied as a file is not extracted.** The engine's
   `/process-resume` accepts `jd_file` but never parses its text, and the
   gateway's upload route then calls the Critic with the placeholder
   string `"Job description provided via file"` and returns `jd_text: null`
   to the frontend. The Editor therefore refuses to rewrite ("Missing
   resume or job description data") for file-only JDs. **Workaround:
   paste the JD text** in the upload form.
2. **Hardcoded localhost URLs and ports.** Frontend → gateway
   (`:5000`), gateway → engine (`:8000`), engine CORS (`:5000`, `:5173`),
   and the Settings GitHub-connect link are all hardcoded. There is no
   production / deployed configuration.
3. **QA threshold drift in older docs.** `CLAUDE.md` and
   `userflowdiagram.md` say the QA pass mark is 85; the code in
   `agents.py` says `QA_SCORE_THRESHOLD = 75`. This README follows the
   code. The evaluator's example score in its prompt template (85) is
   just an example output shape, not the threshold.
4. **Timeouts differ by layer.** Gateway rewrite: 600 s. Editor abort:
   600 s. Gateway compile: 180 s. Engine `pdflatex`: 300 s. Older docs
   saying 300 s / 5 min for the rewrite are out of date.
5. **Dashboard and History pages are not wired to the backend.**
   Dashboard cards are hardcoded; History renders mock entries. The
   backend history endpoints exist and work, but the UI does not call
   them yet.
6. **ResumeEditor starts from sample data**, not from a saved resume.
7. **History pairing is positional.** `GET /api/history/:userId` pairs
   the *n*-th resume with the *n*-th JD by list order, and
   `companyName` is always the placeholder `"Target Company"`.
8. **Model and endpoint are hardcoded** in `config.py` — changing models
   requires a code edit, not an env var.
9. **No migrations checked in.** Drizzle schema changes are applied with
   `drizzle-kit push`, not versioned migration files.
10. **Legacy modules remain in `ai-engine/`.** The CLI scoring code,
    Ollama/Gemini providers, and the stale `ai-engine/README.md` are
    still in the tree. Do not build new features on them without checking
    whether the agent pipeline already supersedes them.

---

## Contributing

Contributor guidance for the legacy scoring code lives in
`ai-engine/CONTRIBUTING.md`. For the Fuse service itself, the working
conventions (from `CLAUDE.md`) are:

- Keep prompts declarative and provider-agnostic where possible; register
  any new Jinja template in `template_manager.py`.
- Validate changes with real resumes under the live NIM pipeline — the
  QA loop and validators only show their behaviour on real inputs.
- Do not shrink the long timeouts (rewrite 600 s, compile 300 s) without
  understanding why they exist: several slow NIM round-trips on a 550B
  model.
- Respect `design.md`: warm light canvas, no dark mode, no neon, no
  purple/magenta gradients, no glassmorphism, no pill primary buttons.
- Keep the LaTeX quarantine intact: immutable sections and `\href`
  links must never reach the LLM unprotected.
- Never commit `.env` files, API keys, or OAuth secrets.

---

## License and attribution

- `ai-engine/LICENSE` is MIT (upstream HackerRank `hiring-agent` license
  text, retained with the forked code). Check the license files in the
  repo root / service directories before reusing code commercially.
- The AI engine began as a fork of HackerRank's open-source
  `hiring-agent` resume-scoring tool, rewritten here as a FastAPI service
  with a multi-agent rewrite pipeline, GitHub enrichment, LaTeX handling,
  and a full web UI. The upstream project is credited in
  `ai-engine/README.md` (stale as a usage guide, but accurate as
  attribution for the forked modules).
