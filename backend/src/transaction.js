// A lost COMMIT acknowledgement must never be reported as a successful rollback.
export async function transaction(pool, work) {
  const client = await pool.connect();
  let commitAttempted = false, broken = false;
  try {
    await client.query('BEGIN');
    const value = await work(client);
    commitAttempted = true;
    await client.query('COMMIT');
    return value;
  } catch (error) {
    if (commitAttempted) {
      broken = true;
      const uncertain = new Error('Save outcome is uncertain. Refresh the record before retrying.');
      uncertain.status = 503;
      throw uncertain;
    }
    try { await client.query('ROLLBACK'); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}
export function reject(status, message) {
  const error = new Error(message); error.status = status; throw error;
}
