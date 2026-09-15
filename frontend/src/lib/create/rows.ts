//
// Batch recipient rows: parsing pasted/uploaded text into rows, validating
// rows against the current schedule, and summarising them for the UI.

import { formatStroops, isStellarAddress, parseXlmToStroops } from '@/lib/format';
import { buildSpec, type BuiltSpec, type Schedule } from './schedule';

export const MAX_ROWS_PER_RUN = 500;

export type RowInput = {
  id: string;
  recipient: string;
  amount: string;
  source: 'manual' | 'import';
  /** 1-based line number in the imported text (import rows only). */
  line?: number;
};

export type RowIssueCode =
  | 'invalid_address'
  | 'invalid_amount'
  | 'amount_not_positive'
  | 'amount_too_small'
  | 'duplicate_recipient'
  | 'self_recipient'
  | 'rounding_adjusted';

export type RowIssue = { level: 'error' | 'warning' | 'info'; code: RowIssueCode; message: string };

export type ValidatedRow = RowInput & {
  issues: RowIssue[];
  /** Parsed requested amount in stroops (when parseable and > 0). */
  total?: bigint;
  /** Built spec for the current schedule (when the schedule is valid and the amount fits). */
  built?: BuiltSpec;
};

export type Skipped = { line: number; reason: 'header' | 'missing_amount' | 'limit' };

function splitFields(line: string): string[] {
  let parts: string[];
  if (line.includes(',')) parts = line.split(',');
  else if (line.includes(';')) parts = line.split(';');
  else if (line.includes('\t')) parts = line.split('\t');
  else parts = line.split(/\s+/);
  return parts.map((p) => p.trim().replace(/^"(.*)"$/, '$1').trim());
}

/**
 * Parse `recipient, amount` lines. Ids are `r<startId>`, `r<startId+1>`, …
 * `existingCount` is the number of rows already in the table (for the cap).
 */
export function parseRows(
  text: string,
  startId: number,
  existingCount = 0,
): { rows: RowInput[]; skipped: Skipped[] } {
  const rows: RowInput[] = [];
  const skipped: Skipped[] = [];
  const lines = text.split(/\r\n|\n/);
  let nextId = startId;
  let firstKept = true;
  let total = existingCount;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const fields = splitFields(line);
    if (firstKept) {
      firstKept = false;
      if (!isStellarAddress(fields[0] ?? '')) {
        skipped.push({ line: lineNo, reason: 'header' });
        continue;
      }
    }
    if (fields.length < 2 || fields[1] === '') {
      skipped.push({ line: lineNo, reason: 'missing_amount' });
      continue;
    }
    if (total >= MAX_ROWS_PER_RUN) {
      skipped.push({ line: lineNo, reason: 'limit' });
      continue;
    }
    rows.push({ id: `r${nextId++}`, recipient: fields[0], amount: fields[1], source: 'import', line: lineNo });
    total++;
  }
  return { rows, skipped };
}

const err = (code: RowIssueCode, message: string): RowIssue => ({ level: 'error', code, message });
const warn = (code: RowIssueCode, message: string): RowIssue => ({ level: 'warning', code, message });

export function validateRows(
  rows: RowInput[],
  ctx: { sender: string | null; schedule: Schedule | null },
): ValidatedRow[] {
  // Pass 1: address / amount / spec issues per row (one parsing path).
  const pass1: ValidatedRow[] = rows.map((r) => {
    const issues: RowIssue[] = [];
    const recipient = r.recipient.trim();
    const amountStr = r.amount.trim();
    let total: bigint | undefined;
    let built: BuiltSpec | undefined;

    if (!isStellarAddress(recipient)) issues.push(err('invalid_address', 'Not a valid G… Stellar address.'));

    if (/\.\d{8,}/.test(amountStr)) {
      issues.push(err('invalid_amount', 'Not a valid amount (use up to 7 decimals, no separators).'));
    } else {
      try {
        const parsed = parseXlmToStroops(amountStr);
        if (parsed <= 0n) issues.push(err('amount_not_positive', 'Amount must be greater than 0.'));
        else total = parsed;
      } catch {
        issues.push(err('invalid_amount', 'Not a valid amount (use up to 7 decimals, no separators).'));
      }
    }

    if (total !== undefined && ctx.schedule) {
      try {
        built = buildSpec(ctx.schedule, total);
        if (built.adjustment < 0n) {
          issues.push({
            level: 'info',
            code: 'rounding_adjusted',
            message: `Adjusted ${formatStroops(built.adjustment)} to fit equal periods.`,
          });
        }
      } catch (e) {
        issues.push(err('amount_too_small', (e as Error).message));
      }
    }
    return { ...r, issues, total, built };
  });

  // Pass 2: duplicate / self warnings, only among rows that will actually be submitted.
  const isClean = (v: ValidatedRow) => !v.issues.some((i) => i.level === 'error');
  const counts = new Map<string, number>();
  for (const v of pass1) {
    if (!isClean(v)) continue;
    const k = v.recipient.trim();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return pass1.map((v) => {
    if (!isClean(v)) return v;
    const recipient = v.recipient.trim();
    const issues = [...v.issues];
    if ((counts.get(recipient) ?? 0) > 1) issues.push(warn('duplicate_recipient', 'This recipient appears more than once.'));
    if (ctx.sender && recipient === ctx.sender) issues.push(warn('self_recipient', 'You are streaming to yourself.'));
    return { ...v, issues };
  });
}

export function hasRowErrors(rows: ValidatedRow[]): boolean {
  return rows.some((r) => r.issues.some((i) => i.level === 'error'));
}

export function rowsSummary(rows: ValidatedRow[]): {
  count: number;
  valid: number;
  errors: number;
  warnings: number;
  total: bigint;
  adjustment: bigint;
} {
  let valid = 0;
  let errors = 0;
  let warnings = 0;
  let total = 0n;
  let adjustment = 0n;
  for (const r of rows) {
    const hasErr = r.issues.some((i) => i.level === 'error');
    if (hasErr) errors++;
    else valid++;
    if (r.issues.some((i) => i.level === 'warning')) warnings++;
    if (hasErr) continue;
    if (r.built) {
      total += r.built.deposited;
      adjustment += r.built.adjustment;
    } else if (r.total !== undefined) {
      total += r.total;
    }
  }
  return { count: rows.length, valid, errors, warnings, total, adjustment };
}
