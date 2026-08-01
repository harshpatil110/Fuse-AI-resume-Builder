from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import uvicorn
import os
import shutil
from uuid import uuid4
from pdf import extract_resume_data
from agents import run_critic_agent, run_github_matching_agent, generate_and_qa_resume
import latex_parser
from compiler import compile_tex_to_pdf, LatexCompileError

app = FastAPI(title="Fuse AI Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_UPLOADS_DIR = "temp_uploads"
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
    selected_github_projects: list


class ParseTexRequest(BaseModel):
    tex_string: str = Field(..., max_length=10_000_000)


class CompileTexRequest(BaseModel):
    tex: str = Field(..., max_length=10_000_000)
    sections: Optional[Dict[str, str]] = None


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

                extracted_data = {
                    "format": "latex",
                    "raw_tex": tex_string,
                    "sections": editable,
                    "read_only_sections": read_only,
                    "link_placeholders": link_map,
                    "chunks": [body for body in editable.values() if body.strip()],
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
        critique = await run_critic_agent(request.resume_data, request.jd_text)
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
async def rewrite_resume(request: WriterRequest):
    """Run the Writer Agent with QA grading loop to produce a high-quality resume."""
    try:
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
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
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
        return {
            "status": "success",
            "sections": sections,
            "read_only_sections": read_only,
            "link_placeholders": link_map,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LaTeX: {str(e)}")


@app.post("/api/compile-tex")
async def compile_tex(request: CompileTexRequest):
    """Re-inject rewritten section bodies into a LaTeX template and compile to PDF.

    Returns the compiled PDF as a binary response. If ``sections`` is provided,
    the bodies are merged into the template first via ``inject_editable_sections``;
    otherwise ``tex`` is compiled as-is. Read-only sections are never overwritten
    and hyperlink placeholders are restored before compilation.
    """
    try:
        # Protect raw hyperlinks first so the injected editable bodies (which the
        # LLM may have sent back with [[LINK_N]] tokens) map back to the original
        # \href commands deterministically.
        safe_tex, link_map = latex_parser.protect_links(request.tex)
        if request.sections:
            total = sum(len(value) for value in request.sections.values())
            if total > 10_000_000:
                raise HTTPException(status_code=413, detail="Sections payload too large.")
            merged = latex_parser.inject_editable_sections(safe_tex, request.sections)
        else:
            merged = safe_tex

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
