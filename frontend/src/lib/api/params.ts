// Small query-parameter validators for the API routes. Every failure is a
// ParamError, which routes translate into a 400.

export class ParamError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ParamError';
  }
}

const STRKEY = /^[GC][A-Z2-7]{55}$/;

export function optAddress(
  sp: URLSearchParams,
  name: string,
  kind: 'G' | 'C',
): string | undefined {
  const v = sp.get(name);
  if (v === null || v === '') return undefined;
  if (!STRKEY.test(v) || v[0] !== kind) {
    throw new ParamError(`${name} must be a ${kind}… Stellar address`);
  }
  return v;
}

export function optEnum<T extends string>(
  sp: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const v = sp.get(name);
  if (v === null || v === '') return undefined;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new ParamError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return v as T;
}

export function optEnumList<T extends string>(
  sp: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T[] | undefined {
  const v = sp.get(name);
  if (v === null || v === '') return undefined;
  const out: T[] = [];
  for (const part of v.split(',')) {
    const p = part.trim();
    if (p === '') continue;
    if (!(allowed as readonly string[]).includes(p)) {
      throw new ParamError(`${name} must be a comma list of ${allowed.join(', ')}`);
    }
    if (!out.includes(p as T)) out.push(p as T);
  }
  return out;
}

export function optInt(
  sp: URLSearchParams,
  name: string,
  o: { min: number; max: number; def: number },
): number {
  const v = sp.get(name);
  if (v === null || v === '') return o.def;
  if (!/^\d+$/.test(v)) throw new ParamError(`${name} must be an integer`);
  const n = Number.parseInt(v, 10);
  if (n < o.min) throw new ParamError(`${name} must be >= ${o.min}`);
  return Math.min(n, o.max);
}
