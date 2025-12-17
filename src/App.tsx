import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, FeatureStatus, Phase, WorkbenchDoc } from './types';
import { loadDoc, saveDoc } from './storage';

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
const now = () => Date.now();

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

  return { version: 1, title: 'Workbench', phases: [phase1, phase2], features };
}

const STATUS_META: Record<
  FeatureStatus,
  { label: string; bar: string; chipBg: string; chipBorder: string; chipText: string }
> = {
  not_started: {
    label: 'Not started',
    bar: 'linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))',
    chipBg: 'rgba(255,255,255,0.06)',
    chipBorder: 'rgba(255,255,255,0.10)',
    chipText: 'rgba(255,255,255,0.82)',
  },
  in_progress: {
    label: 'In progress',
    bar: 'linear-gradient(90deg, rgba(88,166,255,0.55), rgba(88,166,255,0.10))',
    chipBg: 'rgba(88,166,255,0.14)',
    chipBorder: 'rgba(88,166,255,0.30)',
    chipText: 'rgba(210,235,255,0.92)',
  },
  done: {
    label: 'Done',
    bar: 'linear-gradient(90deg, rgba(63,185,120,0.55), rgba(63,185,120,0.10))',
    chipBg: 'rgba(63,185,120,0.14)',
    chipBorder: 'rgba(63,185,120,0.32)',
    chipText: 'rgba(210,255,230,0.92)',
  },
  blocked: {
    label: 'Blocked',
    bar: 'linear-gradient(90deg, rgba(255,99,99,0.55), rgba(255,99,99,0.10))',
    chipBg: 'rgba(255,99,99,0.14)',
    chipBorder: 'rgba(255,99,99,0.32)',
    chipText: 'rgba(255,220,220,0.92)',
  },
};

type CtxTarget =
  | { kind: 'feature'; id: string }
  | { kind: 'background' };

type CtxMenuState = {
  open: boolean;
  x: number;
  y: number;
  target: CtxTarget;
};

const STATUS_OPTIONS: Array<{ value: FeatureStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'not_started', label: STATUS_META.not_started.label },
  { value: 'in_progress', label: STATUS_META.in_progress.label },
  { value: 'done', label: STATUS_META.done.label },
  { value: 'blocked', label: STATUS_META.blocked.label },
];

function nextOrder(doc: WorkbenchDoc) {
  const max = doc.features.reduce((m, f) => Math.max(m, f.order), 0);
  return max + 1;
}

function firstPhaseId(phases: Phase[]) {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  return sorted[0]?.id ?? '';
}

