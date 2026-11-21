/**
 * Standard server-action return contract. Every action returns this shape:
 * `ok` is the discriminator — always check it before touching data fields
 * or `error`. Data fields sit at the top level of the success branch.
 */
export type ActionResult<T extends object = object> =
  | ({ ok: true; error?: undefined } & T)
  | { ok: false; error: string };

export function ok<T extends object>(data: T): ActionResult<T> {
  return { ok: true, ...data } as ActionResult<T>;
}

export function okVoid(): ActionResult {
  return { ok: true };
}

export function err(message: string): ActionResult<never> {
  return { ok: false, error: message };
}
