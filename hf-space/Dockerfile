# Hugging Face Spaces — Fuse AI Engine (vercel-deploy branch only)
#
# Why this file exists: Render blocked deployment with an Add Card prompt
# even on the Free plan, and the user declined to add a card. HF Spaces is
# free with no card, Docker SDK, 2 vCPU / 16 GB on the free tier, and
# sleeps only after ~48h idle (vs Render's ~15 min).
#
# How it is used: this file + README.md (with sdk: docker, app_port: 7860)
# are the ONLY files in the HF Space repo. At build time this Dockerfile
# clones the public GitHub repo (branch vercel-deploy) and copies
# ai-engine/ into /app, so the engine code is never duplicated in the
# Space repo and stays in sync with GitHub on rebuild.
#
# HF runs the container as UID 1000, so /app temp dirs are made world-
# writable. HF sets $PORT to app_port (7860); the CMD honours $PORT.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        curl \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-latex-extra \
        texlive-fonts-recommended \
        texlive-fonts-extra \
        texlive-pictures \
        lmodern && \
    rm -rf /var/lib/apt/lists/* && \
    which pdflatex && pdflatex --version | head -1

# Pull the engine code from the public GitHub repo (vercel-deploy branch).
# This is a public repo, so no token is needed for the clone.
RUN git clone --depth 1 --branch vercel-deploy \
        https://github.com/harshpatil110/Fuse-AI-resume-Builder.git /tmp/repo && \
    cp -r /tmp/repo/ai-engine/. /app/ && \
    rm -rf /tmp/repo && \
    mkdir -p /app/temp /app/temp_uploads && \
    chmod -R a+rwX /app

RUN pip install --upgrade pip && pip install -r requirements.txt

EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
