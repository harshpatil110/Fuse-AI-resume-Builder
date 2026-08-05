# Fuse — System-Level User Flow

> Swimlanes = the four layers a request passes through. Solid edges = the live end-to-end path. Dashed edges = optional/secondary flows. Decision diamonds = branching inside a service.

```mermaid
flowchart TB
    subgraph USER["👤 User"]
        direction TB
        U1["Open app<br/>/ redirects to /upload"]
        U2["Upload resume (.tex / .pdf)<br/>+ JD as file or pasted text"]
        U3["Review AI critique<br/>(split screen: resume + feedback)"]
        U4["Click 'Approve &amp; Generate Resume'"]
        U5["Edit rewritten resume<br/>(Basics · Work · Projects · Skills)"]
        U6["Click 'Finalize &amp; Export'"]
        U7["Save optimized-resume.pdf"]
    end

    subgraph FE["Frontend — React + Vite (:5173)"]
        direction TB
        F1["Upload.jsx — drag &amp; drop zones"]
        F2["Editor.jsx — Critique view<br/>(viewMode='critique')"]
        F3["fetch POST /api/rewrite<br/>AbortController 300 000 ms"]
        F4["Editor.jsx — Form view<br/>(viewMode='form')"]
        F5["fetch POST /api/export/pdf"]
        F6["Download blob"]
    end

    subgraph GW["API Gateway — Express (:5000)"]
        direction TB
        G1["POST /api/upload<br/>multer → temp files"]
        G2["POST /api/criticize<br/>(called by upload route)"]
        G3["POST /api/rewrite<br/>axios timeout: 300 000 ms"]
        G4["POST /api/export/pdf<br/>puppeteer → PDF"]
        G5["GET /api/auth / github / history<br/>Neon Postgres via Drizzle"]
    end

    subgraph AI["AI Engine — FastAPI (:8000)"]
        direction TB
        A1["POST /process-resume"]
        A2{"Resume format?"}
        A3["PDF → pdf.py / pymupdf_rag.py<br/>→ { raw_text, pages, chunks }"]
        A4[".tex → latex_parser.py<br/>protect links → extract editable sections<br/>→ { raw_tex, sections, read_only, link_map }"]
        A5["Critic Agent<br/>run_critic_agent()"]
        A6["Writer Agent<br/>generate_json_completion()"]
        A7["Evaluate vs JD<br/>evaluate_resume()"]
        A8{"Score ≥ 85?"}
        A9["Retry Writer with evaluator feedback<br/>(up to 3 attempts total)"]
        A10["finalize() hard gate<br/>skill grounding + metric integrity"]
    end

    %% ── Main flow ──
    U1 --> F1
    U2 --> F1
    F1 -->|"multipart resume + JD"| G1
    G1 -->|"stream file"| A1
    A1 --> A2
    A2 -->|".pdf"| A3
    A2 -->|".tex"| A4
    A3 --> A5
    A4 --> A5
    A5 -->|"critique"| G2
    G2 -->|"{ parsed_resume, critique, jd_text, tex_template }"| F2
    F2 --> U3
    U3 --> U4
    U4 --> F2
    F2 --> F3
    F3 -->|"parsed_resume + jd_text"| G3
    G3 -->|"proxy /api/rewrite-resume"| A6
    A6 --> A7
    A7 --> A8
    A8 -->|"no"| A9
    A9 --> A7
    A8 -->|"yes"| A10
    A10 -->|"rewritten_resume + qa_score + metric_fixes"| G3
    G3 --> F4
    F4 --> U5
    U5 --> U6
    U6 --> F5
    F5 -->|"rewritten JSON"| G4
    G4 -->|"PDF buffer"| F6
    F6 --> U7

    %% ── Optional / secondary flows ──
    S1["Optional: Connect GitHub<br/>Settings.jsx"]
    S2["Optional: View history<br/>History.jsx"]
    S1 -.->|"GitHub OAuth"| G5
    S2 -.->|"GET /api/history"| G5
```

## Notes

- **The 5-minute timeouts are load-bearing.** The QA loop makes up to 3 slow Nvidia NIM (550B model) round-trips (Writer → evaluate → possibly retry). `G3` uses axios `timeout: 300000` and `F3` aborts at 300 000 ms. A `fetch` abort surfaces as `AbortError` in the UI ("rewrite took too long") — this is the *old* symptom of the QA loop getting stuck, not a normal state.
- **Anti-hallucination happens twice**: at prompt time (`prompt.py` constraints) and deterministically at `A10` (`validator.py` — `ground_resume_skills` strips ungrounded skills, `enforce_metrics_integrity` strips fabricated metric clauses). `_skills_grounding` is popped before the resume is returned to the client.
- **Export is JSON→puppeteer today.** `F5` always calls `/api/export/pdf`. A LaTeX-recompile path already exists end-to-end (`POST /api/compile` → `/api/compile-tex` → pdflatex, with a `%PDF-` magic-byte check) but the Editor UI is **not yet wired to it** — `U6` does not use it yet.
- **Failure paths**: missing resume/JD → 400 and the upload page stays put; Critic/Writer/evaluator LLM failure → 500 from the engine, surfaced by the gateway; invalid LaTeX → 422 forwarded from `/api/compile-tex`; gateway network failure → "Failed to rewrite resume".
- **Persistence** (`G5`): Neon PostgreSQL via Drizzle (`api-gateway/src/db/`). Used for GitHub OAuth tokens and saved history. Dashboard/History pages currently render mock data — not yet wired to `/api/history`.
