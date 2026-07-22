import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import githubRoutes from './routes/github.js';
import exportRoutes from './routes/export.js';
import historyRoutes from './routes/history.js';

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/history', historyRoutes);

app.get('/', (req, res) => {
  res.send('API Gateway is running');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
