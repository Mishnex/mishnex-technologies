import { Router } from 'express';
import { z } from 'zod';
import { leadUpdateSchema, canTransitionLead } from './lead-workflow.js';

// Owner-only Module 2 lead operations. No schema mutation or production migration here.
// Mounting is gated by LEAD_WORKFLOW_ENABLED, which defaults OFF.
export function leadWorkflowRoutes({ pool, requireOwner }) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (process.env.LEAD_WORKFLOW_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Lead workflow is not enabled.' });
    }
    next();
  });
  router.use(requireOwner);

  router.patch('/:leadId/status', async (req, res, next) => {
    const leadId = z.string().uuid().safeParse(req.params.leadId);
    const parsed = leadUpdateSchema.safeParse(req.body);
    if (!leadId.success || !parsed.success) {
      return res.status(400).json({ error: 'Invalid lead status update.' });
    }
    let client;
    let commitAttempted = false;
    let transactionOpen = false;
    let connectionBroken = false;
    try {
      client = await pool.connect();
      transactionOpen = true;
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT status FROM public.crm_leads WHERE id=$1 FOR UPDATE',
        [leadId.data]
      );
      if (!current.rowCount) {
        transactionOpen = false;
        connectionBroken = true;
        await client.query('ROLLBACK');
        connectionBroken = false;
        return res.status(404).json({ error: 'Lead not found.' });
      }
      const from = current.rows[0].status;
      if (from === parsed.data.status && !parsed.data.note) {
        transactionOpen = false;
        connectionBroken = true;
        await client.query('ROLLBACK');
        connectionBroken = false;
        return res.status(400).json({ error: 'A follow-up note is required when the status is unchanged.' });
      }
      if (!canTransitionLead(from, parsed.data.status)) {
        transactionOpen = false;
        connectionBroken = true;
        await client.query('ROLLBACK');
        connectionBroken = false;
        return res.status(409).json({ error: 'Lead status transition is not allowed.' });
      }
      if (from !== parsed.data.status) {
        await client.query('UPDATE public.crm_leads SET status=$2 WHERE id=$1',
          [leadId.data, parsed.data.status]);
      }
      await client.query(
        'INSERT INTO public.crm_lead_activity(lead_id,actor_id,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5)',
        [leadId.data, req.owner.id, from, parsed.data.status, parsed.data.note ?? null]
      );
      commitAttempted = true;
      await client.query('COMMIT');
      transactionOpen = false;
      return res.json({ leadId:leadId.data, fromStatus:from, status:parsed.data.status });
    } catch (error) {
      if (client && transactionOpen && !commitAttempted) {
        try { await client.query('ROLLBACK'); transactionOpen = false; } catch (rollbackError) {
          connectionBroken = true;
          console.error('Lead status rollback failed:', rollbackError.message);
        }
      }
      if (commitAttempted) connectionBroken = true;
      if (commitAttempted) return res.status(503).json({
        error: 'Lead update outcome is uncertain. Refresh the lead and its activity history before attempting another update.'
      });
      next(error);
    } finally {
      client?.release(connectionBroken || transactionOpen);
    }
  });
  router.get('/:leadId/activity', async (req, res, next) => {
    const parsed = z.string().uuid().safeParse(req.params.leadId);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid lead ID.' });
    try {
      const exists = await pool.query('SELECT 1 FROM public.crm_leads WHERE id=$1', [parsed.data]);
      if (!exists.rowCount) return res.status(404).json({ error: 'Lead not found.' });
      const result = await pool.query(
        `SELECT a.id,a.from_status,a.to_status,a.note,a.created_at
         FROM public.crm_lead_activity a
         WHERE a.lead_id=$1
         ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
        [parsed.data]
      );
      return res.json({ leadId:parsed.data, activity:result.rows });
    } catch (error) { next(error); }
  });
  return router;
}
