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
      console.error('Failed to obtain access token. Response data:', tokenResponse.data);
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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?github_connected=true`);
  } catch (error) {
    console.error('Error during GitHub OAuth:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

export default router;
