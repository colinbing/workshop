import type { WorkbenchDoc } from './types';

const STORAGE_KEY = 'workbench:doc';

export function loadDoc(): WorkbenchDoc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkbenchDoc) : null;
  } catch {
    return null;
  }
}

export function saveDoc(doc: WorkbenchDoc) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}
