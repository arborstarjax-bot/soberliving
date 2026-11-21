/**
 * Standard server-action return contract. New actions must return this;
 * legacy `{ error?: string }` actions are migrated module-by-module.
 *
 * `ok` is the discriminator — always check it before touching `data`.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function okVoid(): ActionResult {
  return { ok: true, data: undefined };
}

export function err(message: string): ActionResult<never> {
  return { ok: false, error: message };
}
