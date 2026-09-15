// frontend/src/lib/create/useTemplates.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { safeStorage, type StorageLike } from './storage';
import {
  BUILT_IN_TEMPLATES,
  deleteUserTemplate,
  loadUserTemplates,
  newTemplateId,
  renameUserTemplate,
  saveUserTemplate,
  type SaveResult,
  type Template,
} from './templates';

export type TemplateDraft = Omit<Template, 'id' | 'builtIn' | 'createdAt'> & { id?: string };

export function useTemplates() {
  // Storage and user templates are resolved after mount so the server frame and
  // the client's hydration frame are identical (canSave=false, user=[]).
  const [storage, setStorage] = useState<StorageLike | null>(null);
  const [user, setUser] = useState<Template[]>([]);
  useEffect(() => {
    const s = safeStorage('local');
    setStorage(s);
    setUser(loadUserTemplates(s));
  }, []);
  const refresh = useCallback(() => setUser(loadUserTemplates(storage)), [storage]);

  const save = useCallback(
    (draft: TemplateDraft, nowSec: number): SaveResult => {
      const res = saveUserTemplate(storage, { ...draft, id: draft.id ?? newTemplateId(), builtIn: false, createdAt: nowSec });
      if (res.ok) refresh();
      return res;
    },
    [storage, refresh],
  );
  const rename = useCallback(
    (id: string, name: string): SaveResult => {
      const res = renameUserTemplate(storage, id, name);
      if (res.ok) refresh();
      return res;
    },
    [storage, refresh],
  );
  const remove = useCallback(
    (id: string): boolean => {
      const ok = deleteUserTemplate(storage, id);
      if (ok) refresh();
      return ok;
    },
    [storage, refresh],
  );

  return { builtIn: BUILT_IN_TEMPLATES, user, canSave: storage !== null, save, rename, remove };
}
