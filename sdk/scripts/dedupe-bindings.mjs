#!/usr/bin/env node
// Post-processes a stellar-cli generated bindings index.ts to remove duplicate
// `export const | type | interface | class | function` declarations that arise
// when a contract uses `contractimport!` to pull in another contract's spec.
//
// Why: the lockup contract embeds the comptroller spec via `contractimport!`,
// so its wasm contains both specs. `stellar contract bindings typescript`
// emits one TS declaration per spec entry, which produces duplicates for any
// type that's shared (Stream, Tranche, OpKind, Errors, ...) plus a
// definitional conflict for types of the same name but different shape
// (DataKey — comptroller's storage keys vs lockup's storage keys).
//
// Strategy: keep the LAST occurrence of each top-level declaration. The
// stellar-cli emits the host contract's own spec last, so the lockup's own
// definitions are preserved while the comptroller-flavored duplicates
// (including the unrelated `DataKey`) are dropped.
//
// Idempotent: safe to run repeatedly on the same file.

import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: dedupe-bindings.mjs <path/to/index.ts>');
  process.exit(2);
}

const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

// Find every top-level `export ...` declaration.
const declRe = /^export\s+(const|type|interface|class|function)\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
const decls = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(declRe);
  if (m) decls.push({ idx: i, name: m[2] });
}

// Map identifier -> index of its LAST occurrence in `decls`.
const lastIdx = new Map();
for (let j = 0; j < decls.length; j++) lastIdx.set(decls[j].name, j);

const toRemove = new Set();
let removedDecls = 0;

for (let j = 0; j < decls.length; j++) {
  if (lastIdx.get(decls[j].name) === j) continue; // keep last
  const d = decls[j];
  // Range to remove: from d.idx until just before the NEXT top-level decl
  // (or EOF), trimming any leading doc-comment block that belongs to the next
  // declaration.
  const nextIdx = (j + 1 < decls.length) ? decls[j + 1].idx : lines.length;
  let realEnd = nextIdx;
  // Walk back from nextIdx while we see content that belongs to the NEXT
  // decl's leading JSDoc / blank padding.
  let k = nextIdx - 1;
  while (k > d.idx) {
    const t = lines[k].trim();
    if (t === '' || t === '*/' || t.startsWith('*') || t.startsWith('/**') || t.startsWith('//')) {
      k--;
      continue;
    }
    break;
  }
  realEnd = k + 1;

  // Range start: also pull in any directly-preceding JSDoc /** ... */ block
  // that belongs to THIS decl.
  let realStart = d.idx;
  let s = d.idx - 1;
  while (s >= 0) {
    const t = lines[s].trim();
    if (t === '') { s--; continue; }
    if (t.endsWith('*/') || t.startsWith('*')) { s--; continue; }
    if (t.startsWith('/**')) { realStart = s; s--; break; }
    break;
  }
  // Guard against runaway upward consumption.
  if (d.idx - realStart > 60) realStart = d.idx;

  for (let i = realStart; i < realEnd; i++) toRemove.add(i);
  removedDecls++;
}

const out = lines.filter((_, i) => !toRemove.has(i)).join('\n');
fs.writeFileSync(file, out);
console.log(`deduped ${file}: removed ${removedDecls} duplicate decls (${toRemove.size} lines).`);
