import app from '../src/index.js';

// Vercel-deploy branch only: serverless entrypoint.
// src/index.js does not call app.listen() when VERCEL=1,
// so Vercel serves this exported Express app as a function.
export default app;
