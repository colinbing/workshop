import type React from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

type PrdBlockType =
  | 'title'
  | 'problem'
  | 'hypothesis'
  | 'audience'
  | 'success_metrics'
  | 'non_goals'
  | 'risks'
  | 'milestones'
  | 'notes';

type PrdBlock = {
  id: string;
  type: PrdBlockType;
  label: string;
  value: string;
  order: number;
};

type PrdDoc = {
  version: 1;
  blocks: PrdBlock[];
};

function seedPrd(): PrdDoc {
  const mk = (type: PrdBlockType, label: string, order: number, value = ''): PrdBlock => ({
    id: uid('prd'),
    type,
    label,
    value,
    order,
  });

  return {
    version: 1,
    blocks: [
      mk('title', 'Title', 1, 'JP Immersion Tutor — PRD'),
      mk('problem', 'Problem', 2, ''),
      mk('hypothesis', 'Hypothesis', 3, ''),
      mk('audience', 'Target audience', 4, ''),
      mk('success_metrics', 'Success metrics', 5, ''),
      mk('non_goals', 'Non-goals', 6, ''),
      mk('risks', 'Risks & unknowns', 7, ''),
      mk('milestones', 'Milestones', 8, ''),
      mk('notes', 'Notes', 9, ''),
    ],
  };
}

