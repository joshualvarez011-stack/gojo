import { randomInt } from 'node:crypto';
// Public six-digit human reference. Authorization always requires the long private link token.
export function confirmationCode() {
  return `GJ-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}
