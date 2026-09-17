'use client';

import { useState } from 'react';
import type { TokenInfo } from '@/lib/tokens';
import { CopyButton, bareInputClass } from './fields';

const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;
function isContractId(s: string): boolean {
  return CONTRACT_ID_RE.test(s.trim());
}

export default function TokenPicker({
  tokens,
  selectedId,
  onSelect,
}: {
  tokens: TokenInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  // A token is "preset" if it appears in TOKENS; otherwise the user typed it
  // into the Custom field.
  const presetMatch = tokens.find((t) => t.id === selectedId);
  const initialIsCustom = !!selectedId && !presetMatch;

  const [isCustom, setIsCustom] = useState(initialIsCustom);
  const [customInput, setCustomInput] = useState(initialIsCustom ? selectedId : '');

  const trimmedCustom = customInput.trim();
  const customValid = trimmedCustom === '' || isContractId(trimmedCustom);

  function selectPreset(id: string) {
    setIsCustom(false);
    setCustomInput('');
    onSelect(id);
  }

  function activateCustom() {
    setIsCustom(true);
    // Push the current input as the active token (empty until they type)
    onSelect(trimmedCustom && isContractId(trimmedCustom) ? trimmedCustom : '');
  }

  function onCustomChange(v: string) {
    setCustomInput(v);
    if (v.trim() === '' || isContractId(v.trim())) {
      onSelect(v.trim());
    } else {
      onSelect('');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tokens.map((t) => {
          const isSelected = !isCustom && t.id === selectedId;
          return (
            <button
              key={t.id || t.symbol}
              type="button"
              onClick={() => selectPreset(t.id)}
              className={
                'inline-flex items-center gap-2 sm:px-4 py-2 px-3 rounded-none border transition-colors ' +
                (isSelected
                  ? 'border-sand bg-sand/10 text-sand-bright'
                  : 'border-stroke text-cream hover:border-stroke-2 hover:text-cream')
              }
              aria-pressed={isSelected}
            >
              <span
                className={
                  'size-[8px] rounded-full ' + (t.glyphColor || 'bg-sand')
                }
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
                {t.symbol}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={activateCustom}
          className={
            'inline-flex items-center gap-2 sm:px-4 py-2 px-3 rounded-none border transition-colors ' +
            (isCustom
              ? 'border-sand bg-sand/10 text-sand-bright'
              : 'border-stroke text-cream-dim hover:border-stroke-2 hover:text-cream')
          }
          aria-pressed={isCustom}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            + Custom
          </span>
        </button>
      </div>

      {isCustom ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.16em] text-cream-dim mb-2">
              SEP-41 token contract id
            </label>
            <input
              type="text"
              value={customInput}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="C…"
              className={bareInputClass + ' font-mono'}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
            {!customValid && (
              <p className="mt-2 text-xs text-rose">
                Not a valid Stellar contract id (must be a 56-character C… strkey).
              </p>
            )}
            {customValid && trimmedCustom && (
              <p className="mt-2 text-xs text-success">
                Valid contract id — make sure your wallet and the recipient have a trustline if this is a classic-asset-backed SAC.
              </p>
            )}
          </div>
          <p className="text-xs text-cream-muted leading-relaxed">
            Paste the address of any SEP-41 compatible token deployed on this network.
          </p>
        </div>
      ) : (
        presetMatch && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim/80">
                SAC
              </span>
              <code className="font-mono text-xs text-cream-dim break-all">
                {presetMatch.id || '—'}
              </code>
              {presetMatch.id && <CopyButton text={presetMatch.id} />}
            </div>
            <p className="text-xs text-cream-muted leading-relaxed">
              {presetMatch.description}
            </p>
            {presetMatch.issuer && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream-dim/80">
                  Issuer
                </span>
                <code className="font-mono text-xs text-cream-dim break-all">
                  {presetMatch.issuer}
                </code>
                <CopyButton text={presetMatch.issuer} />
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
