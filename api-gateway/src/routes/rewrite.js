import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * POST /api/rewrite
 * Proxies the Writer Agent request to the Python AI Engine's /api/rewrite-resume
 * and returns the rewritten resume JSON to the frontend.
 */
router.post('/rewrite', async (req, res) => {
  // The QA loop can run for several minutes (up to 3 Writer attempts on a large
  // NIM model). Lengthen the Express socket timeouts so the server itself never
  // drops the connection before Python returns.
  req.setTimeout(600000);
  res.setTimeout(600000);

  try {
    const body = req.body || {};

    // Accept both snake_case and camelCase field names from the frontend.
    const parsedResume = body.parsedResume || body.parsed_resume || body.resume;
    const rawTex = body.rawTex || body.raw_tex;
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
      `${process.env.AI_ENGINE_URL || 'http://localhost:8000'}/api/rewrite-resume`,
      {
        parsed_resume: parsedResume,
        jd_text: jdText,
        selected_github_projects: Array.isArray(selected_github_projects)
          ? selected_github_projects
          : [],
        raw_tex: rawTex || null,
        critic_feedback: criticFeedback || null,
      },
      // The multi-agent LLM workflow (Writer + QA loop, possibly on a large
      // model) can take minutes. 10 minutes gives the QA loop room to finish
      // without axios closing the socket first. maxBodyLength/maxContentLength
      // stay unbounded so large parsed resumes + rewritten JSON are not rejected.
      {
        timeout: 600000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    res.json(aiResponse.data);
  } catch (error) {
    // Detailed diagnostics: exact reason, code (ECONNRESET / ECONNREFUSED /
    // ETIMEDOUT / AxiosError), stack, and the engine's response body when one
    // was actually received. Distinguishes a timeout/reset from an engine
    // rejection (422/500) without guessing.
    console.error('❌ Rewrite proxy failed');
    console.error('  message :', error.message);
    console.error('  code    :', error.code);
    console.error('  stack   :', error.stack);
    if (error.response) {
      console.error('  engine status:', error.response.status);
      console.error('  engine body  :', JSON.stringify(error.response.data));
    } else {
      console.error('  (no HTTP response from engine — connection error/timeout)');
    }
    res.status(500).json({ error: 'Failed to rewrite resume' });
  }
});

export default router;
