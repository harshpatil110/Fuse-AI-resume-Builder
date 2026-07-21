import express from 'express';
import { db } from '../db/index.js';
import { users, githubProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { fetchUserGithubData } from '../services/githubService.js';

const router = express.Router();

router.post('/sync', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userResult[0];

    if (!user || !user.accessToken || !user.githubUsername) {
      return res.status(400).json({ error: 'User not found or lacks GitHub authentication' });
    }

    const githubData = await fetchUserGithubData(user.accessToken, user.githubUsername);

    await db.insert(githubProfiles).values({
      userId: user.id,
      repoData: githubData,
    }).onConflictDoUpdate({
      target: githubProfiles.userId,
      set: { repoData: githubData }
    });

    res.json({
      status: 'success',
      data: githubData,
    });
  } catch (error) {
    console.error('Failed to sync GitHub data:', error);
    res.status(500).json({ error: 'Internal server error while syncing GitHub data' });
  }
});

router.get('/preview', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap');
          body { font-family: 'Inter', sans-serif; }
        </style>
      </head>
      <body class="bg-[#F7F5F0] text-gray-900 min-h-screen p-8 flex flex-col items-center justify-center">
        <div class="max-w-2xl w-full bg-white border border-stone-200 p-10">
          <h1 class="text-2xl font-light tracking-tight mb-8 text-[#2A2927] uppercase">GitHub Sync Preview</h1>
          
          <form id="syncForm" class="space-y-6">
            <div>
              <label class="block text-xs font-medium text-stone-500 uppercase tracking-widest mb-3">User ID</label>
              <input type="number" id="userId" class="block w-full border border-stone-200 p-4 text-sm focus:ring-0 focus:border-stone-400 focus:outline-none bg-stone-50" placeholder="Enter User ID" required />
            </div>
            <button type="submit" class="w-full bg-[#2A2927] text-white py-4 text-sm font-medium tracking-widest uppercase hover:bg-black transition-colors">
              Sync Data
            </button>
          </form>
          
          <div id="result" class="mt-8 hidden">
            <h2 class="text-xs font-medium text-stone-500 uppercase tracking-widest mb-3">Sync Result</h2>
            <pre id="jsonResult" class="bg-stone-50 border border-stone-200 p-4 text-xs overflow-auto max-h-96"></pre>
          </div>
        </div>

        <script>
          document.getElementById('syncForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('userId').value;
            const res = await fetch('/api/github/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: parseInt(userId, 10) })
            });
            const data = await res.json();
            document.getElementById('result').classList.remove('hidden');
            document.getElementById('jsonResult').textContent = JSON.stringify(data, null, 2);
          });
        </script>
      </body>
    </html>
  `);
});

export default router;
