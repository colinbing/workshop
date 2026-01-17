import * as React from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  type DragMoveEvent,
  type DragOverEvent,
  useDraggable,
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
import { loadDoc } from './storage';

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
const now = () => Date.now();

function seedDoc(): WorkbenchDoc {
  const phase1 = { id: uid('phase'), name: 'Phase 1', order: 1 };
  const phase2 = { id: uid('phase'), name: 'Phase 2', order: 2 };
  const phase3 = { id: uid('phase'), name: 'Phase 3', order: 3 };

  const features: Feature[] = [
    {
      id: uid('feat'),
      title: 'Feature 1',
      description: 'Establish the basic workflow for users.',
      status: 'in_progress',
      phaseId: phase1.id,
      tags: ['core'],
      order: 1,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 2',
      description: 'Improve the primary navigation and layout.',
      status: 'not_started',
      phaseId: phase1.id,
      tags: ['ux'],
      order: 2,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 3',
      description: 'Add polish to the initial experience.',
      status: 'done',
      phaseId: phase1.id,
      tags: ['qa'],
      order: 3,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 4',
      description: 'Document core interactions and behaviors.',
      status: 'not_started',
      phaseId: phase2.id,
      tags: ['docs'],
      order: 4,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 5',
      description: 'Validate data flow and edge cases.',
      status: 'not_started',
      phaseId: phase2.id,
      tags: ['core'],
      order: 5,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 6',
      description: 'Improve performance for larger lists.',
      status: 'not_started',
      phaseId: phase2.id,
      tags: ['perf'],
      order: 6,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 7',
      description: 'Draft the next wave of improvements.',
      status: 'not_started',
      phaseId: phase3.id,
      tags: ['ux'],
      order: 7,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 8',
      description: 'Outline integration and rollout plan.',
      status: 'not_started',
      phaseId: phase3.id,
      tags: ['docs'],
      order: 8,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: uid('feat'),
      title: 'Feature 9',
      description: 'Define success metrics and follow-up.',
      status: 'not_started',
      phaseId: phase3.id,
      tags: ['qa'],
      order: 9,
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  return { version: 1, title: 'Workbench', phases: [phase1, phase2, phase3], features };
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

type ProjectData = {
  id: string;
  doc: WorkbenchDoc;
  prd: PrdDoc;
  lastEdited: number;
  colorId?: string;
};

type ProjectColor = {
  id: string;
  label: string;
  swatch: string;
  bg: string;
  border: string;
};

const PROJECT_COLORS: ProjectColor[] = [
  {
    id: 'red',
    label: 'Red',
    swatch: '#ff6b6b',
    bg: 'rgba(255,107,107,0.16)',
    border: 'rgba(255,107,107,0.55)',
  },
  {
    id: 'orange',
    label: 'Orange',
    swatch: '#ff9f43',
    bg: 'rgba(255,159,67,0.18)',
    border: 'rgba(255,159,67,0.55)',
  },
  {
    id: 'yellow',
    label: 'Yellow',
    swatch: '#ffd166',
    bg: 'rgba(255,209,102,0.18)',
    border: 'rgba(255,209,102,0.55)',
  },
  {
    id: 'green',
    label: 'Green',
    swatch: '#2ecc71',
    bg: 'rgba(46,204,113,0.18)',
    border: 'rgba(46,204,113,0.55)',
  },
  {
    id: 'teal',
    label: 'Teal',
    swatch: '#20c997',
    bg: 'rgba(32,201,151,0.18)',
    border: 'rgba(32,201,151,0.55)',
  },
  {
    id: 'blue',
    label: 'Blue',
    swatch: '#4d9fff',
    bg: 'rgba(77,159,255,0.18)',
    border: 'rgba(77,159,255,0.55)',
  },
  {
    id: 'purple',
    label: 'Purple',
    swatch: '#9b7bff',
    bg: 'rgba(155,123,255,0.18)',
    border: 'rgba(155,123,255,0.55)',
  },
  {
    id: 'pink',
    label: 'Pink',
    swatch: '#ff77c8',
    bg: 'rgba(255,119,200,0.18)',
    border: 'rgba(255,119,200,0.55)',
  },
];

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
      mk('title', 'Title', 1, 'Product Requirements Document (PRD)'),
      mk(
        'problem',
        'Problem',
        2,
        'Teams struggle to align on what to build and why, especially as priorities shift. Requirements are scattered across docs, tickets, and chats, which makes scope creep and rework common. There is no single source of truth that connects goals, decisions, and delivery.'
      ),
      mk(
        'hypothesis',
        'Hypothesis',
        3,
        'If we provide a lightweight, structured PRD that stays linked to the roadmap, teams will make faster decisions and ship with fewer revisions. A clear template with success metrics should reduce ambiguity and keep scope stable.'
      ),
      mk(
        'audience',
        'Target audience',
        4,
        '- Product managers who need quick alignment\n- Designers refining scope and user goals\n- Engineers planning delivery and estimates\n- Leadership reviewing progress and tradeoffs\n- QA and support preparing for launch'
      ),
      mk(
        'success_metrics',
        'Success metrics',
        5,
        '- PRD completion time under 30 minutes\n- Fewer than 2 scope revisions per feature\n- 20 percent reduction in clarification requests\n- 80 percent of features launched on initial target date\n- Stakeholder review cycle under 5 days'
      ),
      mk(
        'non_goals',
        'Non-goals',
        6,
        '- Full project management suite replacement\n- Automated roadmap generation\n- Real-time collaboration at scale\n- Custom workflow engines'
      ),
      mk(
        'risks',
        'Risks & unknowns',
        7,
        '- Template too rigid for diverse teams\n- Adoption risk if setup feels heavy\n- Metrics may be hard to measure consistently\n- Unclear ownership for keeping PRDs current\n- Integration with existing tools is limited'
      ),
      mk(
        'milestones',
        'Milestones',
        8,
        '- Week 1: Problem research and template draft\n- Week 2: Prototype and internal review\n- Week 3: Pilot with two teams\n- Week 4: Iterate on feedback and tighten metrics\n- Week 5: Launch and onboarding'
      ),
      mk(
        'notes',
        'Notes',
        9,
        'Keep the document short enough to read in one sitting. Capture only decisions that change how the team builds or measures success. Revisit the PRD at major milestones to confirm the scope still matches outcomes.'
      ),
    ],
  };
}

const PROJECTS_KEY = 'workbench_projects_v1';

function getPrdTitle(prd: PrdDoc) {
  const titleBlock = prd.blocks.find((b) => b.type === 'title');
  return titleBlock?.value?.trim() ?? '';
}

function setPrdTitle(prd: PrdDoc, title: string): PrdDoc {
  const nextTitle = title.trim();
  if (!nextTitle) return prd;
  return {
    ...prd,
    blocks: prd.blocks.map((b) => (b.type === 'title' ? { ...b, value: nextTitle } : b)),
  };
}

function loadProjects(): { projects: ProjectData[]; activeProjectId: string } {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        version?: number;
        projects?: ProjectData[];
        activeProjectId?: string;
      };
      if (parsed && Array.isArray(parsed.projects) && parsed.projects.length) {
        const activeProjectId =
          parsed.projects.find((p) => p.id === parsed.activeProjectId)?.id ?? parsed.projects[0].id;
        return { projects: parsed.projects, activeProjectId };
      }
    }
  } catch {
    // ignore
  }

  const baseDoc = loadDoc() ?? seedDoc();
  const basePrd = loadPrd() ?? seedPrd();
  const title = getPrdTitle(basePrd);
  const nextDoc = title ? { ...baseDoc, title } : baseDoc;
  const seedProject: ProjectData = {
    id: uid('project'),
    doc: nextDoc,
    prd: basePrd,
    lastEdited: now(),
  };
  return { projects: [seedProject], activeProjectId: seedProject.id };
}

