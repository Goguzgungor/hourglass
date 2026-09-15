// frontend/src/lib/create/useTemplates.ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { safeStorage } from './storage';
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
  const storage = useMemo(() => safeStorage('local'), []);
  // Loaded after mount so server and client render the same first frame.
  const [user, setUser] = useState<Template[]>([]);
  const refresh = useCallback(() => setUser(loadUserTemplates(storage)), [storage]);
  useEffect(() => {
    refresh();
  }, [refresh]);

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
