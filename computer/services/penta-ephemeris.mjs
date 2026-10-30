/**
 * Penta Ephemeris Provider — Stage 4e.
 * Wraps the vendored Synthai2 synthia-server/ephemeris.py donor (Python) via a
 * child_process boundary (services/penta-runner.py adapter). The donor is NOT
 * rewritten; it is executed with the real PyEphem triple-zodiac machinery.
 * Env requirement: python3 + pyephem (installed locally, documented in
 * PROVENANCE.md). If unavailable, a provider-failure event is emitted and the
 * status stays PRESENT.
 * KNOWN LIMITATION (recorded, not hidden): the donor penta position formula is
 * a PLACEHOLDER hash ((body+mind+heart)%5+1); group completion logic is real.
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const RUNNER = fileURLToPath(new URL('./penta-runner.py', import.meta.url));
const EPHEMERIS_DIR = fileURLToPath(new URL('../donors/recovered/synthai2-ephemeris/', import.meta.url));

export const PENTA_PROVIDER_ID = 'recovered:synthai2-penta-ephemeris';

export class PentaEphemerisService {
  constructor({ bus = null } = {}) {
    this.bus = bus;
    this.providerId = PENTA_PROVIDER_ID;
  }

  /**
   * Group penta for N members (real donor execution per member).
   * members: [{label?, birth_date:'YYYY-MM-DD', birth_time:'HH:MM', latitude?, longitude?}]
   */
  async groupPenta(members) {
    if (!Array.isArray(members) || members.length === 0) throw new TypeError('groupPenta: members required');
    let stdout;
    try {
      ({ stdout } = await execFileAsync('python3', [RUNNER, JSON.stringify({ members, ephemeris_path: EPHEMERIS_DIR })], { timeout: 30000 }));
    } catch (error) {
      const failure = { provider: PENTA_PROVIDER_ID, error: String(error?.stderr ?? error?.message ?? error), env: 'python3+pyephem' };
      this.bus?.emit('service:provider-failure', failure);
      const err = new Error(`penta ephemeris donor unavailable (${failure.error})`);
      err.providerFailure = failure;
      throw err;
    }
    const result = JSON.parse(stdout);
    if (result.error) {
      const failure = { provider: PENTA_PROVIDER_ID, error: result.error, env: 'python3+pyephem' };
      this.bus?.emit('service:provider-failure', failure);
      throw new Error(`penta ephemeris donor failed (${result.error})`);
    }
    return { provider: PENTA_PROVIDER_ID, ...result };
  }
}

export default PentaEphemerisService;