export default function App() {
  const [doc, setDoc] = useState<WorkbenchDoc>(() => loadDoc() ?? seedDoc());

  // Filters
  const ALL_STATUSES: FeatureStatus[] = ['not_started', 'in_progress', 'blocked', 'done'];
  const [statusFilter, setStatusFilter] = useState<Set<FeatureStatus>>(() => new Set(ALL_STATUSES));
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [tagQuery, setTagQuery] = useState<string>('');

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState>({
    open: false,
    x: 0,
    y: 0,
    target: { kind: 'background' },
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [insertAfter, setInsertAfter] = useState<boolean>(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftDescription, setDraftDescription] = useState<string>('');
  const [draftTags, setDraftTags] = useState<string>('');
  const [draftPhaseId, setDraftPhaseId] = useState<string>('');
  const [draftStatus, setDraftStatus] = useState<FeatureStatus>('not_started');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [statusPopover, setStatusPopover] = useState<{
    open: boolean;
    featureId: string | null;
    x: number;
    y: number;
  }>({ open: false, featureId: null, x: 0, y: 0 });

  // For focusing after create
  const scrollToIdRef = useRef<string | null>(null);
  const editorTitleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveDoc(doc);
  }, [doc]);

  const phasesById = useMemo(() => new Map(doc.phases.map((p) => [p.id, p])), [doc.phases]);

  const orderedFeatures = useMemo(() => {
    return [...doc.features].sort((a, b) => a.order - b.order);
  }, [doc.features]);

  const filteredFeatures = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return orderedFeatures.filter((f) => {
      if (!statusFilter.has(f.status)) return false;
      if (phaseFilter !== 'all' && f.phaseId !== phaseFilter) return false;
      if (!q) return true;

      // match tags OR title OR description (loose but useful)
      const tagMatch = f.tags.some((t) => t.toLowerCase().includes(q));
      const titleMatch = f.title.toLowerCase().includes(q);
      const descMatch = f.description.toLowerCase().includes(q);
      return tagMatch || titleMatch || descMatch;
    });
  }, [orderedFeatures, statusFilter, phaseFilter, tagQuery]);

  // Keep selection valid under filters
  useEffect(() => {
    if (!filteredFeatures.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && filteredFeatures.some((f) => f.id === selectedId)) return;

    setSelectedId(filteredFeatures[0].id);
  }, [filteredFeatures, selectedId]);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditorOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeEditor();
        }
        return;
      }

      // Arrow selection (avoid hijacking when typing in an input)
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target as HTMLElement).isContentEditable);

      if (isTyping) return;

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createFeatureAtEnd();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredFeatures, selectedId, doc, isEditorOpen]);

  function moveSelection(delta: number) {
    if (!filteredFeatures.length) return;
    const idx = filteredFeatures.findIndex((f) => f.id === selectedId);
    const nextIdx = Math.max(0, Math.min(filteredFeatures.length - 1, (idx === -1 ? 0 : idx) + delta));
    const next = filteredFeatures[nextIdx];
    if (!next) return;
    setSelectedId(next.id);
    scrollToIdRef.current = next.id;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-feature-id="${next.id}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function closeCtxMenu() {
    setCtxMenu((s) => ({ ...s, open: false }));
  }

  function openCtxMenu(e: React.MouseEvent, target: CtxTarget) {
    e.preventDefault(); // blocks the browser right-click menu
    setCtxMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      target,
    });
  }

function createFeatureAtEnd() {
  setDoc((prev) => {
    const phaseId = firstPhaseId(prev.phases);
    const f: Feature = {
      id: uid('feat'),
      title: 'New feature',
      description: '',
      status: 'not_started',
      phaseId,
      tags: [],
      order: nextOrder(prev),
      createdAt: now(),
      updatedAt: now(),
    };
    return { ...prev, features: [...prev.features, f] };
  });
}

function deleteFeature(id: string) {
  setDoc((prev) => ({ ...prev, features: prev.features.filter((f) => f.id !== id) }));
  if (selectedId === id) setSelectedId(null);
}

function cloneFeature(id: string) {
  setDoc((prev) => {
    const src = prev.features.find((f) => f.id === id);
    if (!src) return prev;
    const copy: Feature = {
      ...src,
      id: uid('feat'),
      title: `${src.title} (copy)`,
      order: nextOrder(prev),
      createdAt: now(),
      updatedAt: now(),
    };
    return { ...prev, features: [...prev.features, copy] };
  });
}

  function setStatus(id: string, status: FeatureStatus) {
    setDoc((prev) => ({
      ...prev,
      features: prev.features.map((f) => (f.id === id ? { ...f, status, updatedAt: now() } : f)),
    }));
  }
  function closeStatusPopover() {
    setStatusPopover({ open: false, featureId: null, x: 0, y: 0 });
  }

function reorderVisibleFeatures(drag: string, over: string, after: boolean) {
  if (drag === over) return;
  const visible = [...filteredFeatures];
  const dragIdx = visible.findIndex((f) => f.id === drag);
  const overIdx = visible.findIndex((f) => f.id === over);
  if (dragIdx === -1 || overIdx === -1) return;

  const [item] = visible.splice(dragIdx, 1);
  let targetIdx = visible.findIndex((f) => f.id === over);
  if (targetIdx === -1 || !item) return;
  if (after) targetIdx += 1;
  visible.splice(targetIdx, 0, item);

  const visibleIds = visible.map((f) => f.id);

  setDoc((prev) => {
    const nonVisible = prev.features.filter((f) => !visibleIds.includes(f.id));
    const merged = [...visible, ...nonVisible];
    const reOrdered = merged.map((f, idx) => ({ ...f, order: idx + 1 }));
    return { ...prev, features: reOrdered };
  });
}

