import express from 'express';
import { upload } from '../middleware/upload.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const router = express.Router();

const uploadFields = upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'jd_file', maxCount: 1 }
]);

router.post('/upload', (req, res) => {
  uploadFields(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ status: 'error', message: err.message });
    }

    const resumeFile = req.files && req.files['resume'] ? req.files['resume'][0] : null;
    const jdFile = req.files && req.files['jd_file'] ? req.files['jd_file'][0] : null;
    const jdText = req.body.jd_text;

    if (!resumeFile) {
      return res.status(400).json({ status: 'error', message: 'Resume file is required' });
    }

    if (!jdFile && !jdText) {
      if (resumeFile) fs.unlinkSync(resumeFile.path);
      return res.status(400).json({ status: 'error', message: 'Either jd_file or jd_text is required' });
    }

    try {
      const formData = new FormData();
      formData.append('resume', fs.createReadStream(resumeFile.path));
      if (jdFile) {
        formData.append('jd_file', fs.createReadStream(jdFile.path));
      }
      if (jdText) {
        formData.append('jd_text', jdText);
      }

      // Step 1: Parse the resume PDF via Python Engine
      const processResponse = await axios.post('http://localhost:8000/process-resume', formData, {
        headers: formData.getHeaders(),
      });

      const extractedData = processResponse.data.extracted_data;

      // Step 2: Run the Critic Agent
      const criticResponse = await axios.post('http://localhost:8000/api/criticize', {
        resume_data: extractedData,
        jd_text: jdText || 'Job description provided via file',
      });

      // Step 2.5: For LaTeX resumes, keep the raw .tex template so the Editor can
      // re-inject rewritten sections and recompile via /api/compile.
      let texTemplate = null;
      if (resumeFile && /\.tex$/i.test(resumeFile.originalname)) {
        texTemplate = fs.readFileSync(resumeFile.path, 'utf-8');
      }

      // Step 3: Return the complete payload to the frontend
      res.json({
        parsed_resume: extractedData,
        critique: criticResponse.data.critique,
        jd_text: jdText || null,
        format: extractedData?.format || 'pdf',
        tex_template: texTemplate
      });

    } catch (error) {
      console.error("AI Engine processing failed:", error.response?.data || error.message);
      res.status(500).json({ error: "AI Engine processing failed" });
    } finally {
      // Clean up local temp files
      if (resumeFile) fs.unlinkSync(resumeFile.path);
      if (jdFile) fs.unlinkSync(jdFile.path);
    }
  });
});

router.get('/upload-test', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');
          body { font-family: 'Inter', sans-serif; }
        </style>
      </head>
      <body class="bg-[#F7F5F0] text-gray-900 min-h-screen p-8 flex items-center justify-center">
        <div class="max-w-2xl w-full bg-white border border-stone-200 p-10">
          <h1 class="text-2xl font-light tracking-tight mb-8 text-[#2A2927]">DOCUMENT UPLOAD</h1>
          
          <form action="/api/upload" method="POST" enctype="multipart/form-data" class="space-y-8">
            <div>
              <label class="block text-xs font-medium text-stone-500 uppercase tracking-widest mb-3">Resume (PDF)</label>
              <div class="border border-dashed border-stone-300 p-6 text-center hover:bg-stone-50 transition-colors">
                <input type="file" name="resume" accept="application/pdf" class="text-sm text-stone-600 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-medium file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200 cursor-pointer w-full" required>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-stone-500 uppercase tracking-widest mb-3">Job Description (PDF/TXT)</label>
              <div class="border border-dashed border-stone-300 p-6 text-center hover:bg-stone-50 transition-colors">
                <input type="file" name="jd_file" accept="application/pdf,.txt" class="text-sm text-stone-600 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-medium file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200 cursor-pointer w-full">
              </div>
            </div>

            <div class="relative">
              <div class="absolute inset-0 flex items-center" aria-hidden="true">
                <div class="w-full border-t border-stone-200"></div>
              </div>
              <div class="relative flex justify-center">
                <span class="bg-white px-3 text-xs font-medium text-stone-400 uppercase tracking-widest">Or</span>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-stone-500 uppercase tracking-widest mb-3">Job Description Text</label>
              <textarea name="jd_text" rows="4" class="block w-full border border-stone-200 p-4 text-sm focus:ring-0 focus:border-stone-400 focus:outline-none bg-stone-50" placeholder="Paste the job description here..."></textarea>
            </div>

            <div class="pt-4">
              <button type="submit" class="w-full bg-[#2A2927] text-white py-4 text-sm font-medium tracking-widest uppercase hover:bg-black transition-colors">
                Process Documents
              </button>
            </div>
          </form>
        </div>
      </body>
    </html>
  `);
});

export default router;
