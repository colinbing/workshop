import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureStatus, WorkbenchDoc } from './types';
import { loadDoc, saveDoc } from './storage';

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function now() {
  return Date.now();
}

function seedDoc(): WorkbenchDoc {
  const phase1 = { id: uid('phase'), name: 'Phase 1', order: 1 };
  const phase2 = { id: uid('phase'), name: 'Phase 2', order: 2 };

  const features: Feature[] = [
    {
      id: uid('feat'),
      title: 'Feature list MVP',
      description: 'Render features, filter, reorder, quick edit.',
      status: 'in_progress',
      phaseId: phase1.id,
      tags: ['core', 'mvp'],
      order: 1,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Keyboard shortcuts',
      description: 'CMD+N new, CMD+E edit, arrows to select.',
      status: 'not_started',
      phaseId: phase1.id,
      tags: ['ux'],
      order: 2,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Phase “from space” view',
      description: 'Read-only grouped overview by phase.',
      status: 'not_started',
      phaseId: phase2.id,
      tags: ['projection'],
      order: 3,
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  return {
    version: 1,
    title: 'Workbench',
    phases: [phase1, phase2],
    features,
  };
}

const STATUS_LABEL: Record<FeatureStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
};

export default function App() {
  const [doc, setDoc] = useState<WorkbenchDoc>(() => loadDoc() ?? seedDoc());

  // Persist on any change (good enough for now).
  useEffect(() => {
    saveDoc(doc);
  }, [doc]);

  const phasesById = useMemo(() => {
    return new Map(doc.phases.map((p) => [p.id, p]));
  }, [doc.phases]);

  const orderedFeatures = useMemo(() => {
    return [...doc.features].sort((a, b) => a.order - b.order);
  }, [doc.features]);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Workbench</h1>
        <div style={{ opacity: 0.6, fontSize: 13 }}>
          {doc.features.length} feature{doc.features.length === 1 ? '' : 's'} • autosaved
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', g
