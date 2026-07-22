import express from 'express';
import { db } from '../db/index.js';
import { resumes, jobDescriptions } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

router.post('/save', async (req, res) => {
  try {
    const { userId, jdText, generatedJson, originalFilePath } = req.body;
    if (!userId || !jdText || !generatedJson) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert JD
    await db.insert(jobDescriptions).values({
      userId,
      jdText
    });

    // Insert Resume
    const insertedResume = await db.insert(resumes).values({
      userId,
      originalFilePath: originalFilePath || 'manual-entry',
      generatedJson
    }).returning({ id: resumes.id });

    res.status(200).json({ status: 'success', resumeId: insertedResume[0].id });
  } catch (error) {
    console.error('Error saving history:', error);
    res.status(500).json({ error: 'Failed to save history' });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const userResumes = await db.select()
      .from(resumes)
      .where(eq(resumes.userId, parseInt(userId)))
      .orderBy(desc(resumes.createdAt));
      
    const userJds = await db.select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.userId, parseInt(userId)))
      .orderBy(desc(jobDescriptions.createdAt));

    const historyList = userResumes.map((r, index) => {
      const generated = r.generatedJson || {};
      const basics = generated.basics || {};
      const jd = userJds[index] ? userJds[index].jdText : 'No JD available';
      return {
        id: r.id,
        targetRole: basics.role || 'Unknown Role',
        companyName: 'Target Company',
        snippet: jd.substring(0, 120) + '...',
        createdAt: r.createdAt
      };
    });

    res.json(historyList);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/resume/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resume = await db.select().from(resumes).where(eq(resumes.id, parseInt(id)));
    
    if (!resume || resume.length === 0) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    
    res.json(resume[0].generatedJson);
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

export default router;
