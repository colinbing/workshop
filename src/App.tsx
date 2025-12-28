import * as React from 'react';
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
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

function buildStatusMeta(
  mode: ThemeMode
): Record<FeatureStatus, { label: string; bar: string; chipBg: string; chipBorder: string; chipText: string }> {
  if (mode === 'light') {
    return {
      not_started: {
        label: 'Not started',
        bar: 'linear-gradient(90deg, rgba(10,16,24,0.10), rgba(10,16,24,0.04))',
        chipBg: 'rgba(10,16,24,0.06)',
        chipBorder: 'rgba(10,16,24,0.18)',
        chipText: 'rgba(10,16,24,0.78)',
      },
      in_progress: {
        label: 'In progress',
        bar: 'linear-gradient(90deg, rgba(30,120,255,0.35), rgba(30,120,255,0.08))',
        chipBg: 'rgba(30,120,255,0.14)',
        chipBorder: 'rgba(30,120,255,0.30)',
        chipText: 'rgba(10,16,24,0.82)',
      },
      done: {
        label: 'Done',
        bar: 'linear-gradient(90deg, rgba(35,160,95,0.32), rgba(35,160,95,0.08))',
        chipBg: 'rgba(35,160,95,0.14)',
        chipBorder: 'rgba(35,160,95,0.30)',
        chipText: 'rgba(10,16,24,0.82)',
      },
      blocked: {
        label: 'Blocked',
        bar: 'linear-gradient(90deg, rgba(235,70,70,0.30), rgba(235,70,70,0.08))',
        chipBg: 'rgba(235,70,70,0.14)',
        chipBorder: 'rgba(235,70,70,0.30)',
        chipText: 'rgba(10,16,24,0.82)',
      },
    };
  }

  return {
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
}

type CtxTarget =
  | { kind: 'feature'; id: string }
  | { kind: 'background' };

type CtxMenuState = {
  open: boolean;
  x: number;
  y: number;
  target: CtxTarget;
};

type ThemeMode = 'dark' | 'light';

function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem('workbench_theme');
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // ignore
  }
  return 'dark';
}

function saveTheme(mode: ThemeMode) {
  try {
    localStorage.setItem('workbench_theme', mode);
  } catch {
    // ignore
  }
}

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

function prdToHtml(value: string) {
  const v = value ?? '';
  if (/[<][a-z][\s\S]*[>]/i.test(v)) return v;
  const esc = v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return esc.replaceAll('\n', '<br/>');
}

function prdHtmlIsEmpty(html: string) {
  const v = (html ?? '').trim();
  if (!v) return true;
  const text = v
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
  return text.length === 0;
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('input, textarea, select')) return true;
  if (el.closest('[contenteditable="true"]')) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function isTypingContext(target: EventTarget | null) {
  return isTypingTarget(target) || isTypingTarget(document.activeElement);
}

function firstPhaseId(phases: Phase[]) {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  return sorted[0]?.id ?? '';
}

const CARD_W = 320;
const CARD_MIN_H = 155;
const CARD_MAX_H = 195;
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

type InlineRichFieldProps = {
  blockId: string;
  html: string;
  onChangeHtml: (nextHtml: string) => void;
  placeholder: string;
  themeVars: {
    border: string;
    inputBg: string;
    placeholder: string;
  };
  onFocusBlock: (blockId: string, el: HTMLDivElement) => void;
  onBlurBlock: (blockId: string, nextHtml: string) => void;
};

const InlineRichField = memo(function InlineRichField({
  blockId,
  html,
  onChangeHtml,
  placeholder,
  themeVars,
  onFocusBlock,
  onBlurBlock,
}: InlineRichFieldProps) {
  const elRef = useRef<HTMLDivElement | null>(null);

  // Sync incoming html into the DOM ONLY when not actively editing this field
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const isFocused = document.activeElement === el;
    if (isFocused) return;
    if (el.innerHTML !== html) el.innerHTML = html || '';
  }, [html]);

  const empty = prdHtmlIsEmpty(html);

  return (
    <div style={{ position: 'relative', marginTop: 10 }}>
      <div
        ref={elRef}
        className="prd-rich"
        contentEditable
        suppressContentEditableWarning
        data-prd-field={blockId}
        onFocus={(e) => onFocusBlock(blockId, e.currentTarget)}
        onBlur={(e) => {
          const nextHtml = (e.currentTarget as HTMLDivElement).innerHTML;
          onBlurBlock(blockId, nextHtml);
        }}
        onInput={(e) => {
          const nextHtml = (e.currentTarget as HTMLDivElement).innerHTML;
          onChangeHtml(nextHtml);
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '14px 14px',
          borderRadius: 14,
          border: `1px solid ${themeVars.border}`,
          background: themeVars.inputBg,
          color: 'inherit',
          outline: 'none',
          fontSize: 14,
          lineHeight: 1.55,
          minHeight: 130,
          whiteSpace: 'normal',
        }}
      />

      {empty ? (
        <div
          style={{
            position: 'absolute',
            left: 14,
            top: 14,
            right: 14,
            color: themeVars.placeholder,
            fontSize: 14,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {placeholder}
        </div>
      ) : null}
    </div>
  );
});

type PrdToolbarProps = {
  visible: boolean;
  alwaysVisible?: boolean;
  className?: string;
  onCmd: (cmd: string, val?: string) => void;
  onLink: () => void;
  toolBtnStyle: React.CSSProperties;
  themeVars: {
    border: string;
    panelBg2: string;
    divider: string;
  };
};

