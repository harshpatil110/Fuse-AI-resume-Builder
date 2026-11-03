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
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
