---
title: fuse-ai-engine
emoji: 📄
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Fuse AI Engine (Hugging Face Spaces)

FastAPI AI engine for Fuse-AI-resume-Builder — Critic → Writer → QA,
surgical LaTeX bullet rewriting, and pdflatex compilation of the user's
exact resume template.

This Space repo contains only `Dockerfile` + this README. At build time
the Dockerfile clones the public GitHub repo
`harshpatil110/Fuse-AI-resume-Builder` (branch `vercel-deploy`) and copies
`ai-engine/` into the container, so the engine code lives in GitHub, not
duplicated here.

Environment variables (set in Space → Settings → Variables and secrets,
never committed here):
- `NVIDIA_NIM_API_KEY` — required, the engine creates its Nvidia NIM
  client at import time and will not start without it.
- `LLM_PROVIDER`, `DEFAULT_MODEL`, `GEMINI_API_KEY` — optional.

Health/docs: `/docs`
Compile endpoint: `POST /api/compile-tex`
