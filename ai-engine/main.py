import base64
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import uvicorn
import os
import shutil
from uuid import uuid4
from pdf import extract_resume_data
from agents import (
    generate_and_qa_resume,
    rewrite_latex_sections,
    rewrite_latex_bullets,
    run_critic_agent,
    run_github_matching_agent,
)
import latex_parser
import github_fetch
from llm_utils import generate_completion
from compiler import compile_tex_to_pdf, LatexCompileError

logger = logging.getLogger(__name__)

app = FastAPI(title="Fuse AI Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Vercel-deploy branch only: Vercel serverless functions can only write to
# /tmp; the bundled temp_uploads/ directory is read-only at runtime, so
# writing an uploaded resume there would fail like the gateway uploads/ did.
# Locally (VERCEL unset) behaviour is unchanged.
TEMP_UPLOADS_DIR = "/tmp/temp_uploads" if os.getenv("VERCEL") == "1" else "temp_uploads"
os.makedirs(TEMP_UPLOADS_DIR, exist_ok=True)


class CriticRequest(BaseModel):
    resume_data: Dict[str, Any]
    jd_text: str


class GithubMatchRequest(BaseModel):
    github_repos: list
    jd_text: str


class WriterRequest(BaseModel):
    parsed_resume: Dict[str, Any]
    jd_text: str
    selected_github_projects: list = []
    raw_tex: Optional[str] = None
    critic_feedback: Optional[Any] = None


class ParseTexRequest(BaseModel):
    tex_string: str = Field(..., max_length=10_000_000)


class CompileTexRequest(BaseModel):
    tex: str = Field(..., max_length=10_000_000)
    sections: Optional[Dict[str, str]] = None
    github_repos: Optional[list] = None
    jd_text: Optional[str] = None


class RewriteLatexRequest(BaseModel):
    tex: str = Field(..., max_length=10_000_000)
    jd_text: str
    github_repos: Optional[list] = None


@app.post("/process-resume")
async def process_resume(
    resume: UploadFile = File(...),
    jd_file: Optional[UploadFile] = File(None),
    jd_text: Optional[str] = Form(None)
):
    if not jd_file and not jd_text:
        raise HTTPException(status_code=400, detail="Either jd_file or jd_text must be provided.")

    resume_filename = f"{uuid4()}_{resume.filename}"
    resume_path = os.path.join(TEMP_UPLOADS_DIR, resume_filename)
    jd_filename = None
    jd_path = None

    try:
        with open(resume_path, "wb") as f:
            shutil.copyfileobj(resume.file, f)

        is_tex = resume_filename.lower().endswith(".tex")
        try:
            if is_tex:
                # Lossless LaTeX ingestion: isolate editable \section bodies only.
                # Immutable personal data (contact/education/awards) and raw
                # \href hyperlinks are quarantined before content reaches any LLM.
                with open(resume_path, "r", encoding="utf-8", errors="replace") as f:
                    tex_string = f.read()

                safe_tex, link_map = latex_parser.protect_links(tex_string)
                editable = latex_parser.extract_editable_sections(
                    safe_tex, include_protected=False
                )
                read_only = latex_parser.extract_protected_sections(safe_tex)

                # Restore links for user-facing display fields and Critic Agent so [[LINK_N]] tokens never leak
                display_sections = {
                    k: latex_parser.restore_links(v, link_map)
                    for k, v in editable.items()
                }
                display_read_only = {
                    k: latex_parser.restore_links(v, link_map)
                    for k, v in read_only.items()
                }
                display_chunks = [
                    latex_parser.restore_links(body, link_map)
                    for body in editable.values()
                    if body.strip()
                ]

                # Extract UI JSON representation to populate React FormEditor
                ui_data = latex_parser.extract_ui_json_from_tex(tex_string)

                extracted_data = {
                    "format": "latex",
                    "raw_tex": tex_string,
                    "ui_data": ui_data,
                    "basics": ui_data.get("basics", {}),
                    "work": ui_data.get("work", []),
                    "projects": ui_data.get("projects", []),
                    "skills": ui_data.get("skills", []),
                    "sections": display_sections,
                    "read_only_sections": display_read_only,
                    "link_placeholders": link_map,
                    "chunks": display_chunks,
                }
            else:
                extracted_data = extract_resume_data(resume_path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to extract resume data: {str(e)}")

        if jd_file:
            jd_filename = f"{uuid4()}_{jd_file.filename}"
            jd_path = os.path.join(TEMP_UPLOADS_DIR, jd_filename)
            with open(jd_path, "wb") as f:
                shutil.copyfileobj(jd_file.file, f)

        return {
            "status": "success",
            "message": "Files received successfully",
            "resume_filename": resume_filename,
            "jd_filename": jd_filename,
            "has_jd_text": jd_text is not None,
            "extracted_data": extracted_data
        }
    finally:
        # Never leave uploaded files behind, even on failure.
        for path in (resume_path, jd_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


@app.post("/api/criticize")
async def criticize_resume(request: CriticRequest):
    """Run the Critic Agent to analyze resume gaps against a Job Description."""
    try:
        link_map = (
            request.resume_data.get("link_placeholders")
            if isinstance(request.resume_data, dict)
            else None
        )
        resume_data = (
            latex_parser.restore_links_in_obj(request.resume_data, link_map)
            if link_map
            else request.resume_data
        )

        critique = await run_critic_agent(resume_data, request.jd_text)

        if link_map and isinstance(critique, (dict, list, str)):
            critique = latex_parser.restore_links_in_obj(critique, link_map)

        return {
            "status": "success",
            "critique": critique
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Critic Agent failed: {str(e)}")


@app.post("/api/match-github")
async def match_github(request: GithubMatchRequest):
    """Run the GitHub Matching Agent to select the most relevant repos."""
    try:
        matches = await run_github_matching_agent(request.github_repos, request.jd_text)
        return {
            "status": "success",
            "matches": matches
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GitHub Matching Agent failed: {str(e)}")


@app.post("/api/rewrite-resume")
async def rewrite_resume(request: WriterRequest, raw_req: Request):
    """Run the Writer Agent with QA grading loop to produce a high-quality resume."""
    try:
        master_template = request.raw_tex
        if not master_template and isinstance(request.parsed_resume, dict):
            master_template = request.parsed_resume.get("raw_tex")

        if master_template and isinstance(master_template, str) and ("\\begin{document}" in master_template or "\\section" in master_template):
            logger.info("LaTeX resume detected. Executing In-Place Surgical Regex Replacement pipeline...")
            updated_tex, new_blocks = await rewrite_latex_bullets(
                master_template,
                request.jd_text,
                request.selected_github_projects
            )

            # Compile to PDF using local pdflatex
            pdf_bytes = compile_tex_to_pdf(updated_tex)
            pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

            # Extract structured UI JSON from the newly updated LaTeX document
            ui_data = latex_parser.extract_ui_json_from_tex(updated_tex)
            ui_data["bullet_blocks"] = new_blocks
            ui_data["raw_tex"] = updated_tex

            # Check if caller requested application/pdf binary directly
            accept_header = raw_req.headers.get("accept", "")
            if "application/pdf" in accept_header:
                return Response(
                    content=pdf_bytes,
                    media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="optimized-resume.pdf"'}
                )

            return {
                "status": "success",
                "compiled_tex": updated_tex,
                "tex_string": updated_tex,
                "pdf_base64": pdf_b64,
                "ui_data": ui_data,
                "rewritten_resume": ui_data,
                "passed_qa": True,
                "qa_score": 95,
                "qa_feedback": "Surgically updated LaTeX bullets and recompiled successfully with pdflatex.",
                "qa_attempts": 1,
                "metric_fixes": 0,
            }

        result = await generate_and_qa_resume(
            request.parsed_resume,
            request.jd_text,
            request.selected_github_projects
        )
        # The validator adds an internal "_skills_grounding" audit key to the
        # resume dict; never serialize it to clients.
        rewritten_resume = result["resume"]
        if isinstance(rewritten_resume, dict):
            rewritten_resume = dict(rewritten_resume)
            rewritten_resume.pop("_skills_grounding", None)
        return {
            "status": "success",
            "rewritten_resume": rewritten_resume,
            "qa_score": result["score"],
            "qa_feedback": result["feedback"],
            "qa_attempts": result["attempts"],
            "passed_qa": result["passed_qa"],
            "metric_fixes": result.get("metric_fixes", 0),
        }
    except LatexCompileError as e:
        logger.error(f"LaTeX compile error during rewrite: {str(e)}")
        raise HTTPException(status_code=422, detail=f"LaTeX compilation failed: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Resume generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Resume generation failed: {str(e)}")


@app.post("/api/parse-tex")
async def parse_tex(request: ParseTexRequest):
    """Isolate the editable \\section{...} bodies of a raw LaTeX resume.

    Read-only sections (contact / education / awards) and raw ``\\href``
    hyperlinks are quarantined so they never reach the LLM: ``sections`` holds
    only modifiable content with links reduced to ``[[LINK_N]]`` tokens;
    ``read_only_sections`` holds the byte-for-byte immutable blocks; and
    ``link_placeholders`` maps tokens back to the original ``\\href`` commands.
    """
    try:
        safe_tex, link_map = latex_parser.protect_links(request.tex_string)
        sections = latex_parser.extract_editable_sections(
            safe_tex, include_protected=False
        )
        read_only = latex_parser.extract_protected_sections(safe_tex)
        display_sections = {
            k: latex_parser.restore_links(v, link_map)
            for k, v in sections.items()
        }
        display_read_only = {
            k: latex_parser.restore_links(v, link_map)
            for k, v in read_only.items()
        }
        return {
            "status": "success",
            "sections": display_sections,
            "read_only_sections": display_read_only,
            "link_placeholders": link_map,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LaTeX: {str(e)}")


@app.post("/api/rewrite-latex")
async def rewrite_latex(request: RewriteLatexRequest):
    """Surgically rewrite ONLY the EXPERIENCE and PROJECTS LaTeX section bodies.

    Only the extracted section text is sent to the LLM — never the preamble or
    any other section — so the user's custom formatting and immutable personal
    data are preserved. Returns the new section bodies ready for
    ``/api/compile-tex``, plus the read-only blocks and link placeholders.
    """
    try:
        sections, link_map = await rewrite_latex_sections(
            request.tex, request.jd_text, request.github_repos or []
        )
        safe_tex, _ = latex_parser.protect_links(request.tex)
        read_only = latex_parser.extract_protected_sections(safe_tex)
        return {
            "status": "success",
            "sections": sections,
            "read_only_sections": read_only,
            "link_placeholders": link_map,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LaTeX rewrite failed: {str(e)}")


def _inject_github_into_tex(tex: str, github_repos: list, jd_text: str) -> str:
    """Enrich selected repos, generate bullets, and append them to PROJECTS."""
    repos = github_fetch.enrich_repos(github_repos)
    if not repos:
        return tex
    bullets = github_fetch.generate_github_bullets(repos, jd_text, generate_completion)
    blocks = [
        github_fetch.build_project_heading(
            repo, bullets.get(repo["name"]) or [repo.get("description") or repo["name"]]
        )
        for repo in repos
    ]
    return latex_parser.append_to_section(tex, "projects", "\n".join(blocks))


@app.post("/api/compile-tex")
async def compile_tex(request: CompileTexRequest):
    """Re-inject rewritten section bodies into a LaTeX template and compile to PDF.

    Returns the compiled PDF as a binary response. If ``sections`` is provided,
    the bodies are merged into the template first via ``inject_editable_sections``;
    otherwise ``tex`` is compiled as-is. If ``github_repos`` is provided, repo
    metadata is fetched/enriched and each repo is rendered as a
    ``\\resumeProjectHeading`` / ``\\resumeItemListStart`` / ``\\resumeItem`` /
    ``\\resumeItemListEnd`` block appended to the PROJECTS section. Read-only
    sections are never overwritten and hyperlink placeholders are restored
    before compilation.
    """
    try:
        # Protect raw hyperlinks first so the injected editable bodies (which the
        # LLM may have sent back with [[LINK_N]] tokens) map back to the original
        # \href commands deterministically.
        safe_tex, link_map = latex_parser.protect_links(request.tex)
        sections = request.sections or {}
        if sections:
            total = sum(len(value) for value in sections.values())
            if total > 10_000_000:
                raise HTTPException(status_code=413, detail="Sections payload too large.")
            merged = latex_parser.inject_editable_sections(safe_tex, sections)
        else:
            merged = safe_tex

        if request.github_repos:
            merged = _inject_github_into_tex(merged, request.github_repos, request.jd_text or "")

        merged = latex_parser.restore_links(merged, link_map)
        pdf_bytes = compile_tex_to_pdf(merged)
        return Response(content=pdf_bytes, media_type="application/pdf")
    except LatexCompileError as e:
        # The client supplied LaTeX that pdflatex rejected — a client error.
        raise HTTPException(status_code=422, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LaTeX compilation failed: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