const PrdToolbar = memo(function PrdToolbar({
  visible,
  alwaysVisible = false,
  className,
  onCmd,
  onLink,
  toolBtnStyle,
  themeVars,
}: PrdToolbarProps) {
  const isVisible = alwaysVisible || visible;

  return (
    <div
      className={className}
      style={{
        marginTop: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 4,
        padding: 8,
        borderRadius: 14,
        border: `1px solid ${themeVars.border}`,
        background: themeVars.panelBg2,
        minHeight: 44,
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transform: isVisible ? 'translateY(0)' : 'translateY(-2px)',
        transition: 'opacity 140ms ease, transform 140ms ease',
        scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" onClick={() => onCmd('bold')} style={toolBtnStyle}>
        B
      </button>
      <button type="button" onClick={() => onCmd('italic')} style={toolBtnStyle}>
        <em>I</em>
      </button>
      <button type="button" onClick={() => onCmd('underline')} style={toolBtnStyle}>
        <u>U</u>
      </button>

      <div style={{ width: 1, background: themeVars.divider, margin: '0 4px' }} />

      <button type="button" onClick={() => onCmd('insertUnorderedList')} style={toolBtnStyle}>
        • List
      </button>
      <button type="button" onClick={() => onCmd('insertOrderedList')} style={toolBtnStyle}>
        1. List
      </button>

      <div style={{ width: 1, background: themeVars.divider, margin: '0 4px' }} />

      <button type="button" onClick={() => onCmd('formatBlock', 'H1')} style={toolBtnStyle}>
        H1
      </button>
      <button type="button" onClick={() => onCmd('formatBlock', 'H2')} style={toolBtnStyle}>
        H2
      </button>
      <button type="button" onClick={() => onCmd('formatBlock', 'P')} style={toolBtnStyle}>
        Body
      </button>

      <div style={{ width: 1, background: themeVars.divider, margin: '0 4px' }} />

      <button type="button" onClick={onLink} style={toolBtnStyle}>
        Link
      </button>
      <button type="button" onClick={() => onCmd('removeFormat')} style={toolBtnStyle}>
        Clear
      </button>

      <label
        style={{
          ...toolBtnStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{ opacity: 0.8 }}>Color</span>
        <input
          type="color"
          defaultValue="#ffffff"
          onChange={(e) => onCmd('foreColor', e.target.value)}
          style={{
            width: 20,
            height: 20,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
          }}
        />
      </label>
    </div>
  );
});

function PhaseFromSpaceView({
  doc,
  onOpenPhase,
  onShowAll,
  themeVars,
  statusMeta,
  isLight,
}: {
  doc: WorkbenchDoc;
  onOpenPhase: (phaseId: string) => void;
  onShowAll: () => void;
  themeVars: {
    panelBg2: string;
    panelBg3: string;
    border: string;
    borderSoft: string;
    appText: string;
    muted: string;
    muted2: string;
    shadow2: string;
  };
  statusMeta: Record<
    FeatureStatus,
    { label: string; bar: string; chipBg: string; chipBorder: string; chipText: string }
  >;
  isLight: boolean;
}) {
  const phases = [...doc.phases].sort((a, b) => a.order - b.order);

  const byPhase = new Map<
    string,
    {
      total: number;
      counts: Record<FeatureStatus, number>;
      top: Feature[];
      donePct: number;
    }
  >();

  for (const p of phases) {
    const items = doc.features.filter((f) => f.phaseId === p.id);
    const counts: Record<FeatureStatus, number> = {
      not_started: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
    };

    for (const f of items) counts[f.status]++;

    const total = items.length;
    const donePct = total ? Math.round((counts.done / total) * 100) : 0;

    // “From space” = show a few actionable items, not everything
    const top = items
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((f) => f.status !== 'done')
      .slice(0, 4);

    byPhase.set(p.id, { total, counts, top, donePct });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div
          style={{
            fontWeight: 950,
            fontSize: 18,
            opacity: 0.95,
            color: themeVars.appText,
            letterSpacing: 0.1,
          }}
        >
          Phase “from space” view
        </div>
        <button
          type="button"
          onClick={onShowAll}
          style={{
            padding: '8px 10px',
            borderRadius: 10,
            border: `1px solid ${themeVars.border}`,
            background: themeVars.panelBg3,
            color: themeVars.appText,
            cursor: 'pointer',
            fontWeight: 850,
            fontSize: 12,
          }}
          title="Show all phases in Roadmap"
        >
          Show all in Roadmap
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
          minHeight: 0,
        }}
      >
        {phases.map((p) => {
          const meta = byPhase.get(p.id)!;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenPhase(p.id)}
              style={{
                textAlign: 'left',
                borderRadius: 16,
                border: `1px solid ${themeVars.border}`,
                background: themeVars.panelBg3,
                boxShadow: themeVars.shadow2,
                padding: 12,
                cursor: 'pointer',
                display: 'grid',
                gap: 10,
              }}
              title="Open this phase in Roadmap"
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <div
                  style={{
                    fontWeight: 950,
                    fontSize: 14,
                    opacity: 0.95,
                    minWidth: 0,
                    color: themeVars.appText,
                  }}
                >
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {p.name || 'Untitled phase'}
                  </span>
                </div>
                <div style={{ fontWeight: 850, fontSize: 12, color: themeVars.muted }}>
                  {meta.donePct}% · {meta.total}
                </div>
              </div>

              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: themeVars.panelBg2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${meta.donePct}%`,
                    borderRadius: 999,
                    background: isLight ? 'rgba(10,16,24,0.18)' : themeVars.borderSoft,
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['not_started', 'in_progress', 'blocked', 'done'] as FeatureStatus[]).map((s) => (
                  <div
                    key={s}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: `1px solid ${statusMeta[s].chipBorder}`,
                      background: statusMeta[s].chipBg,
                      color: statusMeta[s].chipText,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {statusMeta[s].label}: {meta.counts[s]}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {meta.top.length ? (
                  meta.top.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        fontSize: 12,
                        opacity: 0.82,
                        lineHeight: 1.25,
                        color: themeVars.appText,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={f.title}
                    >
                      • {f.title || '(untitled)'}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: themeVars.muted2 }}>No open items.</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [doc, setDoc] = useState<WorkbenchDoc>(() => loadDoc() ?? seedDoc());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());

  useEffect(() => {
    saveTheme(theme);
  }, [theme]);

  const STATUS_META = useMemo(() => buildStatusMeta(theme), [theme]);
  const STATUS_OPTIONS: Array<{ value: FeatureStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All statuses' },
    { value: 'not_started', label: STATUS_META.not_started.label },
    { value: 'in_progress', label: STATUS_META.in_progress.label },
    { value: 'done', label: STATUS_META.done.label },
    { value: 'blocked', label: STATUS_META.blocked.label },
  ];

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
  const [tagPopover, setTagPopover] = useState<{
    open: boolean;
    x: number;
    y: number;
    tags: string[];
  }>({ open: false, x: 0, y: 0, tags: [] });
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
  const [prdMode, setPrdMode] = useState<'view' | 'editTemplate'>('view');
  const [prdInlineEditId, setPrdInlineEditId] = useState<string | null>(null);
  const prdActiveRef = useRef<HTMLDivElement | null>(null);
  const [prdHoverId, setPrdHoverId] = useState<string | null>(null);
  const [prdFocusId, setPrdFocusId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const detailsFeature = useMemo(() => {
    if (!detailsId) return null;
    return doc.features.find((f) => f.id === detailsId) ?? null;
  }, [doc.features, detailsId]);

  function SortableCard({
    feature: f,
    isSelected,
  }: {
    feature: Feature;
    isSelected: boolean;
  }) {
    const meta = STATUS_META[f.status];
    const descTextRef = useRef<HTMLDivElement | null>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const bodyElRef = React.useRef<HTMLDivElement | null>(null);
    const tags = f.tags ?? [];
    const primaryTag = tags[0] ?? '';
    const extraCount = Math.max(0, tags.length - 1);
    const displayTag = primaryTag.length > 16 ? `${primaryTag.slice(0, 15)}…` : primaryTag;
    const isDetailsActive = detailsOpen && detailsId === f.id;
    const allowHoverEffects = !isDetailsActive;
    const isHovering = hoverId === f.id && allowHoverEffects;
    const isPressing = activeId === f.id && allowHoverEffects;
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
    const computedBorderColor = isDragging
      ? themeVars.border
      : isHovering
        ? themeVars.border
        : isDetailsActive
          ? 'rgba(120,200,255,0.28)'
          : themeVars.borderSoft;
    const dragStyle = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
    };

    useLayoutEffect(() => {
      if (!f.description) {
        setIsTruncated(false);
        return;
      }
      const el = descTextRef.current;
      if (!el) return;
      const width = el.clientWidth;
      if (width <= 0) return;

      const clampLines = 3;
      const fontSize = 14;
      const lineHeight = 1.3;
      const lineHeightPx = fontSize * lineHeight;
      const clampHeight = clampLines * lineHeightPx;
      const computed = window.getComputedStyle(el);

      const measurer = document.createElement('div');
      measurer.style.position = 'fixed';
      measurer.style.visibility = 'hidden';
      measurer.style.pointerEvents = 'none';
      measurer.style.left = '-9999px';
      measurer.style.top = '-9999px';
      measurer.style.width = `${width}px`;
      measurer.style.fontSize = `${fontSize}px`;
      measurer.style.lineHeight = String(lineHeight);
      measurer.style.fontFamily = computed.fontFamily;
      measurer.style.fontWeight = computed.fontWeight;
      measurer.style.whiteSpace = 'pre-wrap';
      measurer.style.overflowWrap = 'anywhere';
      measurer.style.wordBreak = 'break-word';
      measurer.textContent = f.description;
      document.body.appendChild(measurer);
      const fullHeight = measurer.getBoundingClientRect().height;
      document.body.removeChild(measurer);
      setIsTruncated(fullHeight > clampHeight + 2);
    }, [f.description, cardH, boardRows, CARD_W]);

    React.useEffect(() => {
      const el = bodyElRef.current;
      if (!el) return;

      const blockedSelector =
        'button, input, textarea, select, [contenteditable="true"], [data-dnd-handle], [data-status-chip], [data-tag-chip], [data-title]';

      const DBL_MS = 340;
      const DBL_MOVE_PX = 8;

      const onPtrDown = (ev: PointerEvent) => {
        // Only left mouse / primary touch
        if ((ev as any).button != null && (ev as any).button !== 0) return;
        if ((ev as any).isPrimary === false) return;

        // If a drag is active, never open editor
        if (activeDragId) return;
        if (editingTitleId) return;

        const t = ev.target as HTMLElement | null;
        if (!t) return;

        // Don’t trigger from interactive elements inside the body
        if (t.closest(blockedSelector)) return;

        const now = performance.now();
        const x = (ev as any).clientX ?? 0;
        const y = (ev as any).clientY ?? 0;

        const prev = lastBodyPtrRef.current;

        const isDouble =
          !!prev &&
          prev.featureId === f.id &&
          now - prev.t <= DBL_MS &&
          Math.abs(x - prev.x) <= DBL_MOVE_PX &&
          Math.abs(y - prev.y) <= DBL_MOVE_PX;

        if (isDouble) {
          lastBodyPtrRef.current = null;

          // Stop DnD from treating this as a drag start candidate
          ev.preventDefault();
          ev.stopPropagation();

          setHoverId(null);
          setSelectedId(f.id);
          openEditor(f.id);
          return;
        }

        lastBodyPtrRef.current = { t: now, x, y, featureId: f.id };
      };

      // Capture phase so we see it even if DnD messes with bubbling
      el.addEventListener('pointerdown', onPtrDown, true);
      return () => el.removeEventListener('pointerdown', onPtrDown, true);
    }, [f.id, activeDragId, editingTitleId, openEditor, setSelectedId]);

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
          ...(isHovering ? cardHover : null),
          ...(isPressing ? cardActive : null),
          ...(isSelected ? cardSelected : null),
          borderColor: computedBorderColor,
          cursor: 'default',
          height: cardH,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transform: dragStyle.transform ?? (isHovering ? cardHover.transform : isPressing ? cardActive.transform : undefined),
          transition:
            dragStyle.transition ??
            'transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms ease, background 200ms ease, border-color 200ms ease',
          opacity: isDragging ? 0.6 : 1,
          boxShadow: isDragging
            ? '0 18px 42px rgba(0,0,0,0.38)'
            : isDetailsActive
              ? `${cardBase.boxShadow}, 0 0 0 1px rgba(120,200,255,0.12), 0 0 18px rgba(120,200,255,0.10)`
              : cardBase.boxShadow,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '20px minmax(0, 1fr)',
            alignItems: 'center',
            columnGap: 10,
            padding: '8px 12px',
            flex: '0 0 auto',
            minHeight: 42,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            background: meta.bar,
            boxShadow: isDetailsActive ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : undefined,
            filter: isDetailsActive ? 'saturate(1.05)' : undefined,
            borderBottom: `1px solid ${themeVars.divider}`,
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
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.inputBg2,
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
          ref={bodyElRef}
          style={{
            padding: '8px 12px 10px',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
          data-card-body
        >
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflow: 'hidden',
              paddingBottom: 2,
            }}
          >
            {f.description ? (
              <div style={{ position: 'relative', marginTop: 0 }}>
                <div
                  ref={descTextRef}
                  style={{
                    opacity: 0.85,
                    fontSize: 14,
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                    ...(isTruncated
                      ? {
                          paddingBottom: 4,
                          WebkitMaskImage:
                            'linear-gradient(180deg, rgba(0,0,0,1) 78%, rgba(0,0,0,0) 100%)',
                          maskImage:
                            'linear-gradient(180deg, rgba(0,0,0,1) 78%, rgba(0,0,0,0) 100%)',
                          WebkitMaskSize: '100% 100%',
                          maskSize: '100% 100%',
                        }
                      : null),
                  }}
                >
                  {renderCompactCardText(f.description)}
                </div>

              </div>
            ) : null}
          </div>

          <div
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              minWidth: 0,
              fontSize: 12,
              opacity: 0.92,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
                overflow: 'hidden',
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
              {tags.length ? (
                <span
                  data-tag-chip
                  style={{
                    ...chip,
                    minWidth: 0,
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onPointerEnter={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setTagPopover({ open: true, x: r.left, y: r.bottom + 6, tags });
                  }}
                  onPointerLeave={() => closeTagPopover()}
                  title={tags.join(', ')}
                >
                  {extraCount > 0 ? `${displayTag}, +${extraCount}` : displayTag}
                </span>
              ) : null}
            </div>
            {isTruncated ? (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (detailsOpen && detailsId === f.id) {
                    closeDetails();
                  } else {
                    openDetails(f.id);
                  }
                }}
                title={detailsOpen && detailsId === f.id ? 'Close details' : 'Open details'}
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
                  color: themeVars.appText,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 0.1,
                  flexShrink: 0,
                }}
              >
                {detailsOpen && detailsId === f.id ? 'Close' : 'More'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function CardPreview({ feature: f, isSelected }: { feature: Feature; isSelected: boolean }) {
    const meta = STATUS_META[f.status];
    const computedBorderColor = themeVars.border;
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
            alignItems: 'center',
            columnGap: 10,
            padding: '8px 12px',
            minHeight: 42,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            background: meta.bar,
            borderBottom: `1px solid ${themeVars.divider}`,
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
            <div
              style={{
                marginTop: 0,
                opacity: 0.85,
                fontSize: 14,
                lineHeight: 1.35,
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {renderCompactCardText(f.description)}
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
    const SAFE_LIFT_PAD = 8; // enough to avoid clipping hover lift + shadow without wasting space
    const padY = Math.max(boardPadTop, SAFE_LIFT_PAD);

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
          border: `1px solid ${themeVars.borderSoft}`,
          background: isOver ? themeVars.panelBg3 : themeVars.panelBg,
          boxShadow: themeVars.shadow1,
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
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.inputBg2,
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
                  border: hoverPhaseId === phase.id ? `1px solid ${themeVars.border}` : '1px solid transparent',
                  background: hoverPhaseId === phase.id ? themeVars.panelBg2 : 'transparent',
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
              paddingTop: padY,
              paddingBottom: padY,
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

  function FeatureDetailsPanel({ feature }: { feature: Feature }) {
    const meta = STATUS_META[feature.status];
    const phaseName = phasesById.get(feature.phaseId)?.name ?? 'Unknown phase';

    return (
      <div
        style={{
          width: 380,
          minWidth: 380,
          maxWidth: 380,
          height: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
          borderRadius: 18,
          border: `1px solid ${themeVars.border}`,
          background: themeVars.panelBg3,
          boxShadow: themeVars.shadow3,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          display: 'flex',
          flexDirection: 'column',
          transform: detailsOpen ? 'translateX(0)' : 'translateX(14px)',
          opacity: detailsOpen ? 1 : 0,
          transition: reducedMotion ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease',
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: `1px solid ${themeVars.divider}`,
            background: meta.bar,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: 0.1, lineHeight: 1.15 }}>
                {feature.title}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: meta.chipBg,
                    border: `1px solid ${meta.chipBorder}`,
                    color: meta.chipText,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {meta.label}
                </span>

                <span style={{ ...chipMuted, padding: '3px 8px', fontWeight: 800 }}>{phaseName}</span>

                {feature.tags.length ? (
                  <span style={{ ...chip, padding: '3px 8px', fontWeight: 800 }}>
                    {feature.tags.join(', ')}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={closeDetails}
              style={{
                padding: '8px 10px',
                borderRadius: 12,
                border: `1px solid ${themeVars.border}`,
                background: themeVars.panelBg2,
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 900,
              }}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 14, overflowY: 'auto', minHeight: 0 }}>
          <div
            style={{
              fontSize: 12,
              opacity: 0.62,
              fontWeight: 850,
              letterSpacing: 0.25,
              textTransform: 'uppercase',
            }}
          >
            Description
          </div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', opacity: 0.92 }}>
            {feature.description?.trim() ? feature.description : '—'}
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderTop: `1px solid ${themeVars.divider}`,
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={() => openEditor(feature.id)}
            style={{
              padding: '10px 12px',
              borderRadius: 14,
              border: `1px solid ${themeVars.border}`,
              background: 'rgba(120,200,255,0.12)',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 900,
            }}
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  // For focusing after create
  const scrollToIdRef = useRef<string | null>(null);
  const lastBodyPtrRef = useRef<{ t: number; x: number; y: number; featureId: string } | null>(
    null
  );
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
  const prdBlocksSorted = useMemo(
    () => [...prd.blocks].sort((a, b) => a.order - b.order),
    [prd.blocks]
  );

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
      if (isTypingContext(e.target)) return;
      if (isEditorOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeEditor();
        }
        return;
      }

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

  function closeTagPopover() {
    setTagPopover({ open: false, x: 0, y: 0, tags: [] });
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

  const openDetails = (id: string) => {
    setDetailsId(id);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsId(null);
  };

  const prdCmd = (cmd: string, val?: string) => {
    const el = prdActiveRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand(cmd, false, val);
    } catch {
      // ignore
    }
  };

  const prdLink = () => {
    const url = window.prompt('Link URL');
    if (!url) return;
    prdCmd('createLink', url);
  };

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
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, label } : b)),
    }));
  }

  function movePrdBlock(id: string, delta: number) {
    setPrd((prev) => {
      const blocks = [...prev.blocks].sort((a, b) => a.order - b.order);
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx === -1) return normalizePrd(prev);

      const nextIdx = clamp(idx + delta, 0, blocks.length - 1);
      if (nextIdx === idx) return normalizePrd({ ...prev, blocks });

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

function renderCompactCardText(text: string) {
  const norm = (text ?? '').replace(/\r\n/g, '\n');
  const lines = norm.split('\n');
  return lines.map((ln, i) => {
    if (ln.trim() === '') {
      return <span key={`sp_${i}`} style={{ display: 'block', height: 6 }} />;
    }
    return (
      <span key={`ln_${i}`}>
        {ln}
        {i < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
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

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    if (!activeDragId) return;

    const prevOverflowY = root.style.overflowY;
    root.style.overflowY = 'hidden';

    return () => {
      root.style.overflowY = prevOverflowY || 'auto';
    };
  }, [activeDragId]);

  useLayoutEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (activeDragId) {
        e.preventDefault();
        return;
      }
      if (isEditorOpen) return;
      if (isTypingContext(e.target)) return;
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
  }, [activeSection, isEditorOpen, reducedMotion, activeDragId]);

  useEffect(() => {
    savePrd(prd);
  }, [prd]);

  useEffect(() => {
    if (!prdInlineEditId) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-prd-field="${prdInlineEditId}"]`) as HTMLDivElement | null;
      el?.focus();
    });
  }, [prdInlineEditId]);

  useEffect(() => {
    if (!prdInlineEditId) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const host = document.querySelector(
        `[data-prd-inline="${prdInlineEditId}"]`
      ) as HTMLElement | null;
      if (host?.contains(target)) return;
      setPrdInlineEditId(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [prdInlineEditId]);

  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingContext(e.target)) return;
      if (e.key === 'Escape') closeDetails();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsOpen]);

  useEffect(() => {
    if (!tagPopover.open) return;

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const overChip = !!el?.closest?.('[data-tag-chip]');
      if (!overChip) closeTagPopover();
    };

    const onDown = () => closeTagPopover();
    const onScroll = () => closeTagPopover();

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [tagPopover.open]);

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
  const themeVars = useMemo(() => {
    const dark = {
      appBg: '#0b0f14',
      appText: 'rgba(255,255,255,0.92)',

      panelBg: 'rgba(255,255,255,0.02)',
      panelBg2: 'rgba(255,255,255,0.03)',
      panelBg3: 'rgba(255,255,255,0.04)',
      panelBgStrong: 'rgba(24,24,24,0.94)',

      border: 'rgba(255,255,255,0.10)',
      borderSoft: 'rgba(255,255,255,0.075)',
      divider: 'rgba(255,255,255,0.08)',

      muted: 'rgba(255,255,255,0.65)',
      muted2: 'rgba(255,255,255,0.55)',
      placeholder: 'rgba(255,255,255,0.34)',

      inputBg: 'rgba(0,0,0,0.14)',
      inputBg2: 'rgba(0,0,0,0.18)',
      overlay: 'rgba(0,0,0,0.35)',

      shadow1: '0 8px 22px rgba(0,0,0,0.20)',
      shadow2: '0 14px 34px rgba(0,0,0,0.28)',
      shadow3: '0 18px 42px rgba(0,0,0,0.45)',
      shadowPop: '0 14px 32px rgba(0,0,0,0.38)',
    };

    const light = {
      appBg: '#f5f7fb',
      appText: 'rgba(10,16,24,0.92)',

      panelBg: 'rgba(10,16,24,0.03)',
      panelBg2: 'rgba(10,16,24,0.05)',
      panelBg3: 'rgba(10,16,24,0.06)',
      panelBgStrong: 'rgba(255,255,255,0.92)',

      border: 'rgba(10,16,24,0.14)',
      borderSoft: 'rgba(10,16,24,0.11)',
      divider: 'rgba(10,16,24,0.12)',

      muted: 'rgba(10,16,24,0.62)',
      muted2: 'rgba(10,16,24,0.52)',
      placeholder: 'rgba(10,16,24,0.38)',

      inputBg: 'rgba(255,255,255,0.75)',
      inputBg2: 'rgba(255,255,255,0.86)',
      overlay: 'rgba(10,16,24,0.30)',

      shadow1: '0 10px 26px rgba(10,16,24,0.10)',
      shadow2: '0 16px 38px rgba(10,16,24,0.14)',
      shadow3: '0 20px 50px rgba(10,16,24,0.18)',
      shadowPop: '0 18px 44px rgba(10,16,24,0.16)',
    };

    return theme === 'light' ? light : dark;
  }, [theme]);
  const isLight = theme === 'light';

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
    border: `1px solid ${themeVars.border}`,
    background: themeVars.inputBg,
    color: 'inherit',
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 10,
    border: `1px solid ${themeVars.border}`,
    background: themeVars.panelBg2,
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
  };
  const cardBase: React.CSSProperties = {
    boxSizing: 'border-box',
    maxWidth: '100%',
    width: '100%',
    borderRadius: 14,
    border: `1px solid ${themeVars.borderSoft}`,
    outline: 'none',
    background: themeVars.panelBg2,
    boxShadow: themeVars.shadow1,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    transition:
      'transform 160ms ease, box-shadow 200ms ease, background 200ms ease, border-color 200ms ease',
  };

  const cardHover: React.CSSProperties = {
    transform: 'translateY(-2px)',
    boxShadow: themeVars.shadow2,
    background: themeVars.panelBg3,
  };

  const cardActive: React.CSSProperties = {
    transform: 'translateY(-1px) scale(0.998)',
    boxShadow: themeVars.shadow2,
  };

  const cardSelected: React.CSSProperties = {};

  const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderRadius: 999,
    border: `1px solid ${themeVars.border}`,
    background: themeVars.panelBg3,
    color: themeVars.appText,
  };
  const chipMuted: React.CSSProperties = {
    ...chip,
    background: themeVars.panelBg2,
    border: `1px solid ${themeVars.borderSoft}`,
    color: themeVars.muted,
  };
  const statusChipBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    border: `1px solid ${themeVars.border}`,
    background: themeVars.panelBg2,
    color: themeVars.appText,
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
    background: themeVars.appBg,
    color: themeVars.appText,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  };

  const sidebarStyle: React.CSSProperties = {
    padding: 14,
    borderRight: `1px solid ${themeVars.divider}`,
    background: themeVars.panelBg,
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
    border: `1px solid ${active ? 'rgba(120,200,255,0.35)' : themeVars.border}`,
    background: active ? 'rgba(120,200,255,0.12)' : themeVars.panelBg2,
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
  const PRD_COL_GAP = 24;
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
    color: themeVars.appText,
    opacity: 0.96,
  };

  const prdH2Style: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 0.1,
    lineHeight: 1.15,
    color: themeVars.appText,
    opacity: 0.92,
  };

  const prdPencilBtnStyle: React.CSSProperties = {
    width: 22,
    height: 22,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: `1px solid ${themeVars.borderSoft}`,
    background: themeVars.panelBg2,
    color: themeVars.muted,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    fontSize: 13,
  };
  const prdToolBtn: React.CSSProperties = {
    padding: '6px 9px',
    borderRadius: 12,
    border: `1px solid ${themeVars.border}`,
    background: themeVars.panelBg2,
    color: 'inherit',
    fontWeight: 900,
    fontSize: 12,
  };

  return (
    <div style={{ ...shellStyle, ['--prdLink' as any]: isLight ? 'rgba(30,120,255,0.92)' : 'rgba(120,200,255,0.95)' }}>
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

        <div style={{ height: 1, background: themeVars.divider, margin: '6px 0' }} />

        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
          Reduced motion
        </label>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 800 }}>Theme</div>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            style={{
              padding: '8px 10px',
              borderRadius: 12,
              border: `1px solid ${themeVars.border}`,
              background: themeVars.panelBg2,
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: 0.15,
            }}
            title="Toggle dark/light"
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>

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
              <div
                style={{
                  opacity: 0.95,
                  fontWeight: 950,
                  fontSize: 26,
                  letterSpacing: 0.1,
                  color: themeVars.appText,
                }}
              >
                PRD
              </div>
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: themeVars.muted }}>
                {prdMode === 'editTemplate' ? 'Template edit mode • autosaved locally' : 'View mode'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() =>
                  setPrdMode((m) => {
                    const next = m === 'editTemplate' ? 'view' : 'editTemplate';
                    if (next === 'editTemplate') setPrdInlineEditId(null);
                    return next;
                  })
                }
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: `1px solid ${themeVars.border}`,
                  background:
                    prdMode === 'editTemplate' ? 'rgba(120,200,255,0.12)' : themeVars.panelBg2,
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
                title={prdMode === 'editTemplate' ? 'Switch to view mode' : 'Switch to template edit mode'}
              >
                {prdMode === 'editTemplate' ? 'Done' : 'Edit'}
              </button>

              <button
                type="button"
                onClick={() => setPrd(seedPrd())}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
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
              paddingTop: 16,
              paddingLeft: 18,
              paddingRight: 12,
              paddingBottom: 22,
            }}
          >
            <div
              style={{
                height: '100%',
                columnWidth: PRD_COL_W,
                columnGap: PRD_COL_GAP,
                columnFill: 'auto',
                columnRule: `1px solid ${isLight ? 'rgba(10,16,24,0.14)' : themeVars.divider}`,
                paddingRight: 12,
                paddingBottom: 8,
                boxSizing: 'border-box',
              }}
            >
              {prdBlocksSorted.map((b) => {
                const toolbarVisible = prdFocusId === b.id;
                const isInlineEditing = prdInlineEditId === b.id;
                return prdMode === 'editTemplate' ? (
                  <div
                    key={b.id}
                    style={{
                      display: 'inline-block',
                      width: '100%',
                      boxSizing: 'border-box',
                      marginBottom: 12,
                      breakInside: 'avoid',
                      borderRadius: 16,
                      border: `1px solid ${themeVars.border}`,
                      background: themeVars.panelBg2,
                      boxShadow: themeVars.shadow1,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        value={b.label}
                        onChange={(e) => renamePrdBlock(b.id, e.target.value)}
                        onBlur={(e) => renamePrdBlock(b.id, e.target.value.trim() || b.label)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '8px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: themeVars.inputBg,
                            color: 'inherit',
                            outline: 'none',
                            fontWeight: 850,
                            letterSpacing: 0.15,
                          }}
                      />

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={() => movePrdBlock(b.id, -1)}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: themeVars.panelBg2,
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
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={() => movePrdBlock(b.id, 1)}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: themeVars.panelBg2,
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
                            border: `1px solid ${themeVars.border}`,
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
                            border: `1px solid ${themeVars.border}`,
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

                    <div style={{ marginTop: 10 }}>
                      <PrdToolbar
                        visible={toolbarVisible}
                        alwaysVisible
                        className="prd-toolbar"
                        onCmd={prdCmd}
                        onLink={prdLink}
                        toolBtnStyle={prdToolBtn}
                        themeVars={themeVars}
                      />

                      <InlineRichField
                        blockId={b.id}
                        html={prdToHtml(b.value)}
                        onChangeHtml={(nextHtml) => updatePrdBlock(b.id, nextHtml)}
                        themeVars={themeVars}
                        onFocusBlock={(blockId, el) => {
                          prdActiveRef.current = el;
                          setPrdFocusId(blockId);
                        }}
                        onBlurBlock={(blockId, nextHtml) => {
                          updatePrdBlock(blockId, nextHtml);
                          setPrdFocusId((cur) => (cur === blockId ? null : cur));
                        }}
                        placeholder="Write something…"
                      />
                    </div>
                  </div>
                ) : !isInlineEditing ? (
                  <div
                    key={b.id}
                    style={{
                      display: 'block',
                      breakInside: 'auto',
                      marginBottom: 18,
                      padding: '2px 2px 0',
                    }}
                  >
                    <>
                      {b.type === 'title' ? (
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}
                          onMouseEnter={() => setPrdHoverId(b.id)}
                          onMouseLeave={() => setPrdHoverId((cur) => (cur === b.id ? null : cur))}
                        >
                          <div
                            className="prd-rich"
                            style={{ ...prdH1Style, marginBottom: 0, whiteSpace: 'normal', minWidth: 0 }}
                            dangerouslySetInnerHTML={{
                              __html: b.value?.trim() ? prdToHtml(b.value) : '<span style="opacity:0.45">—</span>',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setPrdInlineEditId(b.id)}
                            style={{
                              ...prdPencilBtnStyle,
                              opacity: prdHoverId === b.id ? 1 : 0,
                              pointerEvents: prdHoverId === b.id ? 'auto' : 'none',
                              transition: 'opacity 140ms ease',
                            }}
                            aria-label="Edit section"
                            title="Edit"
                          >
                            ✎
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                          onMouseEnter={() => setPrdHoverId(b.id)}
                          onMouseLeave={() => setPrdHoverId((cur) => (cur === b.id ? null : cur))}
                        >
                          <div style={{ ...prdH2Style, marginBottom: 0 }}>{b.label}</div>
                          <button
                            type="button"
                            onClick={() => setPrdInlineEditId(b.id)}
                            style={{
                              ...prdPencilBtnStyle,
                              opacity: prdHoverId === b.id ? 1 : 0,
                              pointerEvents: prdHoverId === b.id ? 'auto' : 'none',
                              transition: 'opacity 140ms ease',
                            }}
                            aria-label="Edit section"
                            title="Edit"
                          >
                            ✎
                          </button>
                        </div>
                      )}

                      {b.type !== 'title' ? (
                        <div
                          className="prd-rich"
                          style={{ ...prdBodyStyle, whiteSpace: 'normal' }}
                          dangerouslySetInnerHTML={{
                            __html: b.value?.trim() ? prdToHtml(b.value) : '<span style="opacity:0.45">—</span>',
                          }}
                        />
                      ) : null}
                    </>

                    <div
                      style={{
                        marginTop: 16,
                        height: 1,
                        background: isLight ? 'rgba(10,16,24,0.16)' : themeVars.divider,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    key={b.id}
                    data-prd-inline={b.id}
                    style={{
                      display: 'inline-block',
                      width: '100%',
                      boxSizing: 'border-box',
                      marginBottom: 12,
                      breakInside: 'avoid',
                      borderRadius: 16,
                      border: `1px solid ${themeVars.border}`,
                      background: themeVars.panelBg2,
                      boxShadow: themeVars.shadow1,
                      padding: 12,
                    }}
                  >
                    {b.type === 'title' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div
                          className="prd-rich"
                          style={{ ...prdH1Style, marginBottom: 0, whiteSpace: 'normal', minWidth: 0 }}
                          dangerouslySetInnerHTML={{
                            __html: b.value?.trim() ? prdToHtml(b.value) : '<span style="opacity:0.45">—</span>',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setPrdInlineEditId(null)}
                          style={{
                            ...prdPencilBtnStyle,
                            padding: '4px 8px',
                            width: 'auto',
                            height: 'auto',
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                          title="Done"
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ ...prdH2Style, marginBottom: 0 }}>{b.label}</div>
                        <button
                          type="button"
                          onClick={() => setPrdInlineEditId(null)}
                          style={{
                            ...prdPencilBtnStyle,
                            padding: '4px 8px',
                            width: 'auto',
                            height: 'auto',
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                          title="Done"
                        >
                          Done
                        </button>
                      </div>
                    )}

                    <PrdToolbar
                      visible={toolbarVisible}
                      alwaysVisible
                      className="prd-toolbar"
                      onCmd={prdCmd}
                      onLink={prdLink}
                      toolBtnStyle={prdToolBtn}
                      themeVars={themeVars}
                    />

                    <InlineRichField
                      blockId={b.id}
                      html={prdToHtml(b.value)}
                      onChangeHtml={(nextHtml) => updatePrdBlock(b.id, nextHtml)}
                      themeVars={themeVars}
                      onFocusBlock={(blockId, el) => {
                        prdActiveRef.current = el;
                        setPrdFocusId(blockId);
                      }}
                      onBlurBlock={(blockId, nextHtml) => {
                        updatePrdBlock(blockId, nextHtml);
                        setPrdFocusId((cur) => (cur === blockId ? null : cur));
                      }}
                      placeholder="Write something…"
                    />
                  </div>
                );
              })}
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
                style={{
                  marginTop: 10,
                  flex: '1 1 auto',
                  minHeight: 0,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'stretch',
                }}
              >
                <div
                  data-no-snap
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
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
                    onDragStart={(event: DragStartEvent) => {
                      closeTagPopover();
                      setActiveDragId(String(event.active.id));
                    }}
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
                          border: `1px dashed ${themeVars.borderSoft}`,
                          background: themeVars.panelBg,
                          color: themeVars.appText,
                          boxShadow: themeVars.shadow1,
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
                                  width: CARD_W,
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

                {detailsOpen && detailsFeature ? <FeatureDetailsPanel feature={detailsFeature} /> : null}
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
            <PhaseFromSpaceView
              doc={doc}
              onShowAll={() => {
                setPhaseFilter('all');
                scrollToSection('roadmap');
              }}
              onOpenPhase={(phaseId) => {
                setPhaseFilter(phaseId);
                scrollToSection('roadmap');
              }}
              themeVars={themeVars}
              statusMeta={STATUS_META}
              isLight={isLight}
            />
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
            background: themeVars.overlay,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: statusPopover.y,
              left: statusPopover.x,
              background: themeVars.panelBgStrong,
              color: themeVars.appText,
              borderRadius: 10,
              padding: 8,
              minWidth: 160,
              border: `1px solid ${themeVars.border}`,
              boxShadow: themeVars.shadowPop,
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
          style={{ position: 'fixed', inset: 0, zIndex: 10050, background: themeVars.overlay }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: statusFilterMenu.x,
              top: statusFilterMenu.y,
              background: themeVars.panelBgStrong,
              color: themeVars.appText,
              borderRadius: 12,
              padding: 10,
              minWidth: 220,
              border: `1px solid ${themeVars.border}`,
              boxShadow: themeVars.shadowPop,
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
                  background: themeVars.panelBg2,
                }}
              >
                None
              </button>
            </div>

            <div style={{ height: 1, background: themeVars.divider }} />

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
                  border: `1px solid ${active ? meta.chipBorder : themeVars.border}`,
                  background: active ? meta.chipBg : themeVars.panelBg2,
                  color: active ? meta.chipText : themeVars.appText,
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
      {tagPopover.open ? (
        <div
          style={{
            position: 'fixed',
            left: tagPopover.x,
            top: tagPopover.y,
            zIndex: 10040,
            background: themeVars.panelBgStrong,
            color: themeVars.appText,
            borderRadius: 10,
            padding: '8px 10px',
            minWidth: 160,
            border: `1px solid ${themeVars.border}`,
            boxShadow: themeVars.shadowPop,
            display: 'grid',
            gap: 6,
            pointerEvents: 'none',
          }}
        >
          {tagPopover.tags.map((tag) => (
            <div key={tag} style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
              {tag}
            </div>
          ))}
        </div>
      ) : null}
      {ctxMenu.open && !isEditorOpen ? (
        <div
          onMouseDown={closeCtxMenu}
          style={{
            position: 'fixed',
            inset: 0,
            background: themeVars.overlay,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: ctxMenu.y,
              left: ctxMenu.x,
              background: themeVars.panelBgStrong,
              color: themeVars.appText,
              borderRadius: 10,
              padding: 8,
              minWidth: 180,
              border: `1px solid ${themeVars.border}`,
              boxShadow: themeVars.shadowPop,
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
            background: themeVars.overlay,
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
              background: themeVars.panelBgStrong,
              color: themeVars.appText,
              borderRadius: 12,
              padding: 20,
              minWidth: 380,
              maxWidth: 'min(560px, 100%)',
              boxShadow: themeVars.shadow3,
              border: `1px solid ${themeVars.border}`,
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
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.inputBg2,
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
                  e.currentTarget.style.border = `1px solid ${themeVars.border}`;
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
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.inputBg2,
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
                  e.currentTarget.style.border = `1px solid ${themeVars.border}`;
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
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.inputBg2,
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
                  e.currentTarget.style.border = `1px solid ${themeVars.border}`;
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
                    border: `1px solid ${themeVars.border}`,
                    background: themeVars.inputBg2,
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
                          border: active ? `1px solid ${meta.chipBorder}` : `1px solid ${themeVars.border}`,
                          background: active ? meta.chipBg : themeVars.panelBg2,
                          color: active ? meta.chipText : themeVars.appText,
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
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
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
                  border: `1px solid ${themeVars.border}`,
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
      <style>{`
        .prd-rich h1 { margin: 10px 0 8px; font-size: 28px; line-height: 1.12; letter-spacing: -0.2px; }
        .prd-rich h2 { margin: 10px 0 6px; font-size: 18px; line-height: 1.2; font-weight: 900; }
        .prd-rich p { margin: 6px 0; }
        .prd-rich ul, .prd-rich ol { margin: 6px 0; padding-left: 22px; }
        .prd-rich li { margin: 2px 0; }
        .prd-rich a { color: var(--prdLink); text-decoration: underline; }
        .prd-toolbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
