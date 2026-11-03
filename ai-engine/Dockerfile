# Fuse AI Engine — Render deployment (vercel-deploy branch only)
#
# Why this exists: Vercel serverless has no pdflatex, so a LaTeX resume
# exported there can never be the user's exact template PDF. Render runs a
# real container, so this image installs a full-enough TeX Live alongside
# the FastAPI engine. Main branch is untouched — this file lives only on
# vercel-deploy.
#
# TeX packages chosen for resume templates:
#   texlive-latex-base       — article class, core LaTeX
#   texlive-latex-recommended — geometry, hyperref, enumitem, titlesec, etc.
#   texlive-latex-extra      — many extra .sty files used by CV templates
#   texlive-fonts-recommended — TeX Gyre Heros, Latin Modern, etc.
#   texlive-fonts-extra      — fontawesome5.sty + FontAwesome5 fonts
#   texlive-pictures         — tabularx-adjacent graphics helpers some
#                              templates pull in (tikz is NOT required here)
#   lmodern                  — Latin Modern fonts
# This is deliberately NOT texlive-full (several GB, too slow to build on
# Render Free). If a future template needs a missing .sty, add its Debian
# texlive package here and redeploy — the pdflatex error names the file.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps + TeX Live. apt-get clean in the same layer keeps the image
# smaller; --no-install-recommends avoids pulling the whole TeX universe.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-latex-extra \
        texlive-fonts-recommended \
        texlive-fonts-extra \
        texlive-pictures \
        lmodern \
        curl && \
    rm -rf /var/lib/apt/lists/* && \
    which pdflatex && pdflatex --version | head -1

# Python deps first (layer cache: requirements change rarely).
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Engine code. Note: main.py runs on port 8000 locally, but Render injects
# $PORT — the CMD below honours $PORT (default 8000).
COPY . ./

# Render free instances have 512 MB RAM; a single uvicorn worker is the
# safe choice (more workers would OOM during a NIM call + pdflatex run).
# Temp dirs: engine already uses /tmp on Vercel; on Render the working
# directory is writable, so the default relative temp/ also works.
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
