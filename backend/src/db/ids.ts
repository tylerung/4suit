import { randomBytes } from 'node:crypto'

/**
 * Readable, sortable-ish ids in the same shape the seed data uses: a prefix,
 * the time, and enough randomness that two requests in the same millisecond —
 * on the same process or a different one — cannot collide.
 */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
}
