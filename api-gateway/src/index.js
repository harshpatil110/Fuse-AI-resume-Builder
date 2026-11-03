import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import githubRoutes from './routes/github.js';
import exportRoutes from './routes/export.js';
import historyRoutes from './routes/history.js';
import rewriteRoutes from './routes/rewrite.js';
import compileRoutes from './routes/compile.js';

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes);
app.use('/api', rewriteRoutes);
app.use('/api', compileRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/history', historyRoutes);

app.get('/', (req, res) => {
  res.send('API Gateway is running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const server = app.listen(port, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use.`);
    } else {
      console.error('❌ Server startup error:', err);
    }
    process.exit(1);
    return;
  }
  console.log(`Server running on port ${port}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use.`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

const shutdown = (signal) => {
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(0);
  }, 1000).unref();
};

process.once('SIGUSR2', () => {
  server.close(() => {
    process.kill(process.pid, 'SIGUSR2');
  });
});
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
export { server };
