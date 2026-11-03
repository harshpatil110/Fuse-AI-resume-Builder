import express from 'express';
import axios from 'axios';
import { generatePDF } from '../services/pdfService.js';

const router = express.Router();

router.post('/pdf', async (req, res) => {
  try {
    const resumeData = req.body;
    if (!resumeData) {
      return res.status(400).json({ error: 'Invalid resume data provided' });
    }

    // Vercel-deploy branch only — BUG FIX (2026-11-04): a LaTeX resume must
    // NEVER fall through to generatePDF/pdfkit on Vercel. pdfkit renders only
    // the structured fields (basics/work/projects/skills) in a plain A4
    // layout and leaks LaTeX debris from the extracted fields — that is what
    // produced the wrong "optimized-resume (8)" PDF, while the local
    // pdflatex run produced the exact template PDF "(7)". A LaTeX resume
    // must go through the engine's pdflatex compile only. On Vercel that
    // compile fails (no pdflatex binary) and the error below says so
    // plainly, with the .tex download in the Editor as the exact-template
    // path — a clear failure is correct, a wrong-layout PDF is not.
    // If LaTeX format is detected, compile directly via AI Engine's pdflatex pipeline
    if (resumeData.raw_tex || resumeData.format === 'latex' || resumeData.tex) {
      const tex = resumeData.raw_tex || resumeData.tex;
      const aiResponse = await axios.post(
        `${process.env.AI_ENGINE_URL || 'http://localhost:8000'}/api/compile-tex`,
        { tex },
        {
          responseType: 'arraybuffer',
          timeout: 180000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      const pdfBuffer = Buffer.from(aiResponse.data);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.length,
        'Content-Disposition': 'attachment; filename="optimized-resume.pdf"',
      });
      return res.send(pdfBuffer);
    }

    if (!resumeData.basics) {
      return res.status(400).json({ error: 'Invalid resume data provided' });
    }

    const pdfBuffer = await generatePDF(resumeData);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length
    });
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    // Forward the engine's real detail (e.g. "pdflatex not found") instead
    // of hiding it behind a generic message.
    let detail = null;
    if (error?.response?.data) {
      try {
        const body = Buffer.isBuffer(error.response.data)
          ? JSON.parse(Buffer.from(error.response.data).toString('utf-8'))
          : error.response.data;
        detail = body?.detail || body?.error || null;
      } catch { /* non-JSON body */ }
    }
    const message = detail || error?.message || 'Failed to generate PDF';
    res.status(500).json({
      error: detail && detail.includes('pdflatex')
        ? `Failed to generate PDF: ${detail} Vercel has no pdflatex, so the exact-template PDF cannot be compiled here — use "Download .tex" in the Editor and compile it locally or in Overleaf.`
        : `Failed to generate PDF: ${message}`,
    });
  }
});

export default router;
