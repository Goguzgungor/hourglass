// frontend/src/components/create/CsvImport.tsx
'use client';

import { useState } from 'react';
import type { Skipped } from '@/lib/create/rows';
import { ghostButtonClass } from './fields';

type Props = {
  onImport: (text: string) => void;
  lastImport?: { added: number; skipped: Skipped[] };
};

const REASON: Record<Skipped['reason'], string> = {
  header: 'header row',
  missing_amount: 'no amount',
  limit: 'over the 500-row limit',
};

export default function CsvImport({ onImport, lastImport }: Props) {
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  function importText() {
    if (!text.trim()) return;
    onImport(text);
    setText('');
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try {
      const content = await file.text();
      onImport(content);
    } catch {
      setFileError('Could not read that file.');
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="eyebrow text-cream-dim block mb-2">Paste rows</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={'GABC…,100\nGDEF…,250.5\n# one recipient per line: address, amount'}
          spellCheck={false}
          className="w-full bg-night/40 border border-stroke px-3 py-2 font-mono text-xs text-cream placeholder:text-cream-dim/50 outline-none focus:border-sand"
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={ghostButtonClass} onClick={importText} disabled={!text.trim()}>
          Add rows
        </button>
        <label className={ghostButtonClass + ' cursor-pointer'}>
          Upload .csv
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="text-[10px] text-cream-dim/70">Separators: comma, semicolon, tab or spaces. Extra columns are ignored.</span>
      </div>
      {fileError && <p className="text-xs text-danger">{fileError}</p>}
      {lastImport && (
        <p className="text-xs text-cream-dim">
          Added {lastImport.added} row{lastImport.added === 1 ? '' : 's'}
          {lastImport.skipped.length > 0 && (
            <>
              {' '}· skipped {lastImport.skipped.length}:{' '}
              {lastImport.skipped.slice(0, 8).map((s) => `line ${s.line} (${REASON[s.reason]})`).join(', ')}
              {lastImport.skipped.length > 8 ? ', …' : ''}
            </>
          )}
        </p>
      )}
    </div>
  );
}
