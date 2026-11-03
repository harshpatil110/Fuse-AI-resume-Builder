import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * POST /api/compile
 * Merges AI-rewritten LaTeX section bodies back into the original .tex template
 * and recompiles it to a PDF via the AI engine's pdflatex pipeline. Returns the
 * PDF byte buffer to the frontend.
 *
 * Body: { tex: string, sections?: { [sectionTitle]: newBody } }
 */
router.post('/compile', async (req, res) => {
  try {
    const body = req.body || {};
    const tex = body.tex;
    const sections = body.sections || {};

    if (!tex || typeof tex !== 'string') {
      return res.status(400).json({ error: 'tex is required' });
    }

    // Forward GitHub repo selections + JD so the AI engine can fetch repo data,
    // generate bullets, and inject \\resumeProjectHeading blocks into PROJECTS.
    const aiResponse = await axios.post(
      'http://localhost:8000/api/compile-tex',
      {
        tex,
        sections,
        github_repos: body.github_repos || [],
        jd_text: body.jd_text || '',
      },
      {
        responseType: 'arraybuffer',
        timeout: 180000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const pdfBuffer = Buffer.from(aiResponse.data);
    // A valid PDF always begins with the %PDF- magic bytes.
    if (pdfBuffer.length < 5 || pdfBuffer.slice(0, 5).toString('ascii') !== '%PDF-') {
      return res.status(502).json({ error: 'AI engine did not return a valid PDF' });
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': 'attachment; filename="optimized-resume.pdf"',
    });
    res.send(pdfBuffer);
  } catch (error) {
    if (error.response) {
      // Forward the AI engine's status and detail (e.g. 422 for invalid LaTeX).
      const status = error.response.status || 500;
      let detail = 'Failed to compile LaTeX to PDF';
      try {
        const body = Buffer.isBuffer(error.response.data)
          ? JSON.parse(Buffer.from(error.response.data).toString('utf-8'))
          : error.response.data;
        detail = body?.detail || body?.error || detail;
      } catch {
        /* non-JSON error body — keep the default message */
      }
      return res.status(status).json({ error: detail });
    }
    console.error('Compile proxy failed:', error.message);
    res.status(500).json({ error: 'Failed to compile LaTeX to PDF' });
  }
});

export default router;
