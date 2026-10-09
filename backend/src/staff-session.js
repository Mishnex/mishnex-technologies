// Staff session cutoff is intentionally strict at second boundaries.
// Caller must first validate the token with Supabase Auth.
export function tokenIssuedAfterCutoff(accessToken, cutoff) {
  try {
    const parts = typeof accessToken === 'string' ? accessToken.split('.') : [];
    if (parts.length !== 3 || !parts.every(Boolean)) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const cutoffSeconds = new Date(cutoff).getTime() / 1000;
    return Number.isInteger(payload.iat) && Number.isFinite(cutoffSeconds) && payload.iat > Math.floor(cutoffSeconds);
  } catch {
    return false;
  }
}