function closeEditor() {
  setIsEditorOpen(false);
  setEditorId(null);
}

function openEditor(id: string) {
  const feature = doc.features.find((f) => f.id === id);
  if (!feature) return;
  setEditorId(id);
  setDraftTitle(feature.title);
  setDraftDescription(feature.description);
  setDraftTags(feature.tags.join(', '));
  setDraftPhaseId(feature.phaseId);
  setDraftStatus(feature.status);
  setIsEditorOpen(true);
}

function saveEditor() {
  if (!editorId) return;
  setDoc((prev) => ({
    ...prev,
    features: prev.features.map((f) =>
      f.id === editorId
        ? {
            ...f,
            title: draftTitle,
            description: draftDescription,
            tags: draftTags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            phaseId: draftPhaseId,
            status: draftStatus,
            updatedAt: now(),
          }
        : f
    ),
  }));
  closeEditor();
}

useEffect(() => {
  if (!isEditorOpen) return;
  requestAnimationFrame(() => {
    editorTitleRef.current?.focus();
    editorTitleRef.current?.select();
  });
}, [isEditorOpen]);


  // After doc changes, if nothing selected, select newest feature (max order)
  useEffect(() => {
    if (doc.features.length === 0) return;
    if (selectedId) return;

    const newest = [...doc.features].sort((a, b) => b.order - a.order)[0];
    if (newest) setSelectedId(newest.id);
  }, [doc.features, selectedId]);

  // Pretty minimal styling
  const pageStyle: React.CSSProperties = {
    padding: 16,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    color: 'inherit',
    height: '100vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  const toolbarStyle: React.CSSProperties = {
    marginTop: 12,
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid rgba(127,127,127,0.28)',
    background: 'transparent',
    color: 'inherit',
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid rgba(127,127,127,0.28)',
    background: 'rgba(127,127,127,0.08)',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
  };
  const cardBase: React.CSSProperties = {
    boxSizing: 'border-box',
    maxWidth: '100%',
    width: '100%',
    display: 'inline-block',
    breakInside: 'avoid',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.075)',
    outline: 'none',
    background: 'rgba(255,255,255,0.03)',
    boxShadow: '0 8px 22px rgba(0,0,0,0.20)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    transition:
      'transform 160ms ease, box-shadow 200ms ease, background 200ms ease, border-color 200ms ease',
  };

  const cardHover: React.CSSProperties = {
    transform: 'translateY(-2px)',
    boxShadow: '0 14px 34px rgba(0,0,0,0.28)',
    background: 'rgba(255,255,255,0.045)',
  };

  const cardActive: React.CSSProperties = {
    transform: 'translateY(-1px) scale(0.998)',
    boxShadow: '0 12px 28px rgba(0,0,0,0.26)',
  };

  const cardSelected: React.CSSProperties = {};

  const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.82)',
  };
  const chipMuted: React.CSSProperties = {
    ...chip,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.72)',
  };
  const statusChipBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };
  const noStatusSelected = statusFilter.size === 0;

  return (
    <div
      style={pageStyle}
      onContextMenu={(e) => {
        const targetEl = e.target as HTMLElement | null;
        if (targetEl?.closest('[data-feature-id]')) return;
        openCtxMenu(e, { kind: 'background' });
      }}
    >
      <div style={{ flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ margin: 0 }}>Workbench</h1>
          <div style={{ opacity: 0.6, fontSize: 13 }}>
            {doc.features.length} feature{doc.features.length === 1 ? '' : 's'} • autosaved
          </div>
        </div>

        <div style={toolbarStyle}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {ALL_STATUSES.map((s) => {
            const active = statusFilter.has(s);
            const meta = STATUS_META[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() =>
                  setStatusFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
                style={{
                  ...statusChipBase,
                  border: `1px solid ${active ? meta.chipBorder : 'rgba(255,255,255,0.12)'}`,
                  background: active ? meta.chipBg : statusChipBase.background,
                  color: active ? meta.chipText : statusChipBase.color,
                }}
              >
                {meta.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setStatusFilter(new Set(ALL_STATUSES))}
            style={{
              ...statusChipBase,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter(new Set())}
            style={{
              ...statusChipBase,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            None
          </button>
        </div>

          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            style={inputStyle}
            aria-label="Phase filter"
          >
            <option value="all">All phases</option>
            {[...doc.phases]
              .sort((a, b) => a.order - b.order)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>

          <input
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="Search tags/title/notes…"
            style={{ ...inputStyle, minWidth: 220 }}
            aria-label="Search"
          />

          <div style={{ flex: 1 }} />

          <button onClick={createFeatureAtEnd} style={buttonStyle} title="N">
            + New
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          maxWidth: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          padding: 0,
        }}
      >
        <div
          style={{
            height: '100%',
            columnWidth: 300,
            columnGap: 12,
            columnFill: 'auto',
            width: '100%',
            maxWidth: '100%',
            paddingRight: 12,
          }}
        >
          {(() => {
            const visible = filteredFeatures;
            const dragIndex = dragId ? visible.findIndex((v) => v.id === dragId) : -1;
            const overIndexBase = overId ? visible.findIndex((v) => v.id === overId) : -1;
            const targetIndex = overIndexBase === -1 ? null : overIndexBase + (insertAfter ? 1 : 0);

            return visible.map((f) => {
              const meta = STATUS_META[f.status];
              const phaseName = phasesById.get(f.phaseId)?.name ?? 'Unknown phase';
              const isSelected = f.id === selectedId;
              const computedBorderColor =
                hoverId === f.id || dragId === f.id ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.075)';

              const index = visible.findIndex((v) => v.id === f.id);
              const effectiveTarget = dragOverIndex !== null ? dragOverIndex : targetIndex;
              let shift: string | undefined;
              if (dragId && effectiveTarget !== null && dragIndex !== -1 && index !== -1) {
                if (effectiveTarget > dragIndex && index > dragIndex && index < effectiveTarget) {
                  shift = 'translateY(-12px)';
                } else if (effectiveTarget < dragIndex && index >= effectiveTarget && index < dragIndex) {
                  shift = 'translateY(12px)';
                }
              }
              const baseTransform =
                activeId === f.id || dragId === f.id
                  ? cardActive.transform
                  : hoverId === f.id
                    ? cardHover.transform
                    : undefined;
              const transform = shift ?? baseTransform;

              return (
                <div
                  key={f.id}
                  data-feature-id={f.id}
                  onClick={() => {
                    setHoverId(null);
                    setOverId(null);
                    setInsertAfter(false);
                    setDragId(null);
                    setSelectedId(f.id);
                  }}
                  onDoubleClick={() => openEditor(f.id)}
                  onMouseEnter={() => setHoverId(f.id)}
                  onMouseLeave={() => {
                    setHoverId(null);
                    setActiveId(null);
                    setOverId(null);
                    setInsertAfter(false);
                    setDragOverIndex(null);
                  }}
                  onMouseDown={() => setActiveId(f.id)}
                  onMouseUp={() => setActiveId(null)}
                  onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const after = e.clientY > rect.top + rect.height / 2;
                    setOverId(f.id);
                    setInsertAfter(after);
                    const overIdx = visible.findIndex((v) => v.id === f.id);
                    const targetIdx = overIdx === -1 ? null : overIdx + (after ? 1 : 0);
                    setDragOverIndex(targetIdx);
                  }}
                  onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                    e.preventDefault();
                    if (!dragId) return;
                    reorderVisibleFeatures(dragId, f.id, insertAfter);
                    setDragId(null);
                    setOverId(null);
                    setInsertAfter(false);
                    setDragOverIndex(null);
                  }}
                  onContextMenu={(e) => openCtxMenu(e, { kind: 'feature', id: f.id })}
                  style={{
                    ...cardBase,
                    ...(hoverId === f.id ? cardHover : null),
                    ...(activeId === f.id || dragId === f.id ? cardActive : null),
                    ...(isSelected ? cardSelected : null),
                    borderColor: computedBorderColor,
                    cursor: 'default',
                    marginBottom: 10,
                    opacity: dragId === f.id ? 0.55 : 1,
                    position: 'relative',
                    boxShadow:
                      dragId && overId === f.id
                        ? insertAfter
                          ? '0 2px 0 0 rgba(160,210,255,0.9) inset'
                          : '0 -2px 0 0 rgba(160,210,255,0.9) inset'
                        : undefined,
                    transform,
                    transition:
                      'transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms ease, background 200ms ease, border-color 200ms ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 12px',
                      borderTopLeftRadius: 12,
                      borderTopRightRadius: 12,
                      background: meta.bar,
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      draggable
                      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                        setDragId(f.id);
                        setOverId(f.id);
                        setInsertAfter(false);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverId(null);
                        setInsertAfter(false);
                        setDragOverIndex(null);
                      }}
                      style={{
                        cursor: dragId === f.id ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        opacity: 0.75,
                        fontSize: 15,
                        lineHeight: 1,
                        padding: 0,
                        borderRadius: 0,
                        transform: 'translateY(-0.5px)',
                      }}
                      aria-label="Drag"
                      title="Drag"
                    >
                      ⋮⋮
                    </div>
                    <div style={{ fontWeight: 750, flex: 1, letterSpacing: 0.1, fontSize: 16, lineHeight: 1.2 }}>
                      {f.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: meta.chipBg,
                        border: `1px solid ${meta.chipBorder}`,
                        color: meta.chipText,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setStatusPopover({ open: true, featureId: f.id, x: r.left + r.width, y: r.top + r.height });
                      }}
                    >
                      {meta.label}
                    </div>
                  </div>

                  <div style={{ padding: '10px 12px 12px' }}>
                    {f.description ? (
                      <div style={{ marginTop: 0, opacity: 0.85, fontSize: 14, lineHeight: 1.35 }}>
                        {f.description}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, opacity: 0.92 }}>
                      <span style={chipMuted}>{phaseName}</span>
                      {f.tags.length ? <span style={chip}>{f.tags.join(', ')}</span> : null}
                    </div>
                  </div>
                </div>
              );
            });
          })()}

          {!filteredFeatures.length ? (
            <div style={{ opacity: 0.65, fontSize: 14, paddingTop: 12 }}>
              {noStatusSelected ? 'Select a status to see features.' : 'No features match your filters.'}
            </div>
          ) : null}
        </div>
      </div>
      {statusPopover.open && statusPopover.featureId ? (
        <div
          onMouseDown={() => closeStatusPopover()}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10020,
            background: 'rgba(0,0,0,0.02)',
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: statusPopover.y,
              left: statusPopover.x,
              background: 'rgba(24,24,24,0.94)',
              color: '#f5f5f5',
              borderRadius: 10,
              padding: 8,
              minWidth: 160,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 14px 32px rgba(0,0,0,0.38)',
              display: 'grid',
              gap: 6,
            }}
          >
            {(['not_started', 'in_progress', 'done', 'blocked'] as FeatureStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(statusPopover.featureId!, s);
                  closeStatusPopover();
                }}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  color: 'inherit',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {ctxMenu.open && !isEditorOpen ? (
        <div
          onMouseDown={closeCtxMenu}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.05)',
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: ctxMenu.y,
              left: ctxMenu.x,
              background: 'rgba(24,24,24,0.92)',
              color: '#f5f5f5',
              borderRadius: 10,
              padding: 8,
              minWidth: 180,
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
              display: 'grid',
              gap: 4,
            }}
          >
            {ctxMenu.target.kind === 'background' ? (
              <button
                type="button"
                onClick={() => {
                  createFeatureAtEnd();
                  closeCtxMenu();
                }}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  color: 'inherit',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                New feature
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (ctxMenu.target.kind !== 'feature') return;
                    const id = ctxMenu.target.id;
                    openEditor(id);
                    closeCtxMenu();
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Edit…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (ctxMenu.target.kind !== 'feature') return;
                    const id = ctxMenu.target.id;
                    cloneFeature(id);
                    closeCtxMenu();
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Clone
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (ctxMenu.target.kind !== 'feature') return;
                    const id = ctxMenu.target.id;
                    setStatus(id, 'done');
                    closeCtxMenu();
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Mark done
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (ctxMenu.target.kind !== 'feature') return;
                    const id = ctxMenu.target.id;
                    deleteFeature(id);
                    closeCtxMenu();
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: '#ff9b9b',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {isEditorOpen ? (
        <div
          onMouseDown={closeEditor}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(24,24,24,0.94)',
              color: '#f5f5f5',
              borderRadius: 12,
              padding: 20,
              minWidth: 380,
              maxWidth: 'min(560px, 100%)',
              boxShadow: '0 18px 42px rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 750 }}>Edit feature</div>
              <div style={{ fontSize: 13, opacity: 0.72 }}>
                {doc.phases.find((p) => p.id === draftPhaseId)?.name ?? 'Unknown phase'} ·{' '}
                {STATUS_META[draftStatus].label}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Title</label>
              <input
                ref={editorTitleRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(0,0,0,0.18)',
                  color: 'inherit',
                  outline: 'none',
                  fontSize: 15,
                  boxShadow: '0 0 0 0 rgba(120,200,255,0.5)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(120,200,255,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 6px rgba(120,200,255,0.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)';
                  e.currentTarget.style.boxShadow = '0 0 0 0 rgba(120,200,255,0.5)';
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Notes</label>
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={4}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(0,0,0,0.18)',
                  color: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: 90,
                  fontSize: 14,
                  boxShadow: '0 0 0 0 rgba(120,200,255,0.5)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(120,200,255,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 6px rgba(120,200,255,0.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)';
                  e.currentTarget.style.boxShadow = '0 0 0 0 rgba(120,200,255,0.5)';
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Tags (comma-separated)</label>
              <input
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(0,0,0,0.18)',
                  color: 'inherit',
                  outline: 'none',
                  fontSize: 14,
                  boxShadow: '0 0 0 0 rgba(120,200,255,0.5)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(120,200,255,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 6px rgba(120,200,255,0.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(255,255,255,0.10)';
                  e.currentTarget.style.boxShadow = '0 0 0 0 rgba(120,200,255,0.5)';
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Phase</label>
                <select
                  value={draftPhaseId}
                  onChange={(e) => setDraftPhaseId(e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(0,0,0,0.18)',
                    color: 'inherit',
                    outline: 'none',
                    fontSize: 14,
                  }}
                >
                  {doc.phases
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Status</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['not_started', 'in_progress', 'done', 'blocked'] as FeatureStatus[]).map((s) => {
                    const meta = STATUS_META[s];
                    const active = draftStatus === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDraftStatus(s)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 12,
                          border: active ? `1px solid ${meta.chipBorder}` : '1px solid rgba(255,255,255,0.12)',
                          background: active ? meta.chipBg : 'rgba(255,255,255,0.03)',
                          color: active ? meta.chipText : 'rgba(255,255,255,0.8)',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={closeEditor}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditor}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'linear-gradient(120deg, rgba(120,200,255,0.6), rgba(120,160,255,0.7))',
                  color: '#0b111a',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
