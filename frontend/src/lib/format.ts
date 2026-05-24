// Small formatting helpers used across the create/stream pages.

/** Number of decimals for Stellar's native XLM (and the SAC). */
export const STROOP_DECIMALS = 7;
const STROOP_FACTOR = 10n ** BigInt(STROOP_DECIMALS);

/** Format a stroops amount as a human XLM string (7 decimals, trimmed). */
export function formatStroops(stroops: bigint | number | string): string {
  const v = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / STROOP_FACTOR;
  const frac = abs % STROOP_FACTOR;
  const fracStr = frac.toString().padStart(STROOP_DECIMALS, '0');
  // Trim trailing zeros but keep at least one decimal.
  const fracTrimmed = fracStr.replace(/0+$/, '') || '0';
  return `${neg ? '-' : ''}${whole.toString()}.${fracTrimmed}`;
}

/** Parse a human XLM string (e.g. "1.5") to a bigint in stroops. */
export function parseXlmToStroops(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) return 0n;
  if (!/^-?\d*\.?\d*$/.test(trimmed)) {
    throw new Error(`Not a valid number: ${input}`);
  }
  const neg = trimmed.startsWith('-');
  const body = neg ? trimmed.slice(1) : trimmed;
  const [wholeStr = '0', fracRaw = ''] = body.split('.');
  const frac = (fracRaw + '0'.repeat(STROOP_DECIMALS)).slice(0, STROOP_DECIMALS);
  const total = BigInt(wholeStr || '0') * STROOP_FACTOR + BigInt(frac || '0');
  return neg ? -total : total;
}

/** Truncate a Stellar G… address: first 4 + last 4 chars. */
export function truncAddress(addr: string | null | undefined): string {
  if (!addr) return '';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/** True iff `value` looks like a Stellar account strkey (G…, 56 chars). */
export function isStellarAddress(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}

/** Format a unix timestamp (seconds) as a short local datetime. */
export function formatTimestamp(ts: number | bigint): string {
  const ms = Number(ts) * 1000;
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format a duration in seconds as "1h 23m" / "45s" / "2d 4h". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return remS ? `${m}m ${remS}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}

/** Convert a `datetime-local` input value (no TZ suffix) to a unix second. */
export function datetimeLocalToUnix(value: string): number {
  // `<input type="datetime-local">` returns "YYYY-MM-DDTHH:MM" in local TZ.
  if (!value) return 0;
  const d = new Date(value);
  return Math.floor(d.getTime() / 1000);
}

/** Inverse of `datetimeLocalToUnix` for default values. */
export function unixToDatetimeLocal(unix: number): string {
  const d = new Date(unix * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
