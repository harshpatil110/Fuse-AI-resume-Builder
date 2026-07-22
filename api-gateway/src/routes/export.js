import express from 'express';
import { generatePDF } from '../services/pdfService.js';

const router = express.Router();

router.post('/pdf', async (req, res) => {
  try {
    const resumeData = req.body;
    if (!resumeData || !resumeData.basics) {
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
