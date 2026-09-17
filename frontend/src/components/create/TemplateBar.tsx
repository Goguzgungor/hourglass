// frontend/src/components/create/TemplateBar.tsx
'use client';

import { useState } from 'react';
import type { Template } from '@/lib/create/templates';
import { ghostButtonClass } from './fields';

type Props = {
  builtIn: readonly Template[];
  user: Template[];
  selectedId: string | null;
  dirty: boolean;
  canSave: boolean;
  onApply: (id: string) => void;
  onClear: () => void;
  /** Save the current form as a new template with this name. */
  onSaveNew: (name: string) => string | null; // returns an error message or null
  /** Overwrite the selected user template's schedule/flags with the current form. */
  onUpdate: () => string | null;
  onRename: (id: string, name: string) => string | null;
  onDelete: (id: string) => void;
};

export default function TemplateBar({ builtIn, user, selectedId, dirty, canSave, onApply, onClear, onSaveNew, onUpdate, onRename, onDelete }: Props) {
  const [prompt, setPrompt] = useState<null | 'save' | 'rename'>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = selectedId ? (builtIn.find((t) => t.id === selectedId) ?? user.find((t) => t.id === selectedId)) : undefined;
  const selectedIsUser = !!selected && !selected.builtIn;
  const label = selected ? (dirty ? `Custom (based on ${selected.name})` : selected.name) : 'Custom';

  function openPrompt(kind: 'save' | 'rename') {
    setPrompt(kind);
    setName(kind === 'rename' && selected ? selected.name : '');
    setError(null);
  }
  function submitPrompt() {
    const err = prompt === 'rename' && selected ? onRename(selected.id, name) : onSaveNew(name);
    if (err) {
      setError(err);
      return;
    }
    setPrompt(null);
    setName('');
  }

  return (
    <div className="border border-stroke bg-night/40 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow text-cream-dim">· Template</span>
        <select
          value={selected && !dirty ? selected.id : ''}
          onChange={(e) => (e.target.value ? onApply(e.target.value) : onClear())}
          aria-label="Template"
          className="bg-transparent border-b border-stroke text-cream font-mono text-xs py-1 outline-none focus:border-sand min-w-[220px]"
        >
          <option value="">{selected ? label : 'Custom'}</option>
          <optgroup label="Presets">
            {builtIn.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
          {user.length > 0 && (
            <optgroup label="Your templates">
              {user.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="flex flex-wrap items-center gap-4 ml-auto">
          {selectedIsUser && dirty && (
            <button type="button" className={ghostButtonClass} disabled={!canSave} onClick={() => setError(onUpdate())}>
              Update “{selected?.name}”
            </button>
          )}
          <button
            type="button"
            className={ghostButtonClass}
            disabled={!canSave}
            title={canSave ? undefined : 'Storage is unavailable in this browser'}
            onClick={() => openPrompt('save')}
          >
            Save as template
          </button>
          {selectedIsUser && (
            <>
              <button type="button" className={ghostButtonClass} disabled={!canSave} onClick={() => openPrompt('rename')}>
                Rename
              </button>
              <button type="button" className={ghostButtonClass} disabled={!canSave} onClick={() => selected && onDelete(selected.id)}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {prompt && (
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitPrompt();
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Template name"
            autoFocus
            className="flex-1 min-w-[180px] bg-transparent border-b border-stroke text-cream font-mono text-xs py-1 outline-none focus:border-sand"
          />
          <button type="submit" className={ghostButtonClass}>
            {prompt === 'rename' ? 'Rename' : 'Save'}
          </button>
          <button type="button" className={ghostButtonClass} onClick={() => setPrompt(null)}>
            Cancel
          </button>
        </form>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
