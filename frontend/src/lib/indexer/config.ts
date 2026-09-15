// Environment parsing for the indexer runner. Kept pure so the runner's
// configuration is unit-testable and a typo'd env var degrades to the default
// instead of poisoning the loop with NaN (`setTimeout(NaN)` fires immediately,
// and a NaN page limit makes the RPC request invalid).

/**
 * Read a positive integer from the environment.
 *
 * Returns `def` for an unset/empty value, anything that is not a run of
 * decimal digits (`-1`, `3.5`, `abc`, `10s`), and any value below 1 — every
 * knob using this is a count or a millisecond interval where 0 is never
 * meaningful.
 */
export function envInt(name: string, def: number, raw: string | undefined = process.env[name]): number {
  if (raw === undefined || raw === '') return def;
  if (!/^\d+$/.test(raw)) return def;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : def;
}
