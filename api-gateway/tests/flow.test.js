import request from 'supertest';
import express from 'express';
import authRoutes from '../src/routes/auth.js';
import exportRoutes from '../src/routes/export.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/export', exportRoutes);

describe('E2E Flow Tests', () => {
  it('should redirect to GitHub on OAuth route', async () => {
    const res = await request(app).get('/api/auth/github');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/github\.com\/login\/oauth\/authorize/);
  });

  it('should generate a PDF from JSON payload', async () => {
    const payload = {
      basics: { 
        name: 'Harshvardhan Patil', 
        role: 'Full-Stack Developer', 
        summary: 'Experienced developer.' 
      },
      work: [],
      projects: [],
      skills: 'React, Node.js'
    };

    const res = await request(app)
      .post('/api/export/pdf')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    
    // In Supertest, binary responses (like PDF) come back in res.body as a Buffer
    expect(Buffer.isBuffer(res.body)).toBeTruthy();
    expect(res.body.length).toBeGreaterThan(0);
  }, 30000); // Give puppeteer extra time to launch
});
