import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { leadSchema } from './validation.js';
import { staffRoutes } from './staff.js';
import { hrRoutes } from './hr-routes.js';
import { erpRoutes } from './erp-routes.js';
import { pageSecurity } from './page-security.js';
import {quotationRoutes} from './quotation-routes.js';
import {quoteLinkRoutes} from './quote-link-routes.js';
import { policyRoutes } from './policy-routes.js';
import { workspaceAuth } from './workspace-auth.js';
import { paymentRoutes } from './payment-routes.js';
import { portalRoutes } from './portal-routes.js';
import { leadWorkflowRoutes } from './lead-routes.js';
import { clientRoutes } from './client-routes.js';
import { leadStatusSchema } from './lead-workflow.js';

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
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n') } : {}) } : undefined
});
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
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


// Owner dashboard is hosted with the API for staging and production parity.
app.get('/admin-panel', async (_req, res, next) => {
  try {
    const page = await readFile(fileURLToPath(new URL('../public/admin-panel.html', import.meta.url)), 'utf8');
    const inlineScript = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    if (!inlineScript) throw new Error('Admin panel script is missing');
    const scriptHash = createHash('sha256').update(inlineScript).digest('base64');
    res.set('Content-Security-Policy', `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'sha256-${scriptHash}'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; upgrade-insecure-requests`);
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(page);
  } catch (error) { next(error); }
});

app.get('/client-portal', async (_req,res,next)=>{try{
 const page=await readFile(fileURLToPath(new URL('../public/client-portal.html',import.meta.url)),'utf8');
 const inlineScript=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 if(!inlineScript)throw Error('Client portal script missing');
 const scriptHash=createHash('sha256').update(inlineScript).digest('base64');
 res.set('Content-Security-Policy',`default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'sha256-${scriptHash}'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; img-src 'self' data:`);
 res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex,nofollow');res.type('html').send(page);
 }catch(error){next(error)}});
