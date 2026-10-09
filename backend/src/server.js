import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { leadSchema } from './validation.js';

const { Pool } = pg;
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '16kb' }));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
if (!process.env.DATABASE_URL || !allowedOrigins.length) {
  throw new Error('DATABASE_URL and ALLOWED_ORIGINS are required');
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined
});
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});
app.post('/api/public/leads', leadLimiter, async (req, res, next) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check the form fields.' });
  const lead = parsed.data;
  if (lead.website) return res.status(202).json({ received: true });
  try {
    const result = await pool.query(
      `INSERT INTO crm_leads (name,email,phone,service,budget,preferred_call_time,requirement)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [lead.name,lead.email,lead.phone,lead.service,lead.budget,lead.calltime,lead.requirement]
    );
    return res.status(201).json({ received: true, leadId: result.rows[0].id });
  } catch (error) { return next(error); }
});
app.use((error, _req, res, _next) => {
  console.error('API error:', error.message);
  res.status(500).json({ error: 'Unable to submit right now. Please try again.' });
});
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`Mishnex CRM API listening on port ${port}`));
