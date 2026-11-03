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

    // Vercel-deploy branch only: on Vercel there is no pdflatex, so the
    // engine compile-tex path would always fail. Fall through to generatePDF,
    // which on Vercel renders the structured data with pdfkit (clean layout,
    // not the original LaTeX template). Locally the pdflatex path below is
    // unchanged.
    // If LaTeX format is detected, compile directly via AI Engine's pdflatex pipeline
    if (process.env.VERCEL !== '1' && (resumeData.raw_tex || resumeData.format === 'latex' || resumeData.tex)) {
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
    res.status(500).json({ error: error?.message ? `Failed to generate PDF: ${error.message}` : 'Failed to generate PDF' });
  }
});

export default router;
