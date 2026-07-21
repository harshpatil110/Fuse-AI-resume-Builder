import express from 'express';
import axios from 'axios';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import 'dotenv/config';

const router = express.Router();

router.get('/github', (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email repo`;
  res.redirect(githubAuthUrl);
});

router.get('/github/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;
    
    if (!accessToken) {
      return res.status(400).send('Failed to obtain access token');
    }

    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userData = userResponse.data;
    const githubId = String(userData.id);
    const githubUsername = userData.login;
    let email = userData.email;

    if (!email) {
      const emailResponse = await axios.get('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const primaryEmail = emailResponse.data.find((e) => e.primary);
      email = primaryEmail ? primaryEmail.email : `${githubUsername}@github.com`;
    }

    await db.insert(users).values({
      githubId,
      email,
      githubUsername,
      accessToken,
    }).onConflictDoUpdate({
      target: users.githubId,
      set: {
        email,
        githubUsername,
        accessToken,
      }
    });

    res.send(`
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-[#F7F5F0] text-gray-900 font-sans min-h-screen flex items-center justify-center p-8">
          <div class="max-w-md w-full bg-white border border-gray-200 p-8">
            <h1 class="text-3xl font-light tracking-tight mb-4 text-[#2A2927]">Authentication Successful</h1>
            <p class="text-sm text-gray-500 mb-6 leading-relaxed">You have successfully authenticated with GitHub as <span class="font-medium text-gray-900">${githubUsername}</span>. You can now close this window and return to the application.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error during GitHub OAuth:', error);
    res.status(500).send('Authentication failed');
  }
});

export default router;