function loadPrd(): PrdDoc | null {
  try {
    const raw = localStorage.getItem('workbench_prd_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrdDoc;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.blocks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePrd(prd: PrdDoc) {
  try {
    localStorage.setItem('workbench_prd_v1', JSON.stringify(prd));
  } catch {
    // ignore
  }
}

function normalizePrd(prd: PrdDoc): PrdDoc {
  const blocks = [...prd.blocks]
    .sort((a, b) => a.order - b.order)
    .map((b, idx) => ({ ...b, order: idx + 1 }));
  return { ...prd, blocks };
}

function firstPhaseId(phases: Phase[]) {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  return sorted[0]?.id ?? '';
}

const CARD_W = 300;
const CARD_MIN_H = 140;
const CARD_MAX_H = 170;
const GRID_ROW_GAP = 10;
const GRID_COL_GAP = 16;
const BOARD_PAD_BOTTOM = 16;
type DocSection = 'prd' | 'roadmap' | 'blog' | 'phases';

const SECTION_LABELS: Record<DocSection, string> = {
  prd: 'PRD',
  roadmap: 'Roadmap',
  blog: 'Blog',
  phases: 'Phases',
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftDescription, setDraftDescription] = useState<string>('');
  const [draftTags, setDraftTags] = useState<string>('');
  const [draftPhaseId, setDraftPhaseId] = useState<string>('');
  const [draftStatus, setDraftStatus] = useState<FeatureStatus>('not_started');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [statusPopover, setStatusPopover] = useState<{
    open: boolean;
    featureId: string | null;
    x: number;
    y: number;
  }>({ open: false, featureId: null, x: 0, y: 0 });
  const [statusFilterMenu, setStatusFilterMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardRows, setBoardRows] = useState<number>(6);
  const [boardPadTop, setBoardPadTop] = useState<number>(0);
  const [cardH, setCardH] = useState<number>(150);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string>('');
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseDraft, setPhaseDraft] = useState<string>('');
  const [hoverPhaseId, setHoverPhaseId] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [reducedMotion, setReducedMotion] = useState<boolean>(prefersReducedMotion);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimRef = useRef<number>(0);
  const sectionRefs = useRef<Record<DocSection, HTMLElement | null>>({
    prd: null,
    roadmap: null,
    blog: null,
    phases: null,
  });
  const [activeSection, setActiveSection] = useState<DocSection>('roadmap');
  const [prd, setPrd] = useState<PrdDoc>(() => loadPrd() ?? seedPrd());
  const [prdMode, setPrdMode] = useState<'view' | 'edit'>('view');

  function SortableCard({
    feature: f,
    isSelected,
  }: {
    feature: Feature;
    isSelected: boolean;
  }) {
    const meta = STATUS_META[f.status];
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: f.id,
      transition: {
        duration: 240,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    });
    const computedBorderColor =
      hoverId === f.id || isDragging ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.075)';
    const dragStyle = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        data-feature-id={f.id}
        onClick={() => {
          setHoverId(null);
          setSelectedId(f.id);
        }}
        onMouseEnter={() => setHoverId(f.id)}
        onMouseLeave={() => {
          setHoverId(null);
          setActiveId(null);
        }}
        onMouseDown={() => setActiveId(f.id)}
        onMouseUp={() => setActiveId(null)}
        onContextMenu={(e) => openCtxMenu(e, { kind: 'feature', id: f.id })}
        style={{
          ...cardBase,
          ...(hoverId === f.id ? cardHover : null),
          ...(activeId === f.id ? cardActive : null),
          ...(isSelected ? cardSelected : null),
          borderColor: computedBorderColor,
          cursor: 'default',
          height: cardH,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transform: dragStyle.transform ?? (hoverId === f.id ? cardHover.transform : activeId === f.id ? cardActive.transform : undefined),
          transition:
            dragStyle.transition ??
            'transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms ease, background 200ms ease, border-color 200ms ease',
          opacity: isDragging ? 0.6 : 1,
          boxShadow: isDragging ? '0 18px 42px rgba(0,0,0,0.38)' : cardBase.boxShadow,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '20px minmax(0, 1fr)',
            alignItems: 'start',
            columnGap: 10,
            padding: '9px 12px',
            flex: '0 0 auto',
            minHeight: 46,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            background: meta.bar,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              opacity: 0.75,
              fontSize: 15,
              lineHeight: 1,
              padding: 0,
              borderRadius: 0,
              transform: 'translateY(-0.5px)',
              justifySelf: 'start',
            }}
            aria-label="Drag"
            title="Drag"
            data-dnd-handle
          >
            ⋮⋮
          </div>
          <div style={{ minWidth: 0 }}>
            {editingTitleId === f.id ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInlineTitleEdit(f.id);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelInlineTitleEdit();
                  }
                }}
                onBlur={() => commitInlineTitleEdit(f.id)}
                style={{
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  fontWeight: 750,
                  letterSpacing: 0.1,
                  fontSize: 16,
                  lineHeight: 1.2,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(0,0,0,0.18)',
                  color: 'inherit',
                  padding: '6px 8px',
                  outline: 'none',
                }}
              />
            ) : (
              <div
                style={{
                  fontWeight: 750,
                  flex: 1,
                  letterSpacing: 0.1,
                  fontSize: 16,
                  lineHeight: 1.2,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  whiteSpace: 'normal',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  beginInlineTitleEdit(f.id, f.title);
                }}
                data-title
                title="Click to rename"
              >
                {f.title}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '8px 12px 10px',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          data-card-body
          onDoubleClick={(e) => {
            if (editingTitleId) return;
            e.stopPropagation();
            openEditor(f.id);
          }}
        >
                    {f.description ? (
                      <div
                        style={{
                          marginTop: 0,
                          opacity: 0.85,
                          fontSize: 14,
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {f.description}
                      </div>
                    ) : null}

          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 12,
              opacity: 0.92,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 7px',
                borderRadius: 999,
                background: meta.chipBg,
                border: `1px solid ${meta.chipBorder}`,
                color: meta.chipText,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              role="button"
              tabIndex={0}
              data-status-chip
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setStatusPopover({
                  open: true,
                  featureId: f.id,
                  x: r.left + r.width - 160,
                  y: r.top + r.height + 6,
                });
              }}
            >
              {meta.label}
            </div>
            {f.tags.length ? <span style={chip}>{f.tags.join(', ')}</span> : null}
          </div>
        </div>
      </div>
    );
  }

  function CardPreview({ feature: f, isSelected }: { feature: Feature; isSelected: boolean }) {
    const meta = STATUS_META[f.status];
    const computedBorderColor = 'rgba(255,255,255,0.11)';
    return (
      <div
        data-feature-id={f.id}
        style={{
          ...cardBase,
          ...(isSelected ? cardSelected : null),
          borderColor: computedBorderColor,
          cursor: 'default',
          position: 'relative',
          boxShadow: '0 18px 42px rgba(0,0,0,0.38)',
          transform: 'scale(1.02)',
          opacity: 0.98,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '20px minmax(0, 1fr)',
            alignItems: 'start',
            columnGap: 10,
            padding: '9px 12px',
            minHeight: 46,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            background: meta.bar,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            style={{
              cursor: 'grab',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              opacity: 0.75,
              fontSize: 15,
              lineHeight: 1,
              padding: 0,
              borderRadius: 0,
              transform: 'translateY(-0.5px)',
            }}
          >
            ⋮⋮
          </div>
          <div
            style={{
              fontWeight: 750,
              flex: 1,
              letterSpacing: 0.1,
              fontSize: 16,
              lineHeight: 1.2,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {f.title}
          </div>
        </div>

        <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {f.description ? (
            <div style={{ marginTop: 0, opacity: 0.85, fontSize: 14, lineHeight: 1.35 }}>
              {f.description}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 12,
              opacity: 0.92,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 7px',
                borderRadius: 999,
                background: meta.chipBg,
                border: `1px solid ${meta.chipBorder}`,
                color: meta.chipText,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {meta.label}
            </div>
            {f.tags.length ? <span style={chip}>{f.tags.join(', ')}</span> : null}
          </div>
        </div>
      </div>
    );
  }

  function PhaseLane({
    phase,
    features,
  }: {
    phase: Phase;
    features: Feature[];
  }) {
    const laneId = `phase:${phase.id}`;
    const { setNodeRef, isOver } = useDroppable({ id: laneId });
    const cols = Math.max(1, Math.ceil(Math.max(features.length, 1) / boardRows));
    const laneInnerGridW = cols * CARD_W + Math.max(0, cols - 1) * GRID_COL_GAP;
    const laneW = laneInnerGridW + 10 * 2 + 6;

    return (
      <div
        style={{
          width: laneW,
          minWidth: laneW,
          minHeight: 0,
          height: '100%',
          maxHeight: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 10,
          overflow: 'hidden',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.06)',
          background: isOver ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.02)',
          boxShadow: '0 10px 26px rgba(0,0,0,0.18)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 10,
            padding: '2px 4px',
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0, maxWidth: '100%' }}>
            {editingPhaseId === phase.id ? (
              <input
                value={phaseDraft}
                onChange={(e) => setPhaseDraft(e.target.value)}
                autoFocus
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInlinePhaseEdit(phase.id);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelInlinePhaseEdit();
                  }
                }}
                onBlur={() => commitInlinePhaseEdit(phase.id)}
                style={{
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  fontWeight: 850,
                  letterSpacing: 0.2,
                  fontSize: 14,
                  lineHeight: 1.2,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(0,0,0,0.18)',
                  color: 'inherit',
                  padding: '6px 8px',
                  outline: 'none',
                }}
              />
            ) : (
              <div
                title="Click to rename phase"
                style={{
                  fontWeight: 850,
                  letterSpacing: 0.2,
                  cursor: 'text',
                  padding: '4px 8px',
                  borderRadius: 10,
                  border: hoverPhaseId === phase.id ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
                  background: hoverPhaseId === phase.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                  transition: 'background 140ms ease, border-color 140ms ease, transform 140ms ease',
                  transform: hoverPhaseId === phase.id ? 'translateY(-0.5px)' : 'translateY(0px)',
                  whiteSpace: 'normal',
                  lineHeight: 1.15,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
                onMouseEnter={() => {
                  setHoverPhaseId(phase.id);
                }}
                onMouseLeave={() => {
                  setHoverPhaseId((cur) => (cur === phase.id ? null : cur));
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  beginInlinePhaseEdit(phase.id, phase.name);
                }}
              >
                {phase.name}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {features.length} item{features.length === 1 ? '' : 's'}
          </div>
        </div>

        <SortableContext items={features.map((f) => f.id)} strategy={rectSortingStrategy}>
          <div
            ref={setNodeRef}
            style={{
              width: laneInnerGridW,
              maxWidth: laneInnerGridW,
              paddingRight: 6,
              paddingTop: boardPadTop,
              paddingBottom: boardPadTop,
              flex: '1 1 0',
              minHeight: 0,
              overflow: 'hidden',
              contain: 'layout paint',
              display: 'grid',
              gridAutoFlow: 'column',
              gridAutoColumns: `minmax(${CARD_W}px, ${CARD_W}px)`,
              gridTemplateRows: `repeat(${boardRows}, ${cardH}px)`,
              rowGap: GRID_ROW_GAP,
              columnGap: GRID_COL_GAP,
              alignContent: 'start',
              alignItems: 'start',
            }}
          >
            {features.map((f) => (
              <SortableCard key={f.id} feature={f} isSelected={f.id === selectedId} />
            ))}

            {features.length === 0 ? (
              <div style={{ opacity: 0.55, fontSize: 13, padding: 10 }}>Drop here</div>
            ) : null}
          </div>
        </SortableContext>
      </div>
    );
  }

  // For focusing after create
  const scrollToIdRef = useRef<string | null>(null);
  const editorTitleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveDoc(doc);
  }, [doc]);

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const compute = () => {
      const LANE_CHROME_Y = 10 * 2 + 10 + 44;
      const h = el.clientHeight - BOARD_PAD_BOTTOM - LANE_CHROME_Y;
      const gap = GRID_ROW_GAP;
      const minCard = CARD_MIN_H;

      const rows = Math.max(1, Math.floor((h + gap) / (minCard + gap)));

      const usedMin = rows * minCard + Math.max(0, rows - 1) * gap;
      const slack = Math.max(0, h - usedMin);
      const grow = Math.floor(slack / rows);
      const nextCardH = clamp(minCard + grow, CARD_MIN_H, CARD_MAX_H);

      const used = rows * nextCardH + Math.max(0, rows - 1) * gap;
      const topPad = clamp(Math.floor(Math.max(0, h - used) / 2), 0, 28);

      setBoardRows(rows);
      setCardH(nextCardH);
      setBoardPadTop(topPad);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  function createPhaseAtEnd() {
    setDoc((prev) => {
      const maxOrder = prev.phases.reduce((m, p) => Math.max(m, p.order), 0);
      const nextNum = maxOrder + 1;
      const p: Phase = { id: uid('phase'), name: `Phase ${nextNum}`, order: nextNum };
      return { ...prev, phases: [...prev.phases, p] };
    });
  }
  function closeStatusPopover() {
    setStatusPopover({ open: false, featureId: null, x: 0, y: 0 });
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

function beginInlineTitleEdit(id: string, current: string) {
  setEditingTitleId(id);
  setTitleDraft(current);
}

function beginInlinePhaseEdit(id: string, current: string) {
  setHoverPhaseId(null);
  setEditingPhaseId(id);
  setPhaseDraft(current);
}

  function cancelInlineTitleEdit() {
    setEditingTitleId(null);
    setTitleDraft('');
  }

function cancelInlinePhaseEdit() {
  setEditingPhaseId(null);
  setPhaseDraft('');
}

  function updatePrdBlock(id: string, value: string) {
    setPrd((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, value } : b)),
    }));
  }

  function addPrdBlockAfter(afterId: string) {
    setPrd((prev) => {
      const blocks = [...prev.blocks].sort((a, b) => a.order - b.order);
      const idx = blocks.findIndex((b) => b.id === afterId);
      const insertAt = idx === -1 ? blocks.length : idx + 1;

      const newBlock: PrdBlock = {
        id: uid('prd'),
        type: 'notes',
        label: 'Custom section',
        value: '',
        order: insertAt + 1,
      };

      blocks.splice(insertAt, 0, newBlock);
      return normalizePrd({ ...prev, blocks });
    });
  }

  function deletePrdBlock(id: string) {
    setPrd((prev) => normalizePrd({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
  }

  function renamePrdBlock(id: string, label: string) {
    setPrd((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, label: label.trim() || b.label } : b)),
    }));
  }

  function movePrdBlock(id: string, delta: number) {
    setPrd((prev) => {
      const blocks = [...prev.blocks].sort((a, b) => a.order - b.order);
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx === -1) return prev;

      const nextIdx = clamp(idx + delta, 0, blocks.length - 1);
      if (nextIdx === idx) return prev;

      const next = arrayMove(blocks, idx, nextIdx);
      return normalizePrd({ ...prev, blocks: next });
    });
  }

