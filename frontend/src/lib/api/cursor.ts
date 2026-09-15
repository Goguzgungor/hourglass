// Opaque, tamper-tolerant pagination cursors: base64url(JSON). Shape is
// checked with a guard on decode; anything malformed is a 400.

import { ParamError } from './params';

export type StreamsCursor = { k: number; id: number };
export type HistoryCursor = { ts: number; log_index: number; id: string };

export function encodeCursor(obj: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

export function decodeCursor<T>(
  raw: string | null | undefined,
  guard: (v: unknown) => v is T,
): T | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ParamError('cursor is malformed');
  }
  if (!guard(parsed)) throw new ParamError('cursor is malformed');
  return parsed;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function isStreamsCursor(v: unknown): v is StreamsCursor {
  return (
    isObj(v) &&
    typeof v.k === 'number' && Number.isFinite(v.k) &&
    typeof v.id === 'number' && Number.isInteger(v.id)
  );
}

export function isHistoryCursor(v: unknown): v is HistoryCursor {
  return (
    isObj(v) &&
    typeof v.ts === 'number' && Number.isFinite(v.ts) &&
    typeof v.log_index === 'number' && Number.isInteger(v.log_index) &&
    typeof v.id === 'string' && /^[0-9a-f]{24}$/.test(v.id)
  );
}