function saveProjects(projects: ProjectData[], activeProjectId: string) {
  try {
    localStorage.setItem(
      PROJECTS_KEY,
      JSON.stringify({ version: 1, projects, activeProjectId })
    );
  } catch {
    // ignore
  }
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

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const CARD_W = 320;
const NEW_FEATURE_DRAG_ID = 'NEW_FEATURE';
const NEW_FEATURE_GHOST_ID = 'NEW_FEATURE_GHOST';
const CARD_MIN_H = 155;
const CARD_MAX_H = 195;
const APP_VERSION = '0.1';
const GRID_ROW_GAP = 10;
const GRID_COL_GAP = 16;
const BOARD_PAD_BOTTOM = 10
const SNAP_DURATION = 600;
const SNAP_WHEEL_THRESHOLD = 150;
const SNAP_WHEEL_IDLE_MS = 260;
const LANE_SAFE_PAD = 8;
type DocSection = 'prd' | 'roadmap' | 'phases';

const SECTION_LABELS: Record<DocSection, string> = {
  prd: 'PRD',
  roadmap: 'Roadmap',
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
  readOnly?: boolean;
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
  readOnly = false,
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
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-prd-field={blockId}
        onFocus={(e) => {
          if (readOnly) return;
          onFocusBlock(blockId, e.currentTarget);
        }}
        onBlur={(e) => {
          if (readOnly) return;
          const nextHtml = (e.currentTarget as HTMLDivElement).innerHTML;
          onBlurBlock(blockId, nextHtml);
        }}
        onInput={(e) => {
          if (readOnly) return;
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
        flexWrap: 'wrap',
        overflow: 'hidden',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 4,
        padding: 8,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        borderRadius: 14,
        border: `1px solid ${themeVars.border}`,
        background: themeVars.panelBg2,
        minHeight: 40,
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

    </div>
  );
});

function PhaseFromSpaceView({
  doc,
  onOpenPhase,
  onShowAll,
  onArchivePhase,
  archivedSet,
  themeVars,
  statusMeta,
  isLight,
}: {
  doc: WorkbenchDoc;
  onOpenPhase: (phaseId: string) => void;
  onShowAll: () => void;
  onArchivePhase: (phaseId: string) => void;
  archivedSet: Set<string>;
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
  const [showDone, setShowDone] = useState(false);
  const phases = [...doc.phases].filter((p) => !archivedSet.has(p.id)).sort((a, b) => a.order - b.order);

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
      .filter((f) => (showDone ? true : f.status !== 'done'))
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
          Phase overview
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowDone((prev) => !prev)}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: `1px solid ${themeVars.border}`,
              background: showDone ? 'rgba(255,186,90,0.14)' : themeVars.panelBg3,
              color: themeVars.appText,
              cursor: 'pointer',
              fontWeight: 850,
              fontSize: 12,
            }}
            title={showDone ? 'Hide done features' : 'Show done features'}
          >
            {showDone ? 'Hide done' : 'Show done'}
          </button>
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
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenPhase(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenPhase(p.id);
                }
              }}
              style={{
                position: 'relative',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 12,
                      opacity: 0.72,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {meta.donePct}% · {meta.total}
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchivePhase(p.id);
                    }}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 999,
                      border: `1px solid ${themeVars.border}`,
                      background: themeVars.panelBg2,
                      cursor: 'pointer',
                      fontWeight: 900,
                      fontSize: 11,
                      color: themeVars.appText,
                      zIndex: 2,
                    }}
                    title="Archive phase"
                  >
                    Archive
                  </button>
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
                      whiteSpace: 'nowrap',
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const initialProjects = useMemo(() => loadProjects(), []);
  const [projects, setProjects] = useState<ProjectData[]>(() => initialProjects.projects);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => initialProjects.activeProjectId
  );
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoDoc, setDemoDoc] = useState<WorkbenchDoc>(() => seedDoc());
  const [demoPrd, setDemoPrd] = useState<PrdDoc>(() => seedPrd());
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId]
  );
  const doc = isDemoMode ? demoDoc : activeProject?.doc ?? seedDoc();
  const prd = isDemoMode ? demoPrd : activeProject?.prd ?? seedPrd();
  const setDoc = isDemoMode
    ? setDemoDoc
    : (next: React.SetStateAction<WorkbenchDoc>) => {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== activeProjectId) return p;
            const nextDoc = typeof next === 'function' ? next(p.doc) : next;
            return { ...p, doc: nextDoc, lastEdited: now() };
          })
        );
      };
  const setPrd = isDemoMode
    ? setDemoPrd
    : (next: React.SetStateAction<PrdDoc>) => {
        setProjects((prev) =>
          prev.map((p) => {
            if (p.id !== activeProjectId) return p;
            const nextPrd = typeof next === 'function' ? next(p.prd) : next;
            const nextTitle = getPrdTitle(nextPrd);
            const nextDoc =
              nextTitle && nextTitle !== p.doc.title ? { ...p.doc, title: nextTitle } : p.doc;
            return { ...p, prd: nextPrd, doc: nextDoc, lastEdited: now() };
          })
        );
      };
  const editingDisabled = isDemoMode;
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectColorPicker, setProjectColorPicker] = useState<{
    open: boolean;
    projectId: string | null;
  }>({ open: false, projectId: null });
  const projectImportRef = useRef<HTMLInputElement | null>(null);
  const [projectImportTargetId, setProjectImportTargetId] = useState<string | null>(null);
  const [prdHistoryByProject, setPrdHistoryByProject] = useState<
    Record<string, { past: PrdDoc[]; future: PrdDoc[] }>
  >({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const [deleteHoldProgress, setDeleteHoldProgress] = useState(0);
  const deleteHoldStartRef = useRef<number | null>(null);
  const deleteHoldRafRef = useRef<number | null>(null);
  const deleteHoldTimeoutRef = useRef<number | null>(null);
  const suppressNewFeatureClickRef = useRef(false);

  useEffect(() => {
    saveTheme(theme);
  }, [theme]);

  const STATUS_META = useMemo(() => buildStatusMeta(theme), [theme]);
  // Filters
  const ALL_STATUSES: FeatureStatus[] = ['not_started', 'in_progress', 'blocked', 'done'];
  const [statusFilter, setStatusFilter] = useState<Set<FeatureStatus>>(() => new Set(ALL_STATUSES));
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [tagQuery, setTagQuery] = useState<string>('');
  const [hideDoneByPhase, setHideDoneByPhase] = useState<Record<string, boolean>>({});

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState>({
    open: false,
    x: 0,
    y: 0,
    target: { kind: 'background' },
  });
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);
  const [ctxMenuSize, setCtxMenuSize] = useState({ width: 0, height: 0 });
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
  const [disableDropAnimation, setDisableDropAnimation] = useState(false);
  type NewFeaturePlacement = { phaseId: string; index: number };
  const [statusPopover, setStatusPopover] = useState<{
    open: boolean;
    featureId: string | null;
    x: number;
    y: number;
  }>({ open: false, featureId: null, x: 0, y: 0 });
  const [newFeaturePlacement, setNewFeaturePlacement] = useState<NewFeaturePlacement | null>(
    null
  );
  const placementRafRef = useRef<number | null>(null);
  const placementNextRef = useRef<NewFeaturePlacement | null>(null);
  const placementLastAppliedRef = useRef<string>('');
  const lastOverIdRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const laneGridRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
  const [flashId, setFlashId] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const scrollAnimRef = useRef<number>(0);
  const scrollSnapRestoreRef = useRef<{ snapType: string; behavior: string } | null>(null);
  const wheelSnapRef = useRef<{ sum: number; dir: number; t: number }>({ sum: 0, dir: 0, t: 0 });
  const sectionRefs = useRef<Record<DocSection, HTMLElement | null>>({
    prd: null,
    roadmap: null,
    phases: null,
  });
  const [activeSection, setActiveSection] = useState<DocSection>('roadmap');
  const [prdMode, setPrdMode] = useState<'view' | 'editTemplate'>('view');
  const [prdInlineEditId, setPrdInlineEditId] = useState<string | null>(null);
  const prdActiveRef = useRef<HTMLDivElement | null>(null);
  const [prdHoverId, setPrdHoverId] = useState<string | null>(null);
  const [prdFocusId, setPrdFocusId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  function loadArchivedPhases(): string[] {
    try {
      const raw = localStorage.getItem('workbench_archived_phases');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  const [archivedPhaseIds, setArchivedPhaseIds] = useState<string[]>(() => loadArchivedPhases());

  useEffect(() => {
    try {
      localStorage.setItem('workbench_archived_phases', JSON.stringify(archivedPhaseIds));
    } catch {
      // ignore
    }
  }, [archivedPhaseIds]);

  const archivedSet = useMemo(() => new Set(archivedPhaseIds), [archivedPhaseIds]);

  const detailsFeature = useMemo(() => {
    if (!detailsId) return null;
    return doc.features.find((f) => f.id === detailsId) ?? null;
  }, [doc.features, detailsId]);

  useEffect(() => {
    if (activeDragId !== NEW_FEATURE_DRAG_ID) return;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      lastPointerRef.current = { x, y };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [activeDragId]);

  const queueNewFeaturePlacement = (next: NewFeaturePlacement | null) => {
    placementNextRef.current = next;

    if (placementRafRef.current != null) return;

    placementRafRef.current = requestAnimationFrame(() => {
      placementRafRef.current = null;

      const n = placementNextRef.current;
      const key = n ? `${n.phaseId}:${n.index}` : 'null';

      if (key === placementLastAppliedRef.current) return;

      placementLastAppliedRef.current = key;
      setNewFeaturePlacement(n);
    });
  };

  const clearNewFeaturePlacementQueue = () => {
    if (placementRafRef.current != null) cancelAnimationFrame(placementRafRef.current);
    placementRafRef.current = null;
    placementNextRef.current = null;
  };

  const computeNewFeaturePlacementFromOverId = (
    overId: string | null
  ): NewFeaturePlacement | null => {
    if (!overId) return null;

    const getVisibleCount = (phaseId: string) => {
      const hideDone = !!hideDoneByPhase[phaseId];
      return [...doc.features]
        .sort((a, b) => a.order - b.order)
        .filter((f) => f.phaseId === phaseId)
        .filter((f) => (hideDone ? f.status !== 'done' : true))
        .filter(isFeatureVisible).length;
    };

    if (overId === NEW_FEATURE_GHOST_ID) {
      const phaseId = (placementNextRef.current ?? newFeaturePlacement)?.phaseId ?? null;
      if (!phaseId) return null;
      const pointerIndex = getPhaseInsertIndex(phaseId);
      if (pointerIndex != null) return { phaseId, index: pointerIndex };
      return { phaseId, index: getVisibleCount(phaseId) };
    }

    if (overId.startsWith('phase-drop:')) {
      const phaseId = overId.split(':')[1] ?? null;
      if (!phaseId) return null;
      const pointerIndex = getPhaseInsertIndex(phaseId);
      if (pointerIndex != null) return { phaseId, index: pointerIndex };
      return { phaseId, index: getVisibleCount(phaseId) };
    }

    if (isLaneId(overId)) {
      const phaseId = phaseIdFromLaneId(overId);
      if (!phaseId) return null;
      const pointerIndex = getPhaseInsertIndex(phaseId);
      if (pointerIndex != null) return { phaseId, index: pointerIndex };
      return { phaseId, index: getVisibleCount(phaseId) };
    }

    const overFeat = doc.features.find((f) => f.id === overId);
    const phaseId = overFeat?.phaseId ?? null;
    if (!phaseId) return null;
    const index = computeInsertIndexAroundFeature(phaseId, overId);
    if (index != null) return { phaseId, index };
    const pointerIndex = getPhaseInsertIndex(phaseId);
    if (pointerIndex != null) return { phaseId, index: pointerIndex };
    return { phaseId, index: getVisibleCount(phaseId) };
  };

  type PaletteItem =
    | { kind: 'section'; label: string; section: DocSection }
    | { kind: 'phase'; label: string; phaseId: string }
    | { kind: 'feature'; label: string; featureId: string; phaseId: string }
    | { kind: 'action'; label: string; run: () => void };

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
    const baseBoxShadow = isDragging
      ? '0 18px 42px rgba(0,0,0,0.38)'
      : isDetailsActive
        ? `${cardBase.boxShadow}, 0 0 0 1px rgba(120,200,255,0.12), 0 0 18px rgba(120,200,255,0.10)`
        : cardBase.boxShadow;
    const cardBoxShadow =
      flashId === f.id ? `0 0 0 2px rgba(120,200,255,0.45), ${baseBoxShadow}` : baseBoxShadow;
    const dragStyle = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
    };
    const ghostActive = activeDragId === NEW_FEATURE_DRAG_ID;

    useLayoutEffect(() => {
      if (activeDragId) return;
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
      const nextTruncated = fullHeight > clampHeight + 2;
      setIsTruncated((prev) => (prev === nextTruncated ? prev : nextTruncated));
    }, [f.description, cardH, boardRows, CARD_W, activeDragId]);

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
        data-feature-card-id={f.id}
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
          zIndex: ghostActive ? 0 : undefined,
          boxShadow: cardBoxShadow,
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
                  cursor: editingDisabled ? 'not-allowed' : 'text',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  beginInlineTitleEdit(f.id, f.title);
                }}
                data-title
                title={editingDisabled ? 'Demo mode: rename disabled' : 'Click to rename'}
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
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
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

  const NewFeaturePlaceholder = ({ id }: { id: string }) => {
    const { setNodeRef, transform, transition, isOver } = useSortable({
      id,
      disabled: true,
      transition: { duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    });

    return (
      <div
        ref={setNodeRef}
        style={{
          ...cardBase,
          width: '100%',
          height: cardH,
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: themeVars.borderSoft,
          background: isOver ? themeVars.panelBg3 : themeVars.panelBg2,
          boxShadow: themeVars.shadow1,
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: themeVars.muted,
          fontWeight: 900,
          fontSize: 13,
          opacity: 0.85,
          pointerEvents: 'none',
          transform: transform ? CSS.Transform.toString(transform) : undefined,
          transition,
        }}
      >
        New feature
      </div>
    );
  };

  function PhaseLane({
    phase,
    features,
  }: {
    phase: Phase;
    features: Feature[];
  }) {
    const laneId = `phase:${phase.id}`;
    const { setNodeRef, isOver } = useDroppable({ id: laneId });
    const phaseDrop = useDroppable({ id: `phase-drop:${phase.id}` });
    const hideDone = !!hideDoneByPhase[phase.id];
    const visibleFeatures = hideDone ? features.filter((f) => f.status !== 'done') : features;
    const showGhost = activeDragId === NEW_FEATURE_DRAG_ID && newFeaturePlacement?.phaseId === phase.id;
    const ghostIndex = showGhost
      ? Math.max(0, Math.min(newFeaturePlacement!.index, visibleFeatures.length))
      : -1;
    const visibleIds = visibleFeatures.map((f) => f.id);
    const laneItemIds = showGhost
      ? [...visibleIds.slice(0, ghostIndex), NEW_FEATURE_GHOST_ID, ...visibleIds.slice(ghostIndex)]
      : visibleIds;
    const visibleById = useMemo(() => new Map(visibleFeatures.map((f) => [f.id, f])), [visibleFeatures]);
    const laneCount = showGhost ? visibleFeatures.length + 1 : visibleFeatures.length;
    const cols = Math.max(1, Math.ceil(Math.max(laneCount, 1) / boardRows));
    const laneInnerGridW = cols * CARD_W + Math.max(0, cols - 1) * GRID_COL_GAP;
    const laneW = laneInnerGridW + 10 * 2 + 6;
    const padY = LANE_SAFE_PAD + boardPadTop; // keep lift/shadow room while honoring computed centering

    return (
      <div
        ref={phaseDrop.setNodeRef}
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
          backgroundColor: isOver ? themeVars.panelBg3 : themeVars.panelBg,
          backgroundImage: panelOverlay,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
          boxShadow: phaseDrop.isOver
            ? `0 0 0 2px rgba(120,200,255,0.35), ${themeVars.shadow1}`
            : themeVars.shadow1,
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
                title={editingDisabled ? 'Demo mode: rename disabled' : 'Click to rename phase'}
                style={{
                  fontWeight: 850,
                  letterSpacing: 0.2,
                  cursor: editingDisabled ? 'not-allowed' : 'text',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {features.length} item{features.length === 1 ? '' : 's'}
            </div>
            {features.some((f) => f.status === 'done') && (
              <button
                type="button"
                onClick={() =>
                  setHideDoneByPhase((m) => ({ ...m, [phase.id]: !m[phase.id] }))
                }
                style={{
                  padding: '6px 8px',
                  borderRadius: 999,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 11,
                }}
                title={hideDone ? 'Show done items' : 'Hide done items'}
              >
                {hideDone ? 'Show done' : 'Hide done'}
              </button>
            )}
          </div>
        </div>

        <SortableContext items={laneItemIds} strategy={rectSortingStrategy}>
          <div
            ref={(node) => {
              setNodeRef(node);
              laneGridRefs.current[phase.id] = node;
            }}
            data-lane-grid-phase-id={phase.id}
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
            {laneItemIds.map((id) => {
              if (id === NEW_FEATURE_GHOST_ID) {
                return <NewFeaturePlaceholder key={NEW_FEATURE_GHOST_ID} id={NEW_FEATURE_GHOST_ID} />;
              }
              const feature = visibleById.get(id);
              if (!feature) return null;
              return <SortableCard key={feature.id} feature={feature} isSelected={feature.id === selectedId} />;
            })}

            {visibleFeatures.length === 0 && !showGhost ? (
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
          backgroundColor: themeVars.panelBg3,
          backgroundImage: panelOverlay,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
          boxShadow: themeVars.shadow3,
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

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const compute = () => {
      const LANE_CHROME_Y = 10 * 2 + 10 + 44;
      const h = el.clientHeight - BOARD_PAD_BOTTOM - LANE_CHROME_Y;
      const gap = GRID_ROW_GAP;
      const minCard = CARD_MIN_H;
      const usable = Math.max(0, h - LANE_SAFE_PAD * 2);

      const q = tagQuery.trim().toLowerCase();
      const isVisible = (f: Feature) => {
        if (!statusFilter.has(f.status)) return false;
        if (phaseFilter !== 'all' && f.phaseId !== phaseFilter) return false;
        if (!q) return true;
        const tagMatch = f.tags.some((t) => t.toLowerCase().includes(q));
        const titleMatch = f.title.toLowerCase().includes(q);
        const descMatch = f.description.toLowerCase().includes(q);
        return tagMatch || titleMatch || descMatch;
      };

      const maxVisibleInLane = Math.max(
        1,
        ...doc.phases
          .filter((p) => !archivedSet.has(p.id))
          .filter((p) => phaseFilter === 'all' || p.id === phaseFilter)
          .map((p) => {
            const hideDone = !!hideDoneByPhase[p.id];
            return doc.features
              .filter((f) => f.phaseId === p.id)
              .filter((f) => (hideDone ? f.status !== 'done' : true))
              .filter(isVisible).length;
          })
      );

      const maxRowsFromHeight = Math.max(1, Math.floor((usable + gap) / (minCard + gap)));
      const rows = Math.max(1, Math.min(maxRowsFromHeight, maxVisibleInLane));

      const usedMin = rows * minCard + Math.max(0, rows - 1) * gap;
      const slack = Math.max(0, usable - usedMin);
      const grow = Math.floor(slack / rows);
      const nextCardH = clamp(minCard + grow, CARD_MIN_H, CARD_MAX_H);

      const used = rows * nextCardH + Math.max(0, rows - 1) * gap;
      const topPad = clamp(Math.floor(Math.max(0, usable - used) / 2), 0, 28);

      setBoardRows(rows);
      setCardH(nextCardH);
      setBoardPadTop(topPad);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [archivedSet, doc.features, doc.phases, hideDoneByPhase, phaseFilter, statusFilter, tagQuery]);

  const phasesById = useMemo(() => new Map(doc.phases.map((p) => [p.id, p])), [doc.phases]);
  const archivedPhases = useMemo(
    () => doc.phases.filter((p) => archivedSet.has(p.id)).sort((a, b) => a.order - b.order),
    [doc.phases, archivedSet]
  );
  const prdBlocksSorted = useMemo(
    () => [...prd.blocks].sort((a, b) => a.order - b.order),
    [prd.blocks]
  );
  const prdNonTitleBlocks = useMemo(
    () => prdBlocksSorted.filter((b) => b.type !== 'title'),
    [prdBlocksSorted]
  );

  const orderedFeatures = useMemo(() => {
    return [...doc.features].sort((a, b) => a.order - b.order);
  }, [doc.features]);

  const filteredFeatures = useMemo(
    () => {
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
    },
    [orderedFeatures, statusFilter, phaseFilter, tagQuery]
  );

  const isFeatureVisible = (f: Feature) => {
    const q = tagQuery.trim().toLowerCase();
    if (!statusFilter.has(f.status)) return false;
    if (phaseFilter !== 'all' && f.phaseId !== phaseFilter) return false;
    if (!q) return true;
    const tagMatch = f.tags.some((t) => t.toLowerCase().includes(q));
    const titleMatch = f.title.toLowerCase().includes(q);
    const descMatch = f.description.toLowerCase().includes(q);
    return tagMatch || titleMatch || descMatch;
  };

  const getPhaseInsertIndex = (phaseId: string) => {
    const pointer = lastPointerRef.current;
    const gridEl = laneGridRefs.current[phaseId];
    if (!pointer || !gridEl) return null;
    const rect = gridEl.getBoundingClientRect();
    const relX = pointer.x - rect.left;
    const relY = pointer.y - rect.top;
    const colWidth = CARD_W + GRID_COL_GAP;
    const rowHeight = cardH + GRID_ROW_GAP;

    const hideDone = !!hideDoneByPhase[phaseId];
    const visibleCount = [...doc.features]
      .sort((a, b) => a.order - b.order)
      .filter((f) => f.phaseId === phaseId)
      .filter((f) => (hideDone ? f.status !== 'done' : true))
      .filter(isFeatureVisible).length;

    const cols = Math.max(1, Math.ceil(Math.max(visibleCount, 1) / boardRows));
    let col = Math.floor(relX / colWidth);
    let row = Math.floor(relY / rowHeight);
    if (!Number.isFinite(col)) col = 0;
    if (!Number.isFinite(row)) row = 0;

    const rowOffset = relY - row * rowHeight;
    if (rowOffset > cardH / 2) row += 1;

    col = clamp(col, 0, Math.max(0, cols - 1));
    row = clamp(row, 0, boardRows);

    let index = col * boardRows + row;
    index = Math.max(0, Math.min(index, visibleCount));
    return index;
  };

  const computeInsertIndexAroundFeature = (phaseId: string, overFeatureId: string) => {
    const hideDone = !!hideDoneByPhase[phaseId];

    const visibleIds = [...doc.features]
      .sort((a, b) => a.order - b.order)
      .filter((f) => f.phaseId === phaseId)
      .filter((f) => (hideDone ? f.status !== 'done' : true))
      .filter(isFeatureVisible)
      .map((f) => f.id);

    const overIndex = visibleIds.indexOf(overFeatureId);
    if (overIndex === -1) return null;

    const pointer = lastPointerRef.current;
    const overEl = document.querySelector(
      `[data-feature-card-id="${overFeatureId}"]`
    ) as HTMLElement | null;

    let index = overIndex;

    if (pointer && overEl) {
      const rect = overEl.getBoundingClientRect();
      index = pointer.y < rect.top + rect.height / 2 ? overIndex : overIndex + 1;
    }

    index = Math.max(0, Math.min(index, visibleIds.length));
    return index;
  };

  const paletteItems: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = [];
    const visiblePhases = [...doc.phases]
      .filter((p) => !archivedSet.has(p.id))
      .sort((a, b) => a.order - b.order);

    items.push({ kind: 'section', label: 'Go to PRD', section: 'prd' });
    items.push({ kind: 'section', label: 'Go to Roadmap', section: 'roadmap' });
    items.push({ kind: 'section', label: 'Go to Phases', section: 'phases' });

    items.push({
      kind: 'action',
      label: theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode',
      run: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    });
    items.push({ kind: 'action', label: 'Export: PRD.md', run: () => exportPrdMarkdown() });
    items.push({ kind: 'action', label: 'Export: Roadmap.md', run: () => exportRoadmapMarkdown() });
    items.push({
      kind: 'action',
      label: 'Export: workbench.json',
      run: () => downloadText('workbench.json', JSON.stringify(doc, null, 2)),
    });

    for (const p of visiblePhases) {
      items.push({ kind: 'phase', label: `Phase: ${p.name || 'Untitled phase'}`, phaseId: p.id });
    }

    for (const f of [...doc.features].filter((f) => !archivedSet.has(f.phaseId)).sort((a, b) => a.order - b.order)) {
      const p = doc.phases.find((x) => x.id === f.phaseId);
      const pTitle = p?.name || 'Untitled phase';
      items.push({
        kind: 'feature',
        label: `Feature: ${f.title || '(untitled)'} — ${pTitle}`,
        featureId: f.id,
        phaseId: f.phaseId,
      });
    }

    return items;
  }, [doc, theme, archivedSet]);

  const paletteFiltered = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return q ? paletteItems.filter((it) => it.label.toLowerCase().includes(q)) : paletteItems;
  }, [paletteItems, paletteQuery]);

  const paletteShown = useMemo(() => paletteFiltered.slice(0, 12), [paletteFiltered]);
  const paletteIndexClamped = useMemo(
    () => Math.min(paletteIndex, Math.max(0, paletteShown.length - 1)),
    [paletteIndex, paletteShown.length]
  );

  const runPaletteItem = React.useCallback(
    (it: PaletteItem) => {
      setPaletteOpen(false);

      if (it.kind === 'section') {
        scrollToSection(it.section);
        return;
      }
      if (it.kind === 'phase') {
        if (archivedSet.has(it.phaseId)) return;
        if (!doc.phases.some((p) => p.id === it.phaseId)) return;
        setPhaseFilter(it.phaseId);
        scrollToSection('roadmap');
        return;
      }
      if (it.kind === 'feature') {
        if (archivedSet.has(it.phaseId)) return;
        setPhaseFilter(it.phaseId);
        scrollToSection('roadmap');
        requestAnimationFrame(() => requestAnimationFrame(() => openEditor(it.featureId)));
        return;
      }
      if (it.kind === 'action') {
        it.run();
      }
    },
    [openEditor, scrollToSection, setPhaseFilter, archivedSet, doc.phases]
  );

  // Keep selection valid under filters
  useEffect(() => {
    if (!filteredFeatures.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && filteredFeatures.some((f) => f.id === selectedId)) return;

    setSelectedId(filteredFeatures[0].id);
  }, [filteredFeatures, selectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (!paletteOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setPaletteOpen(false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPaletteIndex((i) => i + 1);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPaletteIndex((i) => Math.max(0, i - 1));
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    setPaletteQuery('');
    setPaletteIndex(0);
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onEnter = (e: KeyboardEvent) => {
      if (!paletteOpen) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const it = paletteShown[paletteIndexClamped];
      if (it) runPaletteItem(it);
    };
    window.addEventListener('keydown', onEnter, { capture: true });
    return () => window.removeEventListener('keydown', onEnter, { capture: true } as any);
  }, [paletteOpen, paletteQuery, paletteIndex, paletteShown, paletteIndexClamped, runPaletteItem]);

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

  function scrollToFeatureCard(id: string) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-feature-card-id="${id}"]`) as HTMLElement | null;
      const board = boardRef.current;
      if (!el || !board) return;

      const boardRect = board.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const boardCenter = boardRect.left + boardRect.width / 2;
      const elCenter = elRect.left + elRect.width / 2;
      const nextLeft = board.scrollLeft + (elCenter - boardCenter);
      const maxLeft = Math.max(0, board.scrollWidth - board.clientWidth);
      const clampedLeft = clamp(nextLeft, 0, maxLeft);

      board.scrollTo({ left: clampedLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

function createFeatureAtEnd() {
  if (editingDisabled) return;
  const newId = uid('feat');
  setDoc((prev) => {
    const phaseId = firstPhaseId(prev.phases);
    const f: Feature = {
      id: newId,
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
  scrollToFeatureCard(newId);
  setFlashId(newId);
  setTimeout(() => setFlashId((v) => (v === newId ? null : v)), 900);
}

function NewFeatureButton() {
  const drag = useDraggable({ id: NEW_FEATURE_DRAG_ID, disabled: editingDisabled });
  const isDraggingNew = drag.isDragging;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <div
        aria-hidden
        style={{
          ...buttonStyle,
          background: themeVars.panelBg2,
          border: `1px dashed ${themeVars.borderSoft}`,
          color: themeVars.muted,
          opacity: isDraggingNew ? 1 : 0,
          transform: isDraggingNew ? 'scale(1)' : 'scale(0.98)',
          transition: 'opacity 160ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
        }}
      >
        + New
      </div>

      <button
        ref={drag.setNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        disabled={editingDisabled}
        onClick={() => {
          if (suppressNewFeatureClickRef.current) {
            suppressNewFeatureClickRef.current = false;
            return;
          }
          createFeatureAtEnd();
        }}
        style={{
          ...buttonStyle,
          opacity: isDraggingNew ? 0 : 1,
          transform: isDraggingNew ? 'scale(0.98)' : 'scale(1)',
          transition: 'opacity 140ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'none',
          ...(editingDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : null),
        }}
        title="N"
      >
        + New
      </button>
    </div>
  );
}

function addTemplate(kind: 'mvp' | 'bugs' | 'personal') {
  if (editingDisabled) return;
  // Use existing phases; fallback to first phase
  const firstPhase = doc.phases[0]?.id;
  if (!firstPhase) return;

  const mk = (title: string, status: FeatureStatus = 'not_started') => ({
    id: uid('feat'),
    phaseId: firstPhase,
    title,
    description: '',
    status,
    tags: [],
    order: now(),
    createdAt: now(),
    updatedAt: now(),
  });

  const items =
    kind === 'mvp'
      ? [mk('Feature list MVP'), mk('Keyboard shortcuts'), mk('Export: Markdown + JSON', 'in_progress')]
      : kind === 'bugs'
        ? [mk('Fix top UI papercuts', 'in_progress'), mk('Clean up dead code'), mk('QA pass + ship')]
        : [mk('Define goal + constraints'), mk('Build smallest loop'), mk('Polish + ship', 'in_progress')];

  setDoc((prev) => ({ ...prev, features: [...prev.features, ...items] }));
}

function deleteFeature(id: string) {
  if (editingDisabled) return;
  setDoc((prev) => ({ ...prev, features: prev.features.filter((f) => f.id !== id) }));
  if (selectedId === id) setSelectedId(null);
}

function cloneFeature(id: string) {
  if (editingDisabled) return;
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
    if (editingDisabled) return;
    setDoc((prev) => ({
      ...prev,
      features: prev.features.map((f) => (f.id === id ? { ...f, status, updatedAt: now() } : f)),
    }));
  }
  function createPhaseAtEnd() {
    if (editingDisabled) return;
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
  if (editingDisabled) return;
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
  if (editingDisabled) return;
  setEditingTitleId(id);
  setTitleDraft(current);
}

function beginInlinePhaseEdit(id: string, current: string) {
  if (editingDisabled) return;
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

  function exportPrdMarkdown() {
    const blocks = [...prd.blocks].sort((a, b) => a.order - b.order);
    const lines: string[] = [];
    const docTitle = doc.title?.trim() || 'PRD';
    lines.push(`# ${docTitle}`);
    lines.push('');
    for (const b of blocks) {
      if (b.type === 'title') continue;
      lines.push(`## ${b.label || 'Section'}`);
      lines.push('');
      if (b.value?.trim()) lines.push(b.value.trim());
      lines.push('');
    }
    downloadText('PRD.md', lines.join('\n'));
  }

  function exportRoadmapMarkdown() {
    const phases = [...doc.phases].sort((a, b) => a.order - b.order);
    const feats = [...doc.features].sort((a, b) => a.order - b.order);

    const lines: string[] = [];
    const docTitle = doc.title?.trim() || 'Workbench';
    lines.push(`# Roadmap — ${docTitle}`);
    lines.push('');

    for (const p of phases) {
      const items = feats.filter((f) => f.phaseId === p.id);
      lines.push(`## ${p.name || 'Untitled phase'}`);
      lines.push('');
      if (!items.length) {
        lines.push(`- (no features)`);
        lines.push('');
        continue;
      }
      for (const f of items) {
        const status = STATUS_META[f.status]?.label ?? f.status;
        lines.push(`- [${status}] ${f.title || '(untitled)'}`);
        if (f.description?.trim()) {
          const desc = f.description.trim().replace(/\n/g, '\n  ');
          lines.push(`  ${desc}`);
        }
      }
      lines.push('');
    }

    downloadText('Roadmap.md', lines.join('\n'));
  }

  const prdCmd = (cmd: string, val?: string) => {
    if (editingDisabled) return;
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
    if (editingDisabled) return;
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
    if (editingDisabled) return;
    setPrd((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, value } : b)),
    }));
  }

  function commitPrdBlock(id: string, value: string) {
    if (editingDisabled) return;
    updatePrdWithHistory((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, value } : b)),
    }));
  }