function commitInlineTitleEdit(id: string) {
  const next = titleDraft.trim();
  const original = doc.features.find((f) => f.id === id)?.title ?? '';
  if (!next) {
    cancelInlineTitleEdit();
      return;
    }
    if (next === original) {
      cancelInlineTitleEdit();
      return;
    }
    setDoc((prev) => ({
      ...prev,
      features: prev.features.map((f) => (f.id === id ? { ...f, title: next, updatedAt: now() } : f)),
    }));
  cancelInlineTitleEdit();
}

function commitInlinePhaseEdit(id: string) {
  const next = phaseDraft.trim();
  const original = doc.phases.find((p) => p.id === id)?.name ?? '';
  if (!next || next === original) {
    cancelInlinePhaseEdit();
    return;
  }

  setDoc((prev) => ({
    ...prev,
    phases: prev.phases.map((p) => (p.id === id ? { ...p, name: next } : p)),
  }));

  cancelInlinePhaseEdit();
}

function laneIdForPhase(phaseId: string) {
  return `phase:${phaseId}`;
}
function isLaneId(id: string) {
  return id.startsWith('phase:');
}
function phaseIdFromLaneId(id: string) {
  return id.slice('phase:'.length);
}

function openStatusFilterMenu(e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setStatusFilterMenu({ open: true, x: r.left, y: r.bottom + 8 });
  }

  function closeStatusFilterMenu() {
    setStatusFilterMenu({ open: false, x: 0, y: 0 });
  }

  function animateScrollTo(root: HTMLElement, top: number, duration = 260) {
    if (reducedMotion) {
      root.scrollTo({ top, behavior: 'auto' });
      return;
    }

    const startTop = root.scrollTop;
    const delta = top - startTop;
    if (delta === 0 || duration <= 0) {
      root.scrollTo({ top, behavior: 'auto' });
      return;
    }

    if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    const start = performance.now();

    const tick = (now: number) => {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      root.scrollTop = startTop + delta * eased;
      if (t < 1) scrollAnimRef.current = requestAnimationFrame(tick);
    };

    scrollAnimRef.current = requestAnimationFrame(tick);
  }

  function snapByDelta(direction: number) {
    const order: DocSection[] = ['prd', 'roadmap', 'blog', 'phases'];
    const idx = order.indexOf(activeSection);
    const nextIdx = clamp(idx + direction, 0, order.length - 1);
    if (nextIdx === idx) return;
    scrollToSection(order[nextIdx]);
  }

  function scrollToSection(section: DocSection) {
    const root = scrollRootRef.current;
    const el = sectionRefs.current[section];
    if (!root || !el) return;

    const hash = `#${section}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);

    const top = el.offsetTop;
    animateScrollTo(root, top);
  }

  function sectionFromHash(): DocSection | null {
    const raw = (window.location.hash || '').replace('#', '').trim();
    if (!raw) return null;
    if (raw === 'prd' || raw === 'roadmap' || raw === 'blog' || raw === 'phases') return raw;
    return null;
  }

useEffect(() => {
  if (!isEditorOpen) return;
  requestAnimationFrame(() => {
    editorTitleRef.current?.focus();
    editorTitleRef.current?.select();
  });
}, [isEditorOpen]);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion);
  }, [prefersReducedMotion]);

  useLayoutEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (isEditorOpen) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        if (target.closest('[data-no-snap]')) return;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (target.isContentEditable) return;
      }
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (Math.abs(e.deltaY) < 90) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      snapByDelta(direction);
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [activeSection, isEditorOpen, reducedMotion]);

  useEffect(() => {
    savePrd(prd);
  }, [prd]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const sections: Array<{ key: DocSection; el: HTMLElement | null }> = [
      { key: 'prd', el: sectionRefs.current.prd },
      { key: 'roadmap', el: sectionRefs.current.roadmap },
      { key: 'blog', el: sectionRefs.current.blog },
      { key: 'phases', el: sectionRefs.current.phases },
    ];

    const existing = sections.filter((s) => !!s.el) as Array<{ key: DocSection; el: HTMLElement }>;
    if (!existing.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];

        if (!visible) return;

        const found = existing.find((s) => s.el === visible.target);
        if (found) setActiveSection(found.key);
      },
      {
        root,
        threshold: [0.2, 0.35, 0.5, 0.65],
      }
    );

    for (const s of existing) obs.observe(s.el);
    return () => obs.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    let raf = 0;

    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = sectionRefs.current[activeSection];
        if (!el) return;
        root.scrollTo({ top: el.offsetTop, behavior: 'auto' });
      });
    };

    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
    };
  }, [activeSection]);

  useEffect(() => {
    const fromHash = sectionFromHash();
    if (fromHash) {
      requestAnimationFrame(() => scrollToSection(fromHash));
      return;
    }
    requestAnimationFrame(() => scrollToSection('roadmap'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editingPhaseId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelInlinePhaseEdit();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingPhaseId]);


  // After doc changes, if nothing selected, select newest feature (max order)
  useEffect(() => {
    if (doc.features.length === 0) return;
    if (selectedId) return;

    const newest = [...doc.features].sort((a, b) => b.order - a.order)[0];
    if (newest) setSelectedId(newest.id);
  }, [doc.features, selectedId]);

  // Pretty minimal styling
  const pageStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  };

  const toolbarStyle: React.CSSProperties = {
    marginTop: 8,
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const shellStyle: React.CSSProperties = {
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    display: 'grid',
    gridTemplateColumns: '240px minmax(0, 1fr)',
    background: 'transparent',
    color: 'inherit',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  };

  const sidebarStyle: React.CSSProperties = {
    padding: 14,
    borderRight: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.02)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 0,
  };

  const navBtn = (active: boolean): React.CSSProperties => ({
    textAlign: 'left',
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${active ? 'rgba(120,200,255,0.35)' : 'rgba(255,255,255,0.10)'}`,
    background: active ? 'rgba(120,200,255,0.12)' : 'rgba(255,255,255,0.03)',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 800,
    letterSpacing: 0.2,
  });

  const docScrollStyle: React.CSSProperties = {
    height: '100%',
    maxHeight: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollBehavior: reducedMotion ? 'auto' : 'smooth',
    scrollSnapType: 'y mandatory',
    scrollPaddingTop: 0,
  };

  const sectionStyle: React.CSSProperties = {
    height: '100%',
    maxHeight: '100%',
    minHeight: 0,
    padding: 14,
    boxSizing: 'border-box',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
  };
  const PRD_COL_W = 520;
  const PRD_COL_GAP = 22;
  const PRD_BODY_SIZE = 16;
  const PRD_LINE = 1.6;

  const prdLabelStyle: React.CSSProperties = {
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    opacity: 0.62,
    fontWeight: 800,
  };

  const prdBodyStyle: React.CSSProperties = {
    fontSize: PRD_BODY_SIZE,
    lineHeight: PRD_LINE,
    opacity: 0.93,
    whiteSpace: 'pre-wrap',
  };

  const prdH1Style: React.CSSProperties = {
    margin: 0,
    fontSize: 34,
    fontWeight: 950,
    letterSpacing: -0.2,
    lineHeight: 1.05,
  };

  const prdH2Style: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 0.1,
    lineHeight: 1.15,
  };

  return (
    <div style={shellStyle}>
      <aside style={sidebarStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.2 }}>Workbench</div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Local-first • {doc.features.length} feature{doc.features.length === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {(['prd', 'roadmap', 'blog', 'phases'] as DocSection[]).map((key) => (
            <button
              key={key}
              type="button"
              style={navBtn(activeSection === key)}
              onClick={() => scrollToSection(key)}
            >
              {SECTION_LABELS[key]}
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
          Reduced motion
        </label>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.35 }}>
          Tip: You can deep-link sections with hashes like <span style={{ opacity: 0.9 }}>#prd</span>.
        </div>
      </aside>

      <main ref={scrollRootRef} style={docScrollStyle}>
        <section
          id="prd"
          ref={(el) => {
            sectionRefs.current.prd = el;
          }}
          style={sectionStyle}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ opacity: 0.95, fontWeight: 950, fontSize: 26, letterSpacing: 0.1 }}>PRD</div>
              <div style={{ marginTop: 6, opacity: 0.62, fontSize: 12, fontWeight: 700 }}>
                {prdMode === 'edit' ? 'Edit mode • autosaved locally' : 'View mode'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setPrdMode((m) => (m === 'edit' ? 'view' : 'edit'))}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: prdMode === 'edit' ? 'rgba(120,200,255,0.12)' : 'rgba(255,255,255,0.03)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
                title={prdMode === 'edit' ? 'Switch to view mode' : 'Switch to edit mode'}
              >
                {prdMode === 'edit' ? 'Done' : 'Edit'}
              </button>

              <button
                type="button"
                onClick={() => setPrd(seedPrd())}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 750,
                }}
                title="Reset PRD template"
              >
                Reset template
              </button>
            </div>
          </div>

          <div
            data-no-snap
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowX: 'auto',
              overflowY: 'hidden',
              paddingBottom: 10,
            }}
          >
            <div
              style={{
                height: '100%',
                columnWidth: PRD_COL_W,
                columnGap: PRD_COL_GAP,
                columnFill: 'auto',
                paddingRight: 10,
              }}
            >
              {[...prd.blocks]
                .sort((a, b) => a.order - b.order)
                .map((b) =>
                  prdMode === 'edit' ? (
                    <div
                      key={b.id}
                      style={{
                        width: PRD_COL_W,
                        display: 'inline-block',
                        verticalAlign: 'top',
                        marginBottom: 12,
                        breakInside: 'avoid',
                        borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        boxShadow: '0 10px 26px rgba(0,0,0,0.16)',
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          value={b.label}
                          onChange={(e) => renamePrdBlock(b.id, e.target.value)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '8px 10px',
                            borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.10)',
                            background: 'rgba(0,0,0,0.14)',
                            color: 'inherit',
                            outline: 'none',
                            fontWeight: 850,
                            letterSpacing: 0.15,
                          }}
                        />

                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => movePrdBlock(b.id, -1)}
                            style={{
                              padding: '7px 10px',
                              borderRadius: 12,
                              border: '1px solid rgba(255,255,255,0.10)',
                              background: 'rgba(255,255,255,0.03)',
                              color: 'inherit',
                              cursor: 'pointer',
                              fontWeight: 900,
                            }}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => movePrdBlock(b.id, 1)}
                            style={{
                              padding: '7px 10px',
                              borderRadius: 12,
                              border: '1px solid rgba(255,255,255,0.10)',
                              background: 'rgba(255,255,255,0.03)',
                              color: 'inherit',
                              cursor: 'pointer',
                              fontWeight: 900,
                            }}
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => addPrdBlockAfter(b.id)}
                            style={{
                              padding: '7px 10px',
                              borderRadius: 12,
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(120,200,255,0.10)',
                              color: 'inherit',
                              cursor: 'pointer',
                              fontWeight: 900,
                            }}
                            title="Add block after"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePrdBlock(b.id)}
                            style={{
                              padding: '7px 10px',
                              borderRadius: 12,
                              border: '1px solid rgba(255,255,255,0.10)',
                              background: 'rgba(255,155,155,0.08)',
                              color: 'rgba(255,210,210,0.95)',
                              cursor: 'pointer',
                              fontWeight: 900,
                            }}
                            title="Delete block"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      <textarea
                        value={b.value}
                        onChange={(e) => updatePrdBlock(b.id, e.target.value)}
                        rows={Math.max(4, Math.min(14, 4 + Math.floor((b.value.length || 0) / 140)))}
                        placeholder="Write here…"
                        style={{
                          marginTop: 10,
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '10px 12px',
                          borderRadius: 14,
                          border: '1px solid rgba(255,255,255,0.10)',
                          background: 'rgba(0,0,0,0.14)',
                          color: 'inherit',
                          outline: 'none',
                          fontSize: 14,
                          lineHeight: 1.4,
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      key={b.id}
                      style={{
                        display: 'block',
                        breakInside: 'auto',
                        marginBottom: 18,
                        padding: '2px 2px 0',
                      }}
                    >
                      {b.type === 'title' ? (
                        <h1 style={{ ...prdH1Style, marginBottom: 10 }}>
                          {b.value?.trim() ? b.value : 'Untitled PRD'}
                        </h1>
                      ) : (
                        <div style={{ ...prdH2Style, marginBottom: 8 }}>{b.label}</div>
                      )}

                      <div style={prdBodyStyle}>
                        {b.value?.trim() ? b.value : <span style={{ opacity: 0.45 }}>—</span>}
                      </div>

                      <div style={{ marginTop: 16, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                    </div>
                  )
                )}
            </div>
          </div>
        </section>

        <section
          id="roadmap"
          ref={(el) => {
            sectionRefs.current.roadmap = el;
          }}
          style={sectionStyle}
        >
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
            <div
              style={pageStyle}
              onContextMenu={(e) => {
                const targetEl = e.target as HTMLElement | null;
                if (targetEl?.closest('[data-feature-id]')) return;
                openCtxMenu(e, { kind: 'background' });
              }}
            >
              <div style={{ flex: '0 0 auto' }}>
                <div style={toolbarStyle}>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 950,
                      letterSpacing: 0.1,
                      opacity: 0.95,
                      lineHeight: 1.1,
                      marginRight: 6,
                    }}
                  >
                    Roadmap
                  </div>
                  <button type="button" onMouseDown={(e) => openStatusFilterMenu(e)} style={statusChipBase}>
                    Statuses ({statusFilter.size})
                  </button>

                  <select
                    value={phaseFilter}
                    onChange={(e) => setPhaseFilter(e.target.value)}
                    style={{ ...inputStyle, width: 200 }}
                    aria-label="Phase filter"
                  >
                    <option value="all">All phases</option>
                    {[...doc.phases]
                      .sort((a, b) => a.order - b.order)
                      .map((p) => {
                        const label = p.name.length > 28 ? `${p.name.slice(0, 27)}…` : p.name;
                        return (
                          <option key={p.id} value={p.id} title={p.name}>
                            {label}
                          </option>
                        );
                      })}
                  </select>

                  <input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Search tags/title/notes…"
                    style={{ ...inputStyle, minWidth: 220 }}
                    aria-label="Search"
                  />

                  <div style={{ flex: 1 }} />

                  <div style={{ opacity: 0.6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {doc.features.length} feature{doc.features.length === 1 ? '' : 's'} • autosaved
                  </div>

                  <button onClick={createFeatureAtEnd} style={buttonStyle} title="N">
                    + New
                  </button>
                </div>
              </div>

              <div
                data-no-snap
                style={{
                  marginTop: 10,
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
                  paddingBottom: BOARD_PAD_BOTTOM,
                  boxSizing: 'border-box',
                }}
                ref={boardRef}
              >
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={(event: DragStartEvent) => setActiveDragId(String(event.active.id))}
                  onDragCancel={(_event: DragCancelEvent) => setActiveDragId(null)}
                  onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    setActiveDragId(null);
                    if (!over) return;
                    const activeId = String(active.id);
                    const overId = String(over.id);
                    if (activeId === overId) return;

                    setDoc((prev) => {
                      const activeFeat = prev.features.find((f) => f.id === activeId);
                      if (!activeFeat) return prev;

                      let destPhaseId: string | null = null;
                      if (isLaneId(overId)) {
                        destPhaseId = phaseIdFromLaneId(overId);
                      } else {
                        const overFeat = prev.features.find((f) => f.id === overId);
                        destPhaseId = overFeat?.phaseId ?? null;
                      }
                      if (!destPhaseId) return prev;

                      const sourcePhaseId = activeFeat.phaseId;
                      const movingAcross = sourcePhaseId !== destPhaseId;
                      const activeFeatNext = movingAcross
                        ? { ...activeFeat, phaseId: destPhaseId, updatedAt: now() }
                        : activeFeat;

                      const visible = filteredFeatures;
                      const visibleByPhase = new Map<string, string[]>();
                      for (const p of prev.phases) visibleByPhase.set(p.id, []);
                      for (const f of visible) {
                        const arr = visibleByPhase.get(f.phaseId) ?? [];
                        arr.push(f.id);
                        visibleByPhase.set(f.phaseId, arr);
                      }

                      const srcVisibleIds = [...(visibleByPhase.get(sourcePhaseId) ?? [])];
                      const dstVisibleIds = [...(visibleByPhase.get(destPhaseId) ?? [])];

                      const srcIdx = srcVisibleIds.indexOf(activeId);
                      if (srcIdx !== -1) srcVisibleIds.splice(srcIdx, 1);

                      if (sourcePhaseId === destPhaseId) {
                        const oldIndex = dstVisibleIds.indexOf(activeId);
                        const newIndex = dstVisibleIds.indexOf(overId);
                        if (oldIndex === -1 || newIndex === -1) return prev;

                        const nextIds = arrayMove(dstVisibleIds, oldIndex, newIndex);
                        visibleByPhase.set(destPhaseId, nextIds);
                      } else {
                        let insertAt = dstVisibleIds.length;
                        if (!isLaneId(overId)) {
                          const overIndex = dstVisibleIds.indexOf(overId);
                          if (overIndex !== -1) insertAt = overIndex;
                        }
                        dstVisibleIds.splice(insertAt, 0, activeId);
                        visibleByPhase.set(sourcePhaseId, srcVisibleIds);
                        visibleByPhase.set(destPhaseId, dstVisibleIds);
                      }

                      const byId = new Map(prev.features.map((f) => [f.id, f]));
                      byId.set(activeId, activeFeatNext);
                      const nextFeatures: Feature[] = [];

                      const phasesOrdered = [...prev.phases].sort((a, b) => a.order - b.order);
                      for (const ph of phasesOrdered) {
                        const visIds = visibleByPhase.get(ph.id) ?? [];
                        const visSet = new Set(visIds);

                        const vis = visIds.map((id) => byId.get(id)).filter(Boolean) as Feature[];

                        const nonVis = prev.features
                          .filter((f) => f.id !== activeId)
                          .filter((f) => f.phaseId === ph.id && !visSet.has(f.id))
                          .sort((a, b) => a.order - b.order);

                        nextFeatures.push(...vis, ...nonVis);
                      }

                      const seen = new Set<string>();
                      const uniqueNext = nextFeatures.filter((f) => {
                        if (seen.has(f.id)) return false;
                        seen.add(f.id);
                        return true;
                      });

                      const normalized = uniqueNext.map((f, idx) => ({
                        ...f,
                        order: idx + 1,
                      }));

                      return { ...prev, features: normalized };
                    });
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: 'max-content',
                      display: 'flex',
                      gap: 16,
                      paddingRight: 12,
                      overflow: 'hidden',
                    }}
                  >
                    {[...doc.phases]
                      .sort((a, b) => a.order - b.order)
                      .filter((p) => phaseFilter === 'all' || p.id === phaseFilter)
                      .map((p) => {
                        const inLane = filteredFeatures.filter((f) => f.phaseId === p.id);
                        return <PhaseLane key={p.id} phase={p} features={inLane} />;
                      })}
                    <button
                      type="button"
                      onClick={createPhaseAtEnd}
                      style={{
                        width: 72,
                        minWidth: 72,
                        borderRadius: 16,
                        border: '1px dashed rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.02)',
                        color: 'rgba(255,255,255,0.82)',
                        boxShadow: '0 10px 26px rgba(0,0,0,0.12)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: 10,
                        userSelect: 'none',
                      }}
                      title="Add a new phase"
                    >
                      <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>+</div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          opacity: 0.8,
                          writingMode: 'vertical-rl',
                          transform: 'rotate(180deg)',
                        }}
                      >
                        Phase
                      </div>
                    </button>
                  </div>
                  <DragOverlay>
                    {activeDragId
                      ? (() => {
                          const activeFeature = doc.features.find((x) => x.id === activeDragId);
                          if (!activeFeature) return null;
                          return (
                            <div
                              style={{
                                ...cardBase,
                                width: 300,
                                boxShadow: '0 20px 55px rgba(0,0,0,0.55)',
                                transform: 'scale(1.02)',
                                opacity: 0.98,
                                pointerEvents: 'none',
                              }}
                            >
                              <CardPreview feature={activeFeature} isSelected={activeFeature.id === selectedId} />
                            </div>
                          );
                        })()
                      : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          </div>
        </section>

        <section
          id="blog"
          ref={(el) => {
            sectionRefs.current.blog = el;
          }}
          style={sectionStyle}
        >
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ opacity: 0.8, fontWeight: 850, fontSize: 18 }}>Blog</div>
            <div style={{ marginTop: 8, opacity: 0.65, fontSize: 13 }}>
              Placeholder. We’ll add a simple dated-entry list later.
            </div>
          </div>
        </section>

        <section
          id="phases"
          ref={(el) => {
            sectionRefs.current.phases = el;
          }}
          style={sectionStyle}
        >
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ opacity: 0.8, fontWeight: 850, fontSize: 18 }}>Phases</div>
            <div style={{ marginTop: 8, opacity: 0.65, fontSize: 13 }}>
              Placeholder. We’ll add the “from space” phase overview after PRD.
            </div>
          </div>
        </section>
      </main>
      {statusPopover.open && statusPopover.featureId ? (
        <div
          onClick={() => closeStatusPopover()}
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
      {statusFilterMenu.open ? (
        <div
          onMouseDown={closeStatusFilterMenu}
          style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'transparent' }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: statusFilterMenu.x,
              top: statusFilterMenu.y,
              background: 'rgba(24,24,24,0.94)',
              color: '#f5f5f5',
              borderRadius: 12,
              padding: 10,
              minWidth: 220,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 14px 32px rgba(0,0,0,0.38)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setStatusFilter(new Set(ALL_STATUSES))}
                style={{ ...statusChipBase, justifyContent: 'center', flex: 1 }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter(new Set())}
                style={{
                  ...statusChipBase,
                  justifyContent: 'center',
                  flex: 1,
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                None
              </button>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

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
                    textAlign: 'left',
                    padding: '10px 10px',
                    borderRadius: 10,
                    border: `1px solid ${active ? meta.chipBorder : 'rgba(255,255,255,0.10)'}`,
                    background: active ? meta.chipBg : 'rgba(255,255,255,0.02)',
                    color: active ? meta.chipText : 'rgba(255,255,255,0.82)',
                    cursor: 'pointer',
                    fontWeight: 750,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <span>{meta.label}</span>
                  <span style={{ opacity: active ? 0.95 : 0.45 }}>{active ? '✓' : ''}</span>
                </button>
              );
            })}
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
