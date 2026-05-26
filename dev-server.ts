import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import generate from './api/generate.ts';
import templates from './api/templates.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

app.get('/api/templates', (req, res) => templates(req, res));
app.post('/api/generate', (req, res) => generate(req, res));

app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback (keeps /api untouched).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Dev server running at http://localhost:${port}`);
});