// Password recovery is hosted on the API domain so it works before the public site deploy.
app.get('/staff-login', async (_req, res, next) => {
  try {
    const page = await readFile(fileURLToPath(new URL('../public/staff-login.html', import.meta.url)), 'utf8');
    res.set('Content-Security-Policy',pageSecurity(page,{supabase:false}));
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(page);
  } catch (error) { next(error); }
});
app.get('/forgot-password', async (_req, res, next) => {
  try {
    const page = await readFile(fileURLToPath(new URL('../public/forgot-password.html', import.meta.url)), 'utf8');
    res.set('Content-Security-Policy',pageSecurity(page,{supabase:false}));
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(page);
  } catch (error) { next(error); }
});
app.get('/reset-password', async (_req, res, next) => {
  try {
    const page = await readFile(fileURLToPath(new URL('../public/reset-password.html', import.meta.url)), 'utf8');
    res.set('Content-Security-Policy',pageSecurity(page,{supabase:true}));
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Cache-Control', 'no-store');
    res.type('html').send(page);
  } catch (error) { next(error); }
});
app.get('/api/public/auth-config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ url: process.env.SUPABASE_URL || null, key: process.env.SUPABASE_ANON_KEY || null });
});
const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: 'draft-7',
  legacyHeaders: false, message: { error: 'Too many requests. Please try later.' }
});
app.post('/api/admin/password-recovery', recoveryLimiter, async (req, res, next) => {
  if (!authConfigured()) return res.status(503).json({ error: 'Recovery is not configured.' });
  const email = req.body?.email;
  if (typeof email !== 'string' || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  // Prevent recovery-email abuse: only the configured Owner email may receive mail.
  try {
    if (!process.env.OWNER_EMAIL || process.env.OWNER_EMAIL.toLowerCase() !== email.toLowerCase()) {
      return res.json({ message: 'If this is the Owner account, a recovery email will be sent.' });
    }
    const redirectTo = 'https://mishnex-crm-api.onrender.com/reset-password';
    const response = await fetch(new URL('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), process.env.SUPABASE_URL), {
      method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }), signal: AbortSignal.timeout(8000)
    });
    if (response.status === 429) {
      return res.status(429).json({ error: 'Supabase email limit reached. Wait for the email quota to reset before trying again.' });
    }
    if (!response.ok) {
      console.error('Supabase recovery request failed:', response.status);
      return res.status(502).json({ error: 'Recovery email could not be sent. Please try again later.' });
    }
    return res.json({ message: 'Recovery request accepted. Check your inbox and spam folder.' });
  } catch (error) { next(error); }
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7',
  legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' }
});
const authConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.OWNER_USER_ID);
async function supabaseUser(accessToken) {
  if (!authConfigured()) return null;
  const response = await fetch(new URL('/auth/v1/user', process.env.SUPABASE_URL), {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id === process.env.OWNER_USER_ID ? user : null;
}
app.post('/api/admin/login', adminLoginLimiter, async (req, res, next) => {
  if (!authConfigured()) return res.status(503).json({ error: 'Owner login is not configured yet.' });
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' ||
      email.length > 254 || password.length > 1024 || !email || !password) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }
  try {
    const response = await fetch(new URL('/auth/v1/token?grant_type=password', process.env.SUPABASE_URL), {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return res.status(401).json({ error: 'Invalid credentials or access denied.' });
    const tokens = await response.json();
    if (!tokens.access_token || !(await supabaseUser(tokens.access_token))) {
      return res.status(403).json({ error: 'Owner access only.' });
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ accessToken: tokens.access_token, expiresIn: tokens.expires_in });
  } catch (error) { next(error); }
});
async function requireOwner(req, res, next) {
  if (!authConfigured()) return res.status(503).json({ error: 'Owner access is not configured yet.' });
  const match = /^Bearer (\S+)$/.exec(req.get('Authorization') || '');
  if (!match) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const user = await supabaseUser(match[1]);
    if (!user) return res.status(403).json({ error: 'Access denied.' });
    req.owner = user;
    next();
  } catch (error) { next(error); }
}
app.use('/api/admin/staff', staffRoutes({ pool, requireOwner }));
app.use('/api/admin/hr', hrRoutes({ pool, requireOwner }));
app.use('/api/admin/erp', erpRoutes({ pool, requireOwner, authorize:workspaceAuth(pool) }));
app.use('/api/client', portalRoutes({ pool }));
app.use('/api/admin/quotations',quotationRoutes({pool,authorize:workspaceAuth(pool)}));
app.use('/api/quote-link',quoteLinkRoutes({pool}));
app.get('/quotation',async(_req,res,next)=>{try{const page=await readFile(fileURLToPath(new URL('../public/quotation.html',import.meta.url)),'utf8');res.set('Content-Security-Policy',pageSecurity(page));res.set('Referrer-Policy','no-referrer');res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex,nofollow');res.type('html').send(page)}catch(e){next(e)}});
app.use('/api/admin/settings',policyRoutes({pool,requireOwner}));
app.use('/api/admin/payments', paymentRoutes({pool,authorize:workspaceAuth(pool),requireOwner}));
app.use('/api/admin/lead-workflow', leadWorkflowRoutes({ pool, requireOwner }));
app.use('/api/admin/clients', clientRoutes({ pool, requireOwner }));
app.get('/api/admin/me', requireOwner, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ id: req.owner.id, email: req.owner.email, role: 'owner' });
});
app.get('/api/admin/leads', requireOwner, async (req, res, next) => {
  const rawStatus = req.query.status;
  if (rawStatus !== undefined && (typeof rawStatus !== 'string' || !leadStatusSchema.safeParse(rawStatus).success)) {
    return res.status(400).json({ error: 'Invalid lead status filter.' });
  }
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, service, budget, preferred_call_time, requirement, status, created_at FROM public.crm_leads ' +
      (rawStatus ? 'WHERE status=$1 ' : '') + 'ORDER BY created_at DESC LIMIT 50',
      rawStatus ? [rawStatus] : []
    );
    res.set('Cache-Control', 'no-store');
    res.json({ leads: result.rows });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error('API error:', error.message);
  res.status(500).json({ error: 'Unable to submit right now. Please try again.' });
});
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`Mishnex CRM API listening on port ${port}`));
