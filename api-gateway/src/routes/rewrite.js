import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * POST /api/rewrite
 * Proxies the Writer Agent request to the Python AI Engine's /api/rewrite-resume
 * and returns the rewritten resume JSON to the frontend.
 */
router.post('/rewrite', async (req, res) => {
  try {
    const body = req.body || {};

    // Accept both snake_case and camelCase field names from the frontend.
    const parsedResume = body.parsedResume || body.parsed_resume || body.resume;
    const jdText =
      body.jdText ||
      body.jd_text ||
      (typeof body.jd === 'object' && body.jd !== null ? body.jd.text : body.jd);
    const criticFeedback = body.criticFeedback || body.critic_feedback;
    const selected_github_projects = body.selected_github_projects || body.selectedGithubProjects;

    if (!parsedResume || !jdText) {
      return res.status(400).json({ error: 'parsedResume and jdText are required' });
    }

    const aiResponse = await axios.post(
      'http://localhost:8000/api/rewrite-resume',
      {
        parsed_resume: parsedResume,
        jd_text: jdText,
        selected_github_projects: Array.isArray(selected_github_projects)
          ? selected_github_projects
          : [],
      },
      // The multi-agent LLM workflow (Writer + QA loop, possibly on a large
      // model) can take minutes. 5 minutes gives it room without closing the
      // connection before the Python engine finishes.
      { timeout: 300000 }
    );

    res.json(aiResponse.data);
  } catch (error) {
    console.error('Rewrite proxy failed:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to rewrite resume' });
  }
});

export default router;