function addPrdBlockAfter(afterId: string) {
  if (editingDisabled) return;
  updatePrdWithHistory((prev) => {
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

function addPrdBlock(title: string) {
  if (editingDisabled) return;
  updatePrdWithHistory((prev) => ({
    ...prev,
    blocks: [
      ...prev.blocks,
      {
        id: uid('prd'),
        type: 'notes',
        label: title,
        value: '',
        order: now(),
      },
    ],
  }));
}

function deletePrdBlock(id: string) {
  if (editingDisabled) return;
  updatePrdWithHistory((prev) =>
    normalizePrd({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) })
  );
}

  function renamePrdBlock(id: string, label: string) {
    if (editingDisabled) return;
    updatePrdWithHistory((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, label } : b)),
    }));
  }

  function movePrdBlock(id: string, delta: number) {
    if (editingDisabled) return;
    updatePrdWithHistory((prev) => {
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
  if (editingDisabled) return;
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
  if (editingDisabled) return;
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

  function getScrollTopForEl(root: HTMLElement, el: HTMLElement) {
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return root.scrollTop + (elRect.top - rootRect.top);
  }

  function resetWheelSnap() {
    wheelSnapRef.current = { sum: 0, dir: 0, t: 0 };
  }

  function restoreScrollSnap(root: HTMLElement) {
    const prev = scrollSnapRestoreRef.current;
    if (!prev) return;
    root.style.scrollSnapType = prev.snapType || 'y mandatory';
    root.style.scrollBehavior = prev.behavior || (reducedMotion ? 'auto' : 'smooth');
    scrollSnapRestoreRef.current = null;
  }

  function animateScrollTo(root: HTMLElement, top: number, duration = 260, onDone?: () => void) {
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = 0;
      restoreScrollSnap(root);
      isProgrammaticScrollRef.current = false;
    }
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

    isProgrammaticScrollRef.current = true;
    scrollSnapRestoreRef.current = {
      snapType: root.style.scrollSnapType,
      behavior: root.style.scrollBehavior,
    };
    root.style.scrollSnapType = 'none';
    root.style.scrollBehavior = 'auto';

    const start = performance.now();

    const tick = (now: number) => {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      root.scrollTop = startTop + delta * eased;
      if (t < 1) {
        scrollAnimRef.current = requestAnimationFrame(tick);
        return;
      }

      root.scrollTop = top;
      restoreScrollSnap(root);
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
        onDone?.();
      });
    };

    scrollAnimRef.current = requestAnimationFrame(tick);
  }

  function snapByDelta(direction: number) {
    const order: DocSection[] = ['prd', 'roadmap', 'phases'];
    const idx = order.indexOf(activeSection);
    const nextIdx = clamp(idx + direction, 0, order.length - 1);
    if (nextIdx === idx) return;
    resetWheelSnap();
    scrollToSection(order[nextIdx]);
  }

  function scrollToSection(section: DocSection) {
    const root = scrollRootRef.current;
    const el = sectionRefs.current[section];
    if (!root || !el) return;

    resetWheelSnap();
    setActiveSection(section);
    const hash = `#${section}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);

    const top = getScrollTopForEl(root, el);
    animateScrollTo(root, top, SNAP_DURATION);
  }

  function sectionFromHash(): DocSection | null {
    const raw = (window.location.hash || '').replace('#', '').trim();
    if (!raw) return null;
    if (raw === 'prd' || raw === 'roadmap' || raw === 'phases') return raw;
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
    if (activeDragId === NEW_FEATURE_DRAG_ID) return;

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
      if (isProgrammaticScrollRef.current) {
        e.preventDefault();
        return;
      }
      if (isEditorOpen) return;
      if (isTypingContext(e.target)) return;
      const target = e.target as HTMLElement | null;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (target) {
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (target.isContentEditable) return;
        const noSnap = target.closest('[data-no-snap]') as HTMLElement | null;
        if (noSnap && noSnap.scrollWidth > noSnap.clientWidth + 1) {
          if (Math.abs(e.deltaX) > 6) return;
        }
        let el: HTMLElement | null = target;
        while (el && el !== root && el !== document.body) {
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY;
          const canScroll =
            (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
            el.scrollHeight > el.clientHeight + 1;
          if (canScroll) {
            const wantsDown = e.deltaY > 0;
            const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
            const canScrollUp = el.scrollTop > 0;
            if ((wantsDown && canScrollDown) || (!wantsDown && canScrollUp)) return;
          }
          el = el.parentElement;
        }
      }
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      const now = performance.now();
      const snap = wheelSnapRef.current;
      if (snap.dir !== direction || now - snap.t > SNAP_WHEEL_IDLE_MS) {
        snap.sum = 0;
      }
      snap.dir = direction;
      snap.t = now;
      snap.sum += Math.abs(e.deltaY);
      if (snap.sum >= SNAP_WHEEL_THRESHOLD) {
        snap.sum = 0;
        snapByDelta(direction);
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [activeSection, isEditorOpen, reducedMotion, activeDragId]);

  useLayoutEffect(() => {
    if (!ctxMenu.open) return;
    const el = ctxMenuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setCtxMenuSize({ width: rect.width, height: rect.height });
  }, [ctxMenu.open, ctxMenu.target.kind, ctxMenu.x, ctxMenu.y]);

  useEffect(() => {
    if (!projectColorPicker.open) return;
    resetDeleteHold();
  }, [projectColorPicker.open, projectColorPicker.projectId]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || !settingsRef.current) return;
      if (!settingsRef.current.contains(target)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [settingsOpen]);

  useEffect(() => {
    if (isDemoMode) return;
    if (!projects.length) return;
    saveProjects(projects, activeProjectId);
  }, [projects, activeProjectId, isDemoMode]);

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
      { key: 'phases', el: sectionRefs.current.phases },
    ];

    const existing = sections.filter((s) => !!s.el) as Array<{ key: DocSection; el: HTMLElement }>;
    if (!existing.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;
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
  const panelOverlay = isLight
    ? 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.25))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))';

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
    backgroundColor: themeVars.panelBg2,
    backgroundImage: panelOverlay,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 100%',
    boxShadow: themeVars.shadow1,
    transition:
      'transform 160ms ease, box-shadow 200ms ease, background 200ms ease, border-color 200ms ease',
  };

  const cardHover: React.CSSProperties = {
    transform: 'translateY(-2px)',
    boxShadow: themeVars.shadow2,
    backgroundColor: themeVars.panelBg3,
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
  const roadmapSectionStyle: React.CSSProperties = {
    ...sectionStyle,
    padding: 0,
    background: isLight ? '#ffffff' : 'transparent',
  };
  const PRD_COL_W = 520;
  const PRD_COL_GAP = 24;
  const PRD_BODY_SIZE = 16;
  const PRD_LINE = 1.6;

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
    height: 30,
    minWidth: 30,
    padding: '0 10px',
    borderRadius: 10,
    border: `1px solid ${themeVars.border}`,
    background: themeVars.panelBg2,
    color: 'inherit',
    fontWeight: 800,
    fontSize: 12,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    lineHeight: 1,
    flexShrink: 0,
  };
  const prdActionBtn: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 10,
    border: `1px solid ${themeVars.border}`,
    background: themeVars.panelBg2,
    color: 'inherit',
    fontWeight: 800,
    fontSize: 12,
    cursor: 'pointer',
  };
  const formatLastEdited = (ts: number) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };
  const sanitizeFilename = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
  const exportProject = (project: ProjectData) => {
    const name = getPrdTitle(project.prd) || project.doc.title || 'project';
    const safe = sanitizeFilename(name) || 'project';
    const payload = { version: 1, project };
    downloadText(`workbench_${safe}.json`, JSON.stringify(payload, null, 2));
  };
  const isValidStatus = (value: unknown): value is FeatureStatus =>
    value === 'not_started' || value === 'in_progress' || value === 'done' || value === 'blocked';
  const isValidPhase = (p: any) =>
    p &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.order === 'number' &&
    Number.isFinite(p.order);
  const isValidFeature = (f: any) =>
    f &&
    typeof f.id === 'string' &&
    typeof f.title === 'string' &&
    typeof f.description === 'string' &&
    isValidStatus(f.status) &&
    typeof f.phaseId === 'string' &&
    Array.isArray(f.tags) &&
    f.tags.every((t: any) => typeof t === 'string') &&
    typeof f.order === 'number' &&
    Number.isFinite(f.order) &&
    typeof f.createdAt === 'number' &&
    Number.isFinite(f.createdAt) &&
    typeof f.updatedAt === 'number' &&
    Number.isFinite(f.updatedAt);
  const isValidPrdBlock = (b: any) =>
    b &&
    typeof b.id === 'string' &&
    typeof b.type === 'string' &&
    typeof b.label === 'string' &&
    typeof b.value === 'string' &&
    typeof b.order === 'number' &&
    Number.isFinite(b.order);
  const isValidDoc = (doc: any) =>
    doc &&
    typeof doc.version === 'number' &&
    typeof doc.title === 'string' &&
    Array.isArray(doc.phases) &&
    doc.phases.every(isValidPhase) &&
    Array.isArray(doc.features) &&
    doc.features.every(isValidFeature);
  const isValidPrd = (prdDoc: any) =>
    prdDoc && Array.isArray(prdDoc.blocks) && prdDoc.blocks.every(isValidPrdBlock);
  const importProjectInto = (projectId: string, file: File) => {
    if (editingDisabled) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result || '');
        const parsed = JSON.parse(raw) as { version?: number; project?: ProjectData };
        if (!parsed || parsed.version !== 1 || !parsed.project) {
          window.alert('Invalid project file.');
          return;
        }
        const incoming = parsed.project as any;
        if (!isValidDoc(incoming.doc) || !isValidPrd(incoming.prd)) {
          window.alert('Invalid project file.');
          return;
        }
        const prdTitle = getPrdTitle(incoming.prd as PrdDoc);
        const nextDoc = prdTitle ? { ...incoming.doc, title: prdTitle } : incoming.doc;
        const nextColor =
          typeof incoming.colorId === 'string' &&
          PROJECT_COLORS.some((c) => c.id === incoming.colorId)
            ? incoming.colorId
            : undefined;
        if (!window.confirm('Overwrite this project with the imported data?')) return;

        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  doc: nextDoc,
                  prd: incoming.prd as PrdDoc,
                  colorId: nextColor ?? p.colorId,
                  lastEdited: now(),
                }
              : p
          )
        );
        setPrdMode('view');
        setPrdInlineEditId(null);
        cancelInlineTitleEdit();
        cancelInlinePhaseEdit();
        closeEditor();
        closeDetails();
        closeCtxMenu();
        closeStatusPopover();
        closeStatusFilterMenu();
        closeTagPopover();
        setSelectedId(null);
        setPhaseFilter('all');
        setStatusFilter(new Set(ALL_STATUSES));
        setTagQuery('');
      } catch {
        window.alert('Invalid project file.');
      }
    };
    reader.readAsText(file);
  };
  const triggerProjectImport = (projectId: string) => {
    if (editingDisabled) return;
    setProjectImportTargetId(projectId);
    if (projectImportRef.current) {
      projectImportRef.current.value = '';
      projectImportRef.current.click();
    }
  };
  const clonePrd = (value: PrdDoc) =>
    JSON.parse(JSON.stringify(value)) as PrdDoc;
  const updatePrdWithHistory = (updater: (prev: PrdDoc) => PrdDoc) => {
    if (editingDisabled) return;
    if (!activeProjectId) return;
    setPrd((prev) => {
      setPrdHistoryByProject((history) => {
        const existing = history[activeProjectId] ?? { past: [], future: [] };
        const past = [...existing.past, clonePrd(prev)];
        if (past.length > 3) past.splice(0, past.length - 3);
        return { ...history, [activeProjectId]: { past, future: [] } };
      });
      return updater(prev);
    });
  };
  const activePrdHistory = activeProjectId
    ? prdHistoryByProject[activeProjectId] ?? { past: [], future: [] }
    : { past: [], future: [] };
  const undoPrd = () => {
    if (!activeProjectId) return;
    if (!activePrdHistory.past.length) return;
    const prevState = activePrdHistory.past[activePrdHistory.past.length - 1];
    const past = activePrdHistory.past.slice(0, -1);
    const future = [clonePrd(prd), ...activePrdHistory.future].slice(0, 3);
    setPrdHistoryByProject((history) => ({
      ...history,
      [activeProjectId]: { past, future },
    }));
    setPrd(prevState);
  };
  const redoPrd = () => {
    if (!activeProjectId) return;
    if (!activePrdHistory.future.length) return;
    const nextState = activePrdHistory.future[0];
    const future = activePrdHistory.future.slice(1);
    const past = [...activePrdHistory.past, clonePrd(prd)].slice(-3);
    setPrdHistoryByProject((history) => ({
      ...history,
      [activeProjectId]: { past, future },
    }));
    setPrd(nextState);
  };
  const DELETE_HOLD_MS = 1600;
  const resetDeleteHold = () => {
    if (deleteHoldRafRef.current != null) cancelAnimationFrame(deleteHoldRafRef.current);
    if (deleteHoldTimeoutRef.current != null) window.clearTimeout(deleteHoldTimeoutRef.current);
    deleteHoldRafRef.current = null;
    deleteHoldTimeoutRef.current = null;
    deleteHoldStartRef.current = null;
    setDeleteHoldProgress(0);
  };
  const startDeleteHold = (projectId: string) => {
    if (editingDisabled) return;
    if (projects.length <= 1) return;
    resetDeleteHold();
    deleteHoldStartRef.current = performance.now();

    const tick = (now: number) => {
      if (deleteHoldStartRef.current == null) return;
      const progress = Math.min((now - deleteHoldStartRef.current) / DELETE_HOLD_MS, 1);
      setDeleteHoldProgress(progress);
      if (progress < 1) deleteHoldRafRef.current = requestAnimationFrame(tick);
    };
    deleteHoldRafRef.current = requestAnimationFrame(tick);
    deleteHoldTimeoutRef.current = window.setTimeout(() => {
      setProjects((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((p) => p.id !== projectId);
        if (!next.length) return prev;
        const nextActive =
          activeProjectId === projectId ? next[0].id : activeProjectId;
        setActiveProjectId(nextActive);
        return next;
      });
      closeEditor();
      closeDetails();
      closeCtxMenu();
      closeStatusPopover();
      closeStatusFilterMenu();
      closeTagPopover();
      setSelectedId(null);
      setPhaseFilter('all');
      setStatusFilter(new Set(ALL_STATUSES));
      setTagQuery('');
      setProjectColorPicker({ open: false, projectId: null });
      resetDeleteHold();
    }, DELETE_HOLD_MS);
  };
  const cancelDeleteHold = () => {
    resetDeleteHold();
  };
  const MENU_MARGIN = 8;
  const ctxMenuWidth = ctxMenuSize.width || 180;
  const ctxMenuHeight = ctxMenuSize.height || 160;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const ctxMenuLeft =
    viewportWidth > 0
      ? Math.max(MENU_MARGIN, Math.min(ctxMenu.x, viewportWidth - ctxMenuWidth - MENU_MARGIN))
      : ctxMenu.x;
  const ctxMenuTop =
    viewportHeight > 0
      ? ctxMenu.y + ctxMenuHeight + MENU_MARGIN > viewportHeight
        ? Math.max(MENU_MARGIN, ctxMenu.y - ctxMenuHeight)
        : ctxMenu.y
      : ctxMenu.y;

  return (
    <div style={{ ...shellStyle, ['--prdLink' as any]: isLight ? 'rgba(30,120,255,0.92)' : 'rgba(120,200,255,0.95)' }}>
      <aside style={sidebarStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.2 }}>Workbench</div>
            {isDemoMode ? (
              <div
                style={{
                  marginLeft: 'auto',
                  padding: '2px 6px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,186,90,0.55)',
                  background: 'rgba(255,186,90,0.18)',
                  color: 'rgba(255,210,140,0.95)',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                }}
              >
                Demo mode
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            v{APP_VERSION} • Local-first • {doc.features.length} feature{doc.features.length === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Projects
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const projectName = getPrdTitle(project.prd) || project.doc.title || 'Untitled project';
            const stats = `${project.doc.phases.length} phases • ${project.doc.features.length} features`;
            const color = PROJECT_COLORS.find((c) => c.id === project.colorId);
            const baseBg = isActive ? themeVars.panelBg2 : themeVars.panelBg;
            const borderColor = color ? color.border : isActive ? themeVars.border : themeVars.borderSoft;
            const background = color ? `linear-gradient(180deg, ${color.bg}, ${baseBg})` : baseBg;

            return (
              <div
                key={project.id}
                role="button"
                tabIndex={0}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (editingDisabled) return;
                  setProjectColorPicker({ open: true, projectId: project.id });
                }}
                onClick={() => {
                  if (project.id === activeProjectId) return;
                  closeEditor();
                  closeDetails();
                  closeCtxMenu();
                  closeStatusPopover();
                  closeStatusFilterMenu();
                  closeTagPopover();
                  setSelectedId(null);
                  setPhaseFilter('all');
                  setStatusFilter(new Set(ALL_STATUSES));
                  setTagQuery('');
                  setActiveProjectId(project.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (project.id === activeProjectId) return;
                    closeEditor();
                    closeDetails();
                    closeCtxMenu();
                    closeStatusPopover();
                    closeStatusFilterMenu();
                    closeTagPopover();
                    setSelectedId(null);
                    setPhaseFilter('all');
                    setStatusFilter(new Set(ALL_STATUSES));
                    setTagQuery('');
                    setActiveProjectId(project.id);
                  }
                }}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${borderColor}`,
                  background,
                  padding: isActive ? 10 : 8,
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.82,
                  transition: 'opacity 140ms ease, transform 140ms ease',
                  transform: isActive ? 'scale(1)' : 'scale(0.985)',
                  display: 'grid',
                  gap: 6,
                }}
                title={projectName}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 900,
                    fontSize: isActive ? 12 : 11,
                    letterSpacing: 0.1,
                    color: themeVars.appText,
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {color ? (
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: color.swatch,
                        boxShadow: `0 0 0 2px ${color.bg}`,
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  {projectName}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{stats}</div>
                {isActive ? (
                  <div style={{ fontSize: 11, opacity: 0.55 }}>
                    Updated {formatLastEdited(project.lastEdited)}
                  </div>
                ) : null}
              </div>
            );
          })}
          {projects.length < 2 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  if (editingDisabled) return;
                  setNewProjectName('');
                  setIsProjectModalOpen(true);
                }}
                disabled={editingDisabled}
                style={{
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: `1px dashed ${themeVars.border}`,
                  background: themeVars.panelBg2,
                  color: themeVars.appText,
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  fontWeight: 900,
                  fontSize: 12,
                  opacity: editingDisabled ? 0.5 : 1,
                }}
                title={editingDisabled ? 'Demo mode: project creation disabled' : 'Create project'}
              >
                + New project
              </button>
              <button
                type="button"
                onClick={() => triggerProjectImport(activeProjectId)}
                disabled={editingDisabled}
                style={{
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: `1px solid ${themeVars.borderSoft}`,
                  background: themeVars.panelBg,
                  color: 'inherit',
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: 12,
                  opacity: editingDisabled ? 0.6 : 1,
                }}
                title={editingDisabled ? 'Demo mode: import disabled' : 'Import project'}
              >
                Import
              </button>
            </div>
          ) : null}
          <input
            ref={projectImportRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const targetId = projectImportTargetId ?? activeProjectId;
              if (!targetId) return;
              importProjectInto(targetId, file);
              setProjectImportTargetId(null);
            }}
          />
        </div>

        <div style={{ height: 1, background: themeVars.divider, margin: '4px 0' }} />

        <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Sections
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(['prd', 'roadmap', 'phases'] as DocSection[]).map((key) => (
            <button
              key={key}
              type="button"
              style={navBtn(activeSection === key)}
              onClick={() => {
                if (activeDragId === NEW_FEATURE_DRAG_ID) return;
                scrollToSection(key);
              }}
            >
              {SECTION_LABELS[key]}
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: themeVars.divider, margin: '4px 0' }} />

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: `1px solid ${themeVars.border}`,
            background: themeVars.panelBg2,
            color: 'inherit',
            cursor: 'pointer',
            fontWeight: 900,
            fontSize: 12,
            textAlign: 'left',
          }}
          title="Search & jump (⌘K / Ctrl+K)"
        >
          Search / Jump <span style={{ opacity: 0.6, fontWeight: 800 }}>(⌘K)</span>
        </button>

        <div style={{ height: 1, background: themeVars.divider, margin: '6px 0' }} />

        <div style={{ flex: 1 }} />

        <div ref={settingsRef} style={{ position: 'relative', alignSelf: 'flex-start' }}>
          <button
            type="button"
            onClick={() => setSettingsOpen((prev) => !prev)}
            style={{
              padding: '8px 10px',
              borderRadius: 12,
              border: `1px solid ${themeVars.border}`,
              background: themeVars.panelBg2,
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            title="Settings"
          >
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
              ⚙
            </span>
            Settings
          </button>
          {settingsOpen ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: '110%',
                minWidth: 200,
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${themeVars.border}`,
                background: themeVars.panelBgStrong,
                boxShadow: themeVars.shadow2,
                display: 'grid',
                gap: 10,
                zIndex: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 800 }}>Demo</div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isDemoMode) {
                      setDemoDoc(seedDoc());
                      setDemoPrd(seedPrd());
                      setIsDemoMode(true);
                      setPrdMode('view');
                      setPrdInlineEditId(null);
                      cancelInlineTitleEdit();
                      cancelInlinePhaseEdit();
                      closeEditor();
                      closeDetails();
                      closeCtxMenu();
                      closeStatusPopover();
                      closeStatusFilterMenu();
                      closeTagPopover();
                      setSelectedId(null);
                      setPhaseFilter('all');
                      setStatusFilter(new Set(ALL_STATUSES));
                      setTagQuery('');
                      setSettingsOpen(false);
                      return;
                    }
                    setIsDemoMode(false);
                    closeEditor();
                    closeDetails();
                    closeCtxMenu();
                    closeStatusPopover();
                    closeStatusFilterMenu();
                    closeTagPopover();
                    setSelectedId(null);
                    setPhaseFilter('all');
                    setStatusFilter(new Set(ALL_STATUSES));
                    setTagQuery('');
                    setSettingsOpen(false);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: `1px solid ${themeVars.border}`,
                    background: isDemoMode ? 'rgba(120,200,255,0.12)' : themeVars.panelBg2,
                    color: 'inherit',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 11,
                  }}
                  title="Toggle demo mode"
                >
                  {isDemoMode ? 'On' : 'Off'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 800 }}>Theme</div>
                <button
                  type="button"
                  onClick={() => {
                    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
                    setSettingsOpen(false);
                  }}
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
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                />
                Reduced motion
              </label>
            </div>
          ) : null}
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
                {prdMode === 'editTemplate'
                  ? 'Template edit mode • autosaved locally'
                  : 'Outline goals, scope, and success metrics.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={undoPrd}
                disabled={editingDisabled || activePrdHistory.past.length === 0}
                style={{
                  ...prdActionBtn,
                  cursor:
                    editingDisabled || activePrdHistory.past.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: editingDisabled || activePrdHistory.past.length === 0 ? 0.5 : 1,
                }}
                title="Undo"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={redoPrd}
                disabled={editingDisabled || activePrdHistory.future.length === 0}
                style={{
                  ...prdActionBtn,
                  cursor:
                    editingDisabled || activePrdHistory.future.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: editingDisabled || activePrdHistory.future.length === 0 ? 0.5 : 1,
                }}
                title="Redo"
              >
                Redo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editingDisabled) return;
                  setPrdMode((m) => {
                    const next = m === 'editTemplate' ? 'view' : 'editTemplate';
                    if (next === 'editTemplate') setPrdInlineEditId(null);
                    return next;
                  });
                }}
                disabled={editingDisabled}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: `1px solid ${themeVars.border}`,
                  background:
                    prdMode === 'editTemplate' ? 'rgba(120,200,255,0.12)' : themeVars.panelBg2,
                  color: 'inherit',
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  opacity: editingDisabled ? 0.5 : 1,
                  fontWeight: 800,
                }}
                title={prdMode === 'editTemplate' ? 'Switch to view mode' : 'Switch to template edit mode'}
              >
                {prdMode === 'editTemplate' ? 'Done' : 'Edit'}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (editingDisabled) return;
                  updatePrdWithHistory(() => seedPrd());
                }}
                disabled={editingDisabled}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
                  color: 'inherit',
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  opacity: editingDisabled ? 0.5 : 1,
                  fontWeight: 750,
                }}
                title="Reset PRD template"
              >
                Reset template
              </button>
            </div>
          </div>

          {prdNonTitleBlocks.length === 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 16,
                border: `1px solid ${themeVars.border}`,
                background: themeVars.panelBg2,
                boxShadow: themeVars.shadow1,
              }}
            >
              <div style={{ fontWeight: 950, opacity: 0.92 }}>No PRD sections yet.</div>
              <div style={{ marginTop: 6, color: themeVars.muted, fontWeight: 800 }}>
                Start with a title, then outline constraints and the MVP.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => addPrdBlock('Constraints')}
                  disabled={editingDisabled}
                  style={{
                    ...buttonStyle,
                    opacity: editingDisabled ? 0.5 : 1,
                    cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  Add “Constraints”
                </button>
                <button
                  type="button"
                  onClick={() => addPrdBlock('MVP')}
                  disabled={editingDisabled}
                  style={{
                    ...buttonStyle,
                    opacity: editingDisabled ? 0.5 : 1,
                    cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  Add “MVP”
                </button>
                <button
                  type="button"
                  onClick={() => addPrdBlock('Out of scope')}
                  disabled={editingDisabled}
                  style={{
                    ...buttonStyle,
                    opacity: editingDisabled ? 0.5 : 1,
                    cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  Add “Out of scope”
                </button>
              </div>
            </div>
          )}

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
                        readOnly={editingDisabled}
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
                          ...(editingDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : null),
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
                          disabled={editingDisabled}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: themeVars.panelBg2,
                            color: 'inherit',
                            cursor: editingDisabled ? 'not-allowed' : 'pointer',
                            opacity: editingDisabled ? 0.5 : 1,
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
                          disabled={editingDisabled}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: themeVars.panelBg2,
                            color: 'inherit',
                            cursor: editingDisabled ? 'not-allowed' : 'pointer',
                            opacity: editingDisabled ? 0.5 : 1,
                            fontWeight: 900,
                          }}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => addPrdBlockAfter(b.id)}
                          disabled={editingDisabled}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: isLight
                              ? 'rgba(30,120,255,0.18)'
                              : 'rgba(120,200,255,0.10)',
                            color: isLight ? 'rgba(10,70,160,0.95)' : 'inherit',
                            cursor: editingDisabled ? 'not-allowed' : 'pointer',
                            opacity: editingDisabled ? 0.5 : 1,
                            fontWeight: 900,
                          }}
                          title="Add block after"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePrdBlock(b.id)}
                          disabled={editingDisabled}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: isLight ? 'rgba(255,99,99,0.18)' : 'rgba(255,155,155,0.08)',
                            color: isLight ? 'rgba(140,30,30,0.95)' : 'rgba(255,210,210,0.95)',
                            cursor: editingDisabled ? 'not-allowed' : 'pointer',
                            opacity: editingDisabled ? 0.5 : 1,
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
                        readOnly={editingDisabled}
                        themeVars={themeVars}
                        onFocusBlock={(blockId, el) => {
                          prdActiveRef.current = el;
                          setPrdFocusId(blockId);
                        }}
                        onBlurBlock={(blockId, nextHtml) => {
                          commitPrdBlock(blockId, nextHtml);
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
                    onMouseEnter={() => setPrdHoverId(b.id)}
                    onMouseLeave={() => setPrdHoverId((cur) => (cur === b.id ? null : cur))}
                  >
                    <>
                      {b.type === 'title' ? (
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}
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
                            onClick={() => {
                              if (editingDisabled) return;
                              setPrdInlineEditId(b.id);
                            }}
                            disabled={editingDisabled}
                            style={{
                              ...prdPencilBtnStyle,
                              opacity: prdHoverId === b.id ? (editingDisabled ? 0.4 : 1) : 0,
                              pointerEvents: prdHoverId === b.id && !editingDisabled ? 'auto' : 'none',
                              cursor: editingDisabled ? 'not-allowed' : 'pointer',
                              border: `1px solid ${themeVars.border}`,
                              background: themeVars.panelBg3,
                              color: themeVars.appText,
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
                        >
                          <div style={{ ...prdH2Style, marginBottom: 0 }}>{b.label}</div>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingDisabled) return;
                              setPrdInlineEditId(b.id);
                            }}
                            disabled={editingDisabled}
                            style={{
                              ...prdPencilBtnStyle,
                              opacity: prdHoverId === b.id ? (editingDisabled ? 0.4 : 1) : 0,
                              pointerEvents: prdHoverId === b.id && !editingDisabled ? 'auto' : 'none',
                              cursor: editingDisabled ? 'not-allowed' : 'pointer',
                              border: `1px solid ${themeVars.border}`,
                              background: themeVars.panelBg3,
                              color: themeVars.appText,
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
                      readOnly={editingDisabled}
                      themeVars={themeVars}
                      onFocusBlock={(blockId, el) => {
                        prdActiveRef.current = el;
                        setPrdFocusId(blockId);
                      }}
                      onBlurBlock={(blockId, nextHtml) => {
                        commitPrdBlock(blockId, nextHtml);
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
          style={roadmapSectionStyle}
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                autoScroll={activeDragId !== NEW_FEATURE_DRAG_ID}
                onDragStart={(event: DragStartEvent) => {
                  closeTagPopover();
                  const activeId = String(event.active.id);
                  setActiveDragId(activeId);
                  if (activeId === NEW_FEATURE_DRAG_ID) {
                    setDisableDropAnimation(true);
                    suppressNewFeatureClickRef.current = true;
                    clearNewFeaturePlacementQueue();
                    queueNewFeaturePlacement(null);
                    lastOverIdRef.current = null;
                  }
                }}
                onDragOver={(event: DragOverEvent) => {
                  const activeId = String(event.active.id);
                  if (activeId !== NEW_FEATURE_DRAG_ID) return;
                  const over = event.over;
                  if (!over) {
                    lastOverIdRef.current = null;
                    queueNewFeaturePlacement(null);
                    return;
                  }
                  const rawOverId = String(over.id);
                  lastOverIdRef.current = rawOverId;
                  const pointer = lastPointerRef.current;
                  if (!pointer) return;
                  queueNewFeaturePlacement(computeNewFeaturePlacementFromOverId(rawOverId));
                }}
                onDragMove={(event: DragMoveEvent) => {
                  const activeId = String(event.active.id);
                  if (activeId !== NEW_FEATURE_DRAG_ID) return;

                  const pointer = lastPointerRef.current;
                  if (!pointer) return;
                  const overId = event.over?.id ? String(event.over.id) : lastOverIdRef.current;
                  queueNewFeaturePlacement(computeNewFeaturePlacementFromOverId(overId ?? null));
                }}
                onDragCancel={(event: DragCancelEvent) => {
                  setActiveDragId(null);
                  clearNewFeaturePlacementQueue();
                  queueNewFeaturePlacement(null);
                  if (String(event.active.id) === NEW_FEATURE_DRAG_ID) {
                    setTimeout(() => setDisableDropAnimation(false), 0);
                  }
                  setTimeout(() => {
                    suppressNewFeatureClickRef.current = false;
                  }, 0);
                }}
                onDragEnd={(event: DragEndEvent) => {
                  const { active, over } = event;
                  const activeId = String(active.id);
                  setActiveDragId(null);
                  const placement = placementNextRef.current ?? newFeaturePlacement;
                  clearNewFeaturePlacementQueue();
                  queueNewFeaturePlacement(null);
                  if (activeId === NEW_FEATURE_DRAG_ID) {
                    setTimeout(() => setDisableDropAnimation(false), 0);
                  }
                  setTimeout(() => {
                    suppressNewFeatureClickRef.current = false;
                  }, 0);

                  if (activeId === NEW_FEATURE_DRAG_ID) {
                    if (!over || !placement) return;
                    const { phaseId, index } = placement;
                    const newId = uid('feat');
                    setDoc((prev) => {
                      const newFeature: Feature = {
                        id: newId,
                        title: 'New feature',
                        description: '',
                        status: 'not_started',
                        phaseId,
                        tags: [],
                        order: nextOrder(prev),
                        createdAt: now(),
                        updatedAt: now(),
                      };

                      const nextAll = [...prev.features, newFeature].sort((a, b) => a.order - b.order);
                      const visibleByPhase = new Map<string, string[]>();
                      for (const p of prev.phases) visibleByPhase.set(p.id, []);

                      for (const f of nextAll) {
                        if (f.id === newId) continue;
                        const hideDone = !!hideDoneByPhase[f.phaseId];
                        if (hideDone && f.status === 'done') continue;
                        if (!isFeatureVisible(f)) continue;
                        const arr = visibleByPhase.get(f.phaseId) ?? [];
                        arr.push(f.id);
                        visibleByPhase.set(f.phaseId, arr);
                      }

                      const target = [...(visibleByPhase.get(phaseId) ?? [])];
                      const safeIndex = Math.max(0, Math.min(index, target.length));
                      target.splice(safeIndex, 0, newId);
                      visibleByPhase.set(phaseId, target);

                      const byId = new Map(nextAll.map((f) => [f.id, f]));
                      const nextFeatures: Feature[] = [];
                      const phasesOrdered = [...prev.phases].sort((a, b) => a.order - b.order);
                      for (const ph of phasesOrdered) {
                        const visIds = visibleByPhase.get(ph.id) ?? [];
                        const visSet = new Set(visIds);
                        const vis = visIds.map((id) => byId.get(id)).filter(Boolean) as Feature[];
                        const nonVis = nextAll
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
                    scrollToFeatureCard(newId);
                    setFlashId(newId);
                    setTimeout(() => setFlashId((v) => (v === newId ? null : v)), 900);
                    return;
                  }

                  if (!over) return;
                  const overId = String(over.id);
                  if (activeId === overId) return;

                  setDoc((prev) => {
                    const activeFeat = prev.features.find((f) => f.id === activeId);
                    if (!activeFeat) return prev;

                    let destPhaseIdMaybe: string | null = null;
                    if (isLaneId(overId)) {
                      const pid = phaseIdFromLaneId(overId);
                      destPhaseIdMaybe = pid ?? null;
                    } else {
                      const overFeat = prev.features.find((f) => f.id === overId);
                      destPhaseIdMaybe = overFeat?.phaseId ?? null;
                    }
                    const sourcePhaseIdMaybe = activeFeat.phaseId ?? null;
                    if (!sourcePhaseIdMaybe || !destPhaseIdMaybe) return prev;

                    const sourcePhaseId = sourcePhaseIdMaybe;
                    const destPhaseId = destPhaseIdMaybe;
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
                <div style={{ flex: '0 0 auto', padding: '14px 14px 0' }}>
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
                      .filter((p) => !archivedSet.has(p.id))
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

                  <NewFeatureButton />
                </div>

                {doc.features.length === 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 14,
                      borderRadius: 16,
                      border: `1px solid ${themeVars.border}`,
                      background: themeVars.panelBg2,
                      boxShadow: themeVars.shadow1,
                    }}
                  >
                    <div style={{ fontWeight: 950, opacity: 0.92 }}>No features yet.</div>
                    <div style={{ marginTop: 6, color: themeVars.muted, fontWeight: 800 }}>
                      Add a starter set so the board isn’t an empty universe.
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {[
                        { label: 'Starter MVP', kind: 'mvp' },
                        { label: 'Bug-fix Sprint', kind: 'bugs' },
                        { label: 'Personal Project', kind: 'personal' },
                      ].map((t) => (
                        <button
                          key={t.kind}
                          type="button"
                          onClick={() => addTemplate(t.kind as 'mvp' | 'bugs' | 'personal')}
                          disabled={editingDisabled}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 12,
                            border: `1px solid ${themeVars.border}`,
                            background: themeVars.panelBg3,
                            color: 'inherit',
                            cursor: editingDisabled ? 'not-allowed' : 'pointer',
                            fontWeight: 900,
                            fontSize: 12,
                            opacity: editingDisabled ? 0.5 : 1,
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                    background: isLight ? '#ffffff' : 'transparent',
                    border: 'none',
                    borderRadius: 0,
                    padding: 0,
                    paddingBottom: BOARD_PAD_BOTTOM,
                    boxSizing: 'border-box',
                  }}
                  ref={boardRef}
                >
                    <div
                      style={{
                        height: '100%',
                        width: 'max-content',
                        display: 'flex',
                        gap: 16,
                        paddingLeft: 14,
                        paddingRight: 14,
                        overflow: 'hidden',
                      }}
                    >
                      {[...doc.phases]
                        .sort((a, b) => a.order - b.order)
                        .filter((p) => !archivedSet.has(p.id))
                        .filter((p) => phaseFilter === 'all' || p.id === phaseFilter)
                        .map((p) => {
                          const inLane = filteredFeatures.filter((f) => f.phaseId === p.id);
                          return <PhaseLane key={p.id} phase={p} features={inLane} />;
                        })}
                      <button
                        type="button"
                        onClick={createPhaseAtEnd}
                        disabled={editingDisabled}
                        style={{
                          width: 72,
                          minWidth: 72,
                          borderRadius: 16,
                          border: `1px dashed ${themeVars.borderSoft}`,
                          background: themeVars.panelBg,
                          color: themeVars.appText,
                          boxShadow: themeVars.shadow1,
                          cursor: editingDisabled ? 'not-allowed' : 'pointer',
                          opacity: editingDisabled ? 0.5 : 1,
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
                    <DragOverlay dropAnimation={disableDropAnimation ? null : undefined}>
                      {activeDragId
                        ? activeDragId === NEW_FEATURE_DRAG_ID
                          ? (
                              <div
                                style={{
                                  ...buttonStyle,
                                  boxShadow: themeVars.shadowPop,
                                  transform: 'translate3d(0,0,0)',
                                  pointerEvents: 'none',
                                }}
                              >
                                + New
                              </div>
                            )
                          : (() => {
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
                </div>

                {detailsOpen && detailsFeature ? <FeatureDetailsPanel feature={detailsFeature} /> : null}
              </div>
            </DndContext>
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
              onArchivePhase={(phaseId) => {
                setArchivedPhaseIds((prev) => (prev.includes(phaseId) ? prev : [...prev, phaseId]));
              }}
              archivedSet={archivedSet}
              themeVars={themeVars}
              statusMeta={STATUS_META}
              isLight={isLight}
            />
            {archivedPhases.length ? (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: `1px solid ${themeVars.divider}`,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.2, color: themeVars.muted }}>
                  Archived phases
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {archivedPhases.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 12,
                        border: `1px solid ${themeVars.border}`,
                        background: themeVars.panelBg2,
                      }}
                    >
                      <div style={{ fontWeight: 850, fontSize: 13, color: themeVars.appText, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.name || 'Untitled phase'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setArchivedPhaseIds((prev) => prev.filter((id) => id !== p.id));
                        }}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 999,
                          border: `1px solid ${themeVars.border}`,
                          background: themeVars.panelBg2,
                          color: 'inherit',
                          cursor: 'pointer',
                          fontWeight: 900,
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                        title="Unarchive phase"
                      >
                        Unarchive
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </main>
      {paletteOpen && (
        <div
          onMouseDown={() => setPaletteOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: themeVars.overlay,
            display: 'grid',
            placeItems: 'start center',
            paddingTop: 90,
            zIndex: 9999,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: 'min(820px, calc(100vw - 56px))',
              borderRadius: 18,
              border: `1px solid ${themeVars.border}`,
              background: themeVars.panelBgStrong,
              boxShadow: themeVars.shadowPop,
              padding: 14,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 12, borderBottom: `1px solid ${themeVars.divider}` }}>
              <input
                autoFocus
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value);
                  setPaletteIndex(0);
                }}
                placeholder="Search… (phases, features, actions)"
                style={{
                  width: '100%',
                  padding: '12px 12px',
                  borderRadius: 12,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.inputBg2,
                  color: 'inherit',
                  outline: 'none',
                  fontWeight: 850,
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ marginTop: 10, maxHeight: 420, overflowY: 'auto', padding: '6px 0' }}>
              {paletteShown.length === 0 ? (
                <div style={{ padding: 14, color: themeVars.muted, fontWeight: 800 }}>No matches.</div>
              ) : (
                paletteShown.map((it, i) => (
                  <React.Fragment key={`${it.kind}:${it.label}:${i}`}>
                    {i > 0 ? (
                      <div style={{ margin: '0 14px', height: 1, background: themeVars.divider }} />
                    ) : null}
                    <div
                      onMouseEnter={() => setPaletteIndex(i)}
                      onMouseDown={() => runPaletteItem(it)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        background: i === paletteIndexClamped ? themeVars.panelBg3 : 'transparent',
                        borderRadius: 12,
                        fontWeight: 850,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ opacity: 0.92 }}>{it.label}</div>
                      <div style={{ fontSize: 11, color: themeVars.muted }}>
                        {it.kind === 'action'
                          ? 'Action'
                          : it.kind === 'section'
                            ? 'Section'
                            : it.kind === 'phase'
                              ? 'Phase'
                              : 'Feature'}
                      </div>
                    </div>
                  </React.Fragment>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {isProjectModalOpen ? (
        <div
          onMouseDown={() => setIsProjectModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: themeVars.overlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10030,
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
              minWidth: 340,
              maxWidth: 'min(520px, 100%)',
              boxShadow: themeVars.shadow3,
              border: `1px solid ${themeVars.border}`,
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800 }}>Create project</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Project name</label>
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New project"
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.inputBg2,
                  color: 'inherit',
                  outline: 'none',
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setIsProjectModalOpen(false)}
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
                onClick={() => {
                  const trimmed = newProjectName.trim();
                  if (!trimmed) return;
                  const seededDoc = seedDoc();
                  const seededPrd = seedPrd();
                  const nextDoc = { ...seededDoc, title: trimmed };
                  const nextPrd = setPrdTitle(seededPrd, trimmed);
                  const nextProject: ProjectData = {
                    id: uid('project'),
                    doc: nextDoc,
                    prd: nextPrd,
                    lastEdited: now(),
                    colorId: undefined,
                  };
                  setProjects((prev) => [...prev, nextProject]);
                  setActiveProjectId(nextProject.id);
                  closeEditor();
                  closeDetails();
                  closeCtxMenu();
                  closeStatusPopover();
                  closeStatusFilterMenu();
                  closeTagPopover();
                  setSelectedId(null);
                  setPhaseFilter('all');
                  setStatusFilter(new Set(ALL_STATUSES));
                  setTagQuery('');
                  setIsProjectModalOpen(false);
                  setNewProjectName('');
                }}
                disabled={!newProjectName.trim()}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${themeVars.border}`,
                  background: newProjectName.trim()
                    ? 'linear-gradient(120deg, rgba(120,200,255,0.6), rgba(120,160,255,0.7))'
                    : themeVars.panelBg2,
                  color: newProjectName.trim() ? '#ffffff' : themeVars.muted,
                  cursor: newProjectName.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  opacity: newProjectName.trim() ? 1 : 0.7,
                }}
              >
                Create project
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {projectColorPicker.open && projectColorPicker.projectId ? (
        <div
          onMouseDown={() => setProjectColorPicker({ open: false, projectId: null })}
          style={{
            position: 'fixed',
            inset: 0,
            background: themeVars.overlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10030,
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: themeVars.panelBgStrong,
              color: themeVars.appText,
              borderRadius: 14,
              padding: 18,
              minWidth: 320,
              maxWidth: 'min(520px, 100%)',
              boxShadow: themeVars.shadow3,
              border: `1px solid ${themeVars.border}`,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>Project color</div>
              <button
                type="button"
                onClick={() => {
                  resetDeleteHold();
                  setProjectColorPicker({ open: false, projectId: null });
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                Done
              </button>
            </div>
            <div style={{ fontSize: 12, color: themeVars.muted }}>
              Pick a color to personalize this project.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {PROJECT_COLORS.map((c) => {
                const isSelected =
                  projects.find((p) => p.id === projectColorPicker.projectId)?.colorId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      if (editingDisabled) return;
                      setProjects((prev) =>
                        prev.map((p) =>
                          p.id === projectColorPicker.projectId
                            ? { ...p, colorId: c.id, lastEdited: now() }
                            : p
                        )
                      );
                    }}
                    disabled={editingDisabled}
                    style={{
                      padding: '10px 8px',
                      borderRadius: 12,
                      border: `1px solid ${isSelected ? c.border : themeVars.borderSoft}`,
                      background: isSelected ? c.bg : themeVars.panelBg2,
                      color: themeVars.appText,
                      cursor: editingDisabled ? 'not-allowed' : 'pointer',
                      display: 'grid',
                      gap: 6,
                      placeItems: 'center',
                      fontWeight: 800,
                      fontSize: 11,
                      opacity: editingDisabled ? 0.6 : 1,
                      transition: 'transform 120ms ease, border-color 120ms ease, background 120ms ease',
                      transform: isSelected ? 'translateY(-1px)' : 'translateY(0)',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        background: c.swatch,
                        boxShadow: isSelected
                          ? `0 0 0 3px ${c.bg}, 0 0 0 1px ${c.border}`
                          : `0 0 0 1px ${themeVars.borderSoft}`,
                      }}
                    />
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div style={{ height: 1, background: themeVars.divider, marginTop: 2 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => exportProject(projects.find((p) => p.id === projectColorPicker.projectId)!)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
                  color: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                Export project
              </button>
              <button
                type="button"
                onClick={() => triggerProjectImport(projectColorPicker.projectId!)}
                disabled={editingDisabled}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${themeVars.border}`,
                  background: themeVars.panelBg2,
                  color: 'inherit',
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: 12,
                  opacity: editingDisabled ? 0.6 : 1,
                }}
                title={editingDisabled ? 'Demo mode: import disabled' : 'Import project'}
              >
                Import (overwrite)
              </button>
            </div>
            <div style={{ fontSize: 11, color: themeVars.muted }}>
              Import replaces this project with the file contents.
            </div>
            <div style={{ height: 1, background: themeVars.divider, marginTop: 2 }} />
            <div style={{ fontSize: 12, fontWeight: 800, color: themeVars.muted }}>Danger zone</div>
            <button
              type="button"
              onPointerDown={() => startDeleteHold(projectColorPicker.projectId!)}
              onPointerUp={cancelDeleteHold}
              onPointerLeave={cancelDeleteHold}
              onPointerCancel={cancelDeleteHold}
              disabled={editingDisabled || projects.length <= 1}
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid rgba(255,99,99,0.5)`,
                background: 'rgba(255,99,99,0.12)',
                color: 'rgba(255,210,210,0.95)',
                cursor: editingDisabled || projects.length <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                fontSize: 12,
                opacity: editingDisabled || projects.length <= 1 ? 0.5 : 1,
              }}
              title={
                projects.length <= 1
                  ? 'Keep at least one project'
                  : 'Hold to delete this project'
              }
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${Math.round(deleteHoldProgress * 100)}%`,
                  background: 'rgba(255,99,99,0.28)',
                  transition: deleteHoldProgress === 0 ? 'none' : 'width 80ms linear',
                }}
              />
              <span style={{ position: 'relative' }}>
                {projects.length <= 1 ? 'Cannot delete last project' : 'Hold to delete project'}
              </span>
            </button>
          </div>
        </div>
      ) : null}
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
                disabled={editingDisabled}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  color: 'inherit',
                  border: 'none',
                  borderRadius: 8,
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  opacity: editingDisabled ? 0.5 : 1,
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
            ref={ctxMenuRef}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: ctxMenuTop,
              left: ctxMenuLeft,
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
                  if (editingDisabled) return;
                  createFeatureAtEnd();
                  closeCtxMenu();
                }}
                disabled={editingDisabled}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  color: 'inherit',
                  border: 'none',
                  borderRadius: 8,
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  opacity: editingDisabled ? 0.5 : 1,
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
                    if (editingDisabled) return;
                    const id = ctxMenu.target.id;
                    openEditor(id);
                    closeCtxMenu();
                  }}
                  disabled={editingDisabled}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    borderRadius: 8,
                    cursor: editingDisabled ? 'not-allowed' : 'pointer',
                    opacity: editingDisabled ? 0.5 : 1,
                  }}
                >
                  Edit…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (ctxMenu.target.kind !== 'feature') return;
                    if (editingDisabled) return;
                    const id = ctxMenu.target.id;
                    cloneFeature(id);
                    closeCtxMenu();
                  }}
                  disabled={editingDisabled}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    borderRadius: 8,
                    cursor: editingDisabled ? 'not-allowed' : 'pointer',
                    opacity: editingDisabled ? 0.5 : 1,
                  }}
                >
                  Clone
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (ctxMenu.target.kind !== 'feature') return;
                    if (editingDisabled) return;
                    const id = ctxMenu.target.id;
                    setStatus(id, 'done');
                    closeCtxMenu();
                  }}
                  disabled={editingDisabled}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'inherit',
                    border: 'none',
                    borderRadius: 8,
                    cursor: editingDisabled ? 'not-allowed' : 'pointer',
                    opacity: editingDisabled ? 0.5 : 1,
                  }}
                >
                  Mark done
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (ctxMenu.target.kind !== 'feature') return;
                    if (editingDisabled) return;
                    const id = ctxMenu.target.id;
                    deleteFeature(id);
                    closeCtxMenu();
                  }}
                  disabled={editingDisabled}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'transparent',
                    color: '#ff9b9b',
                    border: 'none',
                    borderRadius: 8,
                    cursor: editingDisabled ? 'not-allowed' : 'pointer',
                    opacity: editingDisabled ? 0.5 : 1,
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
              {editingDisabled ? (
                <div style={{ fontSize: 12, color: themeVars.muted }}>
                  Demo mode: changes aren’t saved.
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Title</label>
              <input
                ref={editorTitleRef}
                value={draftTitle}
                readOnly={editingDisabled}
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
                  ...(editingDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : null),
                }}
                onFocus={(e) => {
                  if (editingDisabled) return;
                  e.currentTarget.style.border = '1px solid rgba(120,200,255,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 6px rgba(120,200,255,0.12)';
                }}
                onBlur={(e) => {
                  if (editingDisabled) return;
                  e.currentTarget.style.border = `1px solid ${themeVars.border}`;
                  e.currentTarget.style.boxShadow = '0 0 0 0 rgba(120,200,255,0.5)';
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Notes</label>
              <textarea
                value={draftDescription}
                readOnly={editingDisabled}
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
                  ...(editingDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : null),
                }}
                onFocus={(e) => {
                  if (editingDisabled) return;
                  e.currentTarget.style.border = '1px solid rgba(120,200,255,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 6px rgba(120,200,255,0.12)';
                }}
                onBlur={(e) => {
                  if (editingDisabled) return;
                  e.currentTarget.style.border = `1px solid ${themeVars.border}`;
                  e.currentTarget.style.boxShadow = '0 0 0 0 rgba(120,200,255,0.5)';
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13, opacity: 0.8 }}>Tags (comma-separated)</label>
              <input
                value={draftTags}
                readOnly={editingDisabled}
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
                  ...(editingDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : null),
                }}
                onFocus={(e) => {
                  if (editingDisabled) return;
                  e.currentTarget.style.border = '1px solid rgba(120,200,255,0.5)';
                  e.currentTarget.style.boxShadow = '0 0 0 6px rgba(120,200,255,0.12)';
                }}
                onBlur={(e) => {
                  if (editingDisabled) return;
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
                  disabled={editingDisabled}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `1px solid ${themeVars.border}`,
                    background: themeVars.inputBg2,
                    color: 'inherit',
                    outline: 'none',
                    fontSize: 14,
                    ...(editingDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : null),
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
                        disabled={editingDisabled}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 12,
                          border: active ? `1px solid ${meta.chipBorder}` : `1px solid ${themeVars.border}`,
                          background: active ? meta.chipBg : themeVars.panelBg2,
                          color: active ? meta.chipText : themeVars.appText,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: editingDisabled ? 'not-allowed' : 'pointer',
                          opacity: editingDisabled ? 0.5 : 1,
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
                disabled={editingDisabled}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${themeVars.border}`,
                  background: 'linear-gradient(120deg, rgba(120,200,255,0.6), rgba(120,160,255,0.7))',
                  color: '#0b111a',
                  cursor: editingDisabled ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  opacity: editingDisabled ? 0.6 : 1,
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
