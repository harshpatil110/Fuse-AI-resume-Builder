from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uvicorn
import os
import shutil
from uuid import uuid4
from pdf import extract_resume_data
from agents import run_critic_agent

app = FastAPI(title="Fuse AI Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_UPLOADS_DIR = "temp_uploads"
os.makedirs(TEMP_UPLOADS_DIR, exist_ok=True)


class CriticRequest(BaseModel):
    resume_data: Dict[str, Any]
    jd_text: str


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
    
    with open(resume_path, "wb") as f:
        shutil.copyfileobj(resume.file, f)

    try:
        extracted_data = extract_resume_data(resume_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract resume data: {str(e)}")

    jd_filename = None
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
