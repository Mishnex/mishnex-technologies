import { assertStagingTarget } from '../test-support/staging-guard.js';

try {
  assertStagingTarget(process.env);
  // Deliberately no network calls or account mutations here.
  // Subsequent staging integration scripts must import and run this guard first.
  console.log('Isolated staging target verified. No network requests or mutations performed.');
} catch (error) {
  console.error('Staging preflight rejected:', error.message);
  process.exitCode = 1;
}
