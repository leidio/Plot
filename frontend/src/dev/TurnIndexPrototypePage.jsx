/**
 * Dev-only playground for Intelligence “turn index” UX (collapsed cards → full-panel turn).
 * Run the app with: npm run dev  →  open  http://localhost:5173/?dev=turn-index
 *
 * Not used by production navigation; gated in main.jsx by import.meta.env.DEV + query param.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Layers, MessageCircle, Plus, Undo2 } from 'lucide-react';

/** Turn-index dev UI only (Figma AI panel tokens); kept out of map behavior config. */
const PANEL = {
  fontSans: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  fontMono: "'DM Mono', ui-monospace, monospace",
  panelBg: 'rgba(255, 255, 255, 0.9)',
  panelRadiusPx: 24,
  panelShadow: '0px 20px 25px -5px rgba(0, 0, 0, 0.1), 0px 8px 10px -6px rgba(0, 0, 0, 0.1)',
  panelPaddingPx: 24,
  panelGapPx: 24,
  baseContent: '#1f2937',
  stone100: '#f5f5f4',
  stone200: '#e7e5e4',
  neutral300: '#d4d4d4',
  neutral500: '#737373',
  layerPillMint: '#b9ffde'
};

/** Trackpad / mouse wheel: scales raw delta into accumulated pull. */
const PULL_RESISTANCE_WHEEL = 0.42;
/** Touch: slightly higher so finger travel matches dismiss effort vs trackpad. */
const PULL_RESISTANCE_TOUCH = 0.52;
/** Cumulative pull (px) required to dismiss expanded view. */
const DISMISS_THRESHOLD_PX = 84;
/** Max on-screen rubber-band shift; internal pull can sit at threshold while visual caps here. */
const RUBBER_BAND_DISPLAY_MAX_PX = 120;
/** Snap-back when pull releases below dismiss threshold. */
const RUBBER_BAND_RELEASE_TRANSITION = 'transform 0.28s cubic-bezier(0.32, 1.28, 0.64, 1)';
/** Short inactivity window to treat wheel input as an ended gesture. */
const WHEEL_RELEASE_IDLE_MS = 120;
/** Small extra travel before collapse to sell “over the hump” momentum. */
const COMMIT_EXTRA_PULL_PX = 18;
/** Commit animation: short, deliberate push over the hump before returning to index. */
const COMMIT_DISMISS_TRANSITION = 'transform 0.2s cubic-bezier(0.18, 0.9, 0.25, 1)';

/**
 * Maps signed pull → visual translateY with a soft cap.
 * Positive pull = overscroll from top (content shifts down), negative from bottom (shifts up).
 */
function signedPullToVisualPx(signedPull) {
  if (signedPull === 0) return 0;
  const sign = Math.sign(signedPull);
  const magnitude = Math.abs(signedPull);
  const n = magnitude / DISMISS_THRESHOLD_PX;
  const visual = Math.min(
    RUBBER_BAND_DISPLAY_MAX_PX * Math.sqrt(Math.min(n, 1.25)),
    RUBBER_BAND_DISPLAY_MAX_PX
  );
  return sign * visual;
}

/** Pixels from edge to treat as “at” top/bottom (subpixel scroll + browser rounding). */
const SCROLL_EDGE_EPS_PX = 6;

function scrollEdgeState(el) {
  const top = el.scrollTop;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  return {
    top,
    max,
    atTop: top <= SCROLL_EDGE_EPS_PX,
    atBottom: max <= SCROLL_EDGE_EPS_PX || top >= max - SCROLL_EDGE_EPS_PX
  };
}

const MOCK_TURNS = [
  {
    id: 't1',
    title: 'Stormwater retention',
    subtitle: 'Land-cover, parcels, and drainage patterns',
    layerLabels: ['Tree canopy', 'Elevation', 'Parcel lines'],
    highlightLabel: null,
    extraLayerCount: 0,
    replyCount: 0,
    userPrompt:
      'Where are the best opportunities for distributed stormwater retention in this corridor, given existing tree cover and parcel boundaries?',
    activeLayerTags: [
      { label: 'Tree canopy', tone: 'muted' },
      { label: 'Parcel lines', tone: 'muted' }
    ],
    summaryPills: ['~38% canopy cover', '~12% low-permeability lots'],
    priorityZones: ['North of the rail line — shallow slopes, vacant edges.'],
    sections: [
      {
        heading: 'Retention and canopy',
        body: 'Higher canopy parcels already slow runoff; pairing bioswales with those edges avoids conflicting with mature root zones.'
      },
      {
        heading: 'What this reveals',
        body: 'A narrow band of parcels combines moderate impervious cover with underutilized rear yards—good candidates for rain gardens without taking parking.'
      }
    ],
    followUps: ['Map infiltration constraints', 'Highlight city-owned parcels']
  },
  {
    id: 't2',
    title: 'Heat and ground conditions',
    subtitle: 'Impervious surfaces, lot vacancy, and heat islands',
    layerLabels: ['Tree canopy', 'Lot vacancy', 'Heat islands'],
    highlightLabel: 'Lot vacancy',
    extraLayerCount: 2,
    replyCount: 5,
    userPrompt:
      'How do water gardens, urban heat island effects, large concrete areas, and vacant lots interact in this neighborhood? Where should we prioritize greening?',
    activeLayerTags: [
      { label: 'Impervious surface', tone: 'gray' },
      { label: 'Lot vacancy', tone: 'lime' },
      { label: 'Heat islands', tone: 'peach' }
    ],
    summaryPills: ['~47% impervious surfaces', '~22% paved roadways', '~45% vacant lots'],
    priorityZones: [
      'Grand Blvd corridor — long west-facing facades and sparse canopy.',
      'Rail-adjacent lots — vacancy + radiant heat from ballast.'
    ],
    sections: [
      {
        heading: 'Ground cover, vacancy, and heat intensity',
        body: 'Vacant lots cluster where impervious share is already high; those parcels amplify afternoon heat but are politically easier to green than occupied frontages.'
      },
      {
        heading: 'What this reveals',
        body: 'The worst heat exposure overlaps vacancy in three contiguous blocks—useful for a phased planting and stormwater pilot.'
      },
      {
        heading: 'What can be done',
        body: 'Start with interim mowing-to-meadow on public edges, then tie permanent plantings to stormwater credits where parcels redevelop.'
      },
      {
        heading: 'System framing',
        body: 'Parcel → corridor → network: secure one anchor parcel, extend shade along the corridor, then connect to the wider green grid.'
      }
    ],
    followUps: ['Map tree canopy', 'Show high-impact parcels', 'Overlay intervention network']
  }
];

/** Layer row pills — Figma AI Panel A.1 (node 4244:18908). */
function layerPillToneClasses(tone) {
  switch (tone) {
    case 'lime':
      return 'bg-[#d3fd69] text-[#1f2937]';
    case 'peach':
      return 'border-[0.5px] border-solid border-[#ff6a00] bg-[#feeee2] text-[#1f2937]';
    case 'gray':
      return 'bg-[#d9d9d9] text-[#1f2937]';
    default:
      return 'bg-[#d9d9d9] text-[#1f2937]';
  }
}

export default function TurnIndexPrototypePage() {
  const [expandedId, setExpandedId] = useState(null);
  const [edgePull, setEdgePull] = useState(0);
  const [pullTransition, setPullTransition] = useState('none');
  const [isCommittingDismiss, setIsCommittingDismiss] = useState(false);
  const scrollRef = useRef(null);
  const pullRef = useRef(0);
  const touchStartY = useRef(null);
  const wheelReleaseTimerRef = useRef(null);
  const commitTimerRef = useRef(null);

  const expandedTurn = MOCK_TURNS.find((t) => t.id === expandedId) ?? null;

  const clearTimers = useCallback(() => {
    if (wheelReleaseTimerRef.current) {
      clearTimeout(wheelReleaseTimerRef.current);
      wheelReleaseTimerRef.current = null;
    }
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setEdgePull(0);
    setPullTransition('none');
    pullRef.current = 0;
    setIsCommittingDismiss(false);
    clearTimers();
  }, [expandedId, clearTimers]);

  const updatePull = useCallback((next, transition = 'none') => {
    pullRef.current = next;
    setEdgePull(next);
    setPullTransition(transition);
  }, []);

  const collapse = useCallback(() => {
    clearTimers();
    setExpandedId(null);
    setEdgePull(0);
    setPullTransition('none');
    pullRef.current = 0;
    setIsCommittingDismiss(false);
  }, [clearTimers]);

  const commitDismiss = useCallback(() => {
    if (isCommittingDismiss) return;
    clearTimers();
    const sign = Math.sign(pullRef.current) || 1;
    setIsCommittingDismiss(true);
    updatePull(sign * (DISMISS_THRESHOLD_PX + COMMIT_EXTRA_PULL_PX), COMMIT_DISMISS_TRANSITION);
    commitTimerRef.current = setTimeout(() => {
      collapse();
    }, 195);
  }, [clearTimers, collapse, isCommittingDismiss, updatePull]);

  const releasePull = useCallback(() => {
    if (Math.abs(pullRef.current) >= DISMISS_THRESHOLD_PX) {
      commitDismiss();
    } else {
      updatePull(0, RUBBER_BAND_RELEASE_TRANSITION);
    }
  }, [commitDismiss, updatePull]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !expandedTurn) return undefined;

    function scheduleWheelRelease() {
      if (wheelReleaseTimerRef.current) {
        clearTimeout(wheelReleaseTimerRef.current);
      }
      wheelReleaseTimerRef.current = setTimeout(() => {
        releasePull();
      }, WHEEL_RELEASE_IDLE_MS);
    }

    function onWheel(e) {
      if (isCommittingDismiss) {
        e.preventDefault();
        return;
      }
      const { atTop, atBottom } = scrollEdgeState(el);

      if (e.deltaY < 0 && atTop) {
        e.preventDefault();
        const next = pullRef.current + Math.abs(e.deltaY) * PULL_RESISTANCE_WHEEL;
        updatePull(next);
        if (Math.abs(next) >= DISMISS_THRESHOLD_PX) {
          commitDismiss();
          return;
        }
        scheduleWheelRelease();
      } else if (e.deltaY > 0 && atBottom) {
        e.preventDefault();
        const next = pullRef.current - Math.abs(e.deltaY) * PULL_RESISTANCE_WHEEL;
        updatePull(next);
        if (Math.abs(next) >= DISMISS_THRESHOLD_PX) {
          commitDismiss();
          return;
        }
        scheduleWheelRelease();
      } else if (pullRef.current !== 0) {
        scheduleWheelRelease();
      }
    }

    function onTouchStart(e) {
      if (isCommittingDismiss || e.touches.length !== 1) return;
      touchStartY.current = e.touches[0].clientY;
    }

    function onTouchMove(e) {
      if (isCommittingDismiss || touchStartY.current == null || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const dy = y - touchStartY.current;
      const { atTop, atBottom } = scrollEdgeState(el);

      if (dy > 0 && atTop) {
        e.preventDefault();
        const next = pullRef.current + dy * PULL_RESISTANCE_TOUCH;
        updatePull(Math.max(0, next));
        touchStartY.current = y;
      } else if (dy < 0 && atBottom) {
        e.preventDefault();
        const next = pullRef.current - Math.abs(dy) * PULL_RESISTANCE_TOUCH;
        updatePull(Math.min(0, next));
        touchStartY.current = y;
      }
    }

    function onTouchEnd() {
      if (isCommittingDismiss) return;
      touchStartY.current = null;
      releasePull();
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      if (wheelReleaseTimerRef.current) {
        clearTimeout(wheelReleaseTimerRef.current);
        wheelReleaseTimerRef.current = null;
      }
    };
  }, [expandedTurn, commitDismiss, isCommittingDismiss, releasePull, updatePull]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const visualPullPx = signedPullToVisualPx(edgePull);

  const panelPosition = {
    top: 'max(24px, var(--panel-top-offset, 88px))',
    maxHeight: 'calc(100vh - max(24px, var(--panel-top-offset, 88px)) - 24px)'
  };

  function PromptBar() {
    return (
      <div
        className="flex w-full shrink-0 items-center gap-3 rounded-lg border-[0.5px] border-solid bg-white p-4"
        style={{ borderColor: PANEL.neutral300 }}
      >
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: PANEL.stone200 }}
          aria-label="Attach"
        >
          <Plus className="h-[10.5px] w-[10.5px]" strokeWidth={2.5} style={{ color: PANEL.baseContent }} />
        </button>
        <input
          type="text"
          readOnly
          placeholder="What next?"
          className="min-w-0 flex-1 bg-transparent text-xs font-normal leading-5 outline-none placeholder:text-[#737373]"
          style={{ color: PANEL.baseContent, letterSpacing: '0.12px' }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-200/90">
      <p
        className="fixed left-4 top-4 z-[100] max-w-md rounded-lg border-[0.5px] border-black bg-white/95 px-3 py-2 text-xs leading-relaxed shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]"
        style={{ fontFamily: PANEL.fontSans, color: PANEL.baseContent }}
      >
        <span className="font-medium">Turn index prototype</span>
        <br />
        Query:{' '}
        <code className="rounded bg-[#f5f5f4] px-1 py-0.5 text-[10px]" style={{ fontFamily: PANEL.fontMono }}>
          ?dev=turn-index
        </code>
        <br />
        Expand a card, then pull past the scroll edge (or use <strong>Back</strong>) to return.
      </p>

      <div
        className="fixed right-9 z-[101] flex w-[min(504px,92vw)] flex-col overflow-hidden"
        style={{
          fontFamily: PANEL.fontSans,
          backgroundColor: PANEL.panelBg,
          borderRadius: PANEL.panelRadiusPx,
          boxShadow: PANEL.panelShadow,
          padding: PANEL.panelPaddingPx,
          gap: PANEL.panelGapPx,
          ...panelPosition
        }}
        role="dialog"
        aria-label="Intelligence turn index prototype"
      >
        {!expandedTurn ? (
          <>
            <header className="flex w-full shrink-0 items-center justify-between gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-[18px] border border-black border-solid bg-white px-3 py-1.5 text-[10px] font-normal leading-5 text-[#1f2937] hover:bg-stone-50"
                onClick={() => {
                  window.alert('Start over (mock)');
                }}
              >
                <Undo2 className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                Start over
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#1f2937] hover:bg-black/5"
                aria-label="Minimize"
              >
                <ChevronDown className="h-6 w-6" strokeWidth={2} />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
              {MOCK_TURNS.map((turn) => (
                <button
                  key={turn.id}
                  type="button"
                  onClick={() => setExpandedId(turn.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg p-4 text-left transition-opacity hover:opacity-95"
                  style={{ backgroundColor: PANEL.stone100 }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <p
                      className="min-w-0 truncate text-xs font-medium leading-5"
                      style={{ color: PANEL.baseContent }}
                    >
                      {turn.title}
                    </p>
                    {turn.extraLayerCount > 0 && (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-normal leading-5 tracking-[-0.02em] text-[#1f2937]"
                        style={{ fontFamily: PANEL.fontMono, backgroundColor: PANEL.layerPillMint }}
                      >
                        <Layers className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                        +{turn.extraLayerCount}
                      </span>
                    )}
                    {turn.replyCount > 0 && (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-white px-2 py-0.5 text-[10px] font-normal leading-5 tracking-[-0.02em] text-[#1f2937]"
                        style={{ fontFamily: PANEL.fontMono }}
                      >
                        <MessageCircle className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                        {turn.replyCount}
                      </span>
                    )}
                  </div>
                  <Plus
                    className="h-3.5 w-3.5 shrink-0"
                    strokeWidth={2.5}
                    style={{ color: PANEL.baseContent }}
                    aria-hidden
                  />
                </button>
              ))}
            </div>

            <PromptBar />
          </>
        ) : (
          <>
            <header className="flex w-full shrink-0 items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={collapse}
                  className="flex shrink-0 items-center justify-center rounded-md p-0.5 text-[#1f2937] hover:bg-black/5"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <h1
                  className="min-w-0 truncate text-base font-semibold leading-5 tracking-0"
                  style={{ color: PANEL.baseContent }}
                >
                  {expandedTurn.title}
                </h1>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#1f2937] hover:bg-black/5"
                aria-label="Minimize"
              >
                <ChevronDown className="h-6 w-6" strokeWidth={2} />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-auto"
            >
              <div
                className="flex flex-col gap-6 pb-2"
                style={{
                  transform: `translateY(${visualPullPx}px)`,
                  transition: pullTransition
                }}
              >
                <div className="flex w-full justify-end">
                  <div
                    className="w-[75%] rounded-lg p-4"
                    style={{ backgroundColor: PANEL.stone100 }}
                  >
                    <p
                      className="text-left text-xs font-normal leading-[18px] tracking-[0.12px]"
                      style={{ color: PANEL.baseContent }}
                    >
                      {expandedTurn.userPrompt}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {expandedTurn.activeLayerTags.map((tag) => (
                    <span
                      key={tag.label}
                      className={`inline-flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] font-normal leading-5 tracking-[-0.02em] ${layerPillToneClasses(tag.tone)}`}
                      style={{ fontFamily: PANEL.fontMono }}
                    >
                      <Layers className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                      {tag.label}
                    </span>
                  ))}
                </div>

                <div className="flex w-full flex-col gap-4">
                  <p
                    className="text-xs font-semibold leading-[18px] tracking-[0.12px]"
                    style={{ color: PANEL.baseContent }}
                  >
                    Summary
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {expandedTurn.summaryPills.map((pill) => (
                      <span
                        key={pill}
                        className="inline-flex items-center justify-center rounded-lg bg-white px-2 py-1 text-[10px] font-normal leading-5 tracking-[-0.02em]"
                        style={{ fontFamily: PANEL.fontMono, color: PANEL.baseContent }}
                      >
                        {pill}
                      </span>
                    ))}
                  </div>

                  <div
                    className="w-full text-xs font-normal leading-[18px] tracking-[0.12px]"
                    style={{ color: PANEL.baseContent }}
                  >
                    <p className="mb-4">
                      <span className="font-semibold">Priority zones</span>
                      <br />
                      {expandedTurn.priorityZones.map((z, i) => (
                        <React.Fragment key={z}>
                          {i > 0 ? ' — ' : null}
                          <span className="font-semibold">{String.fromCharCode(65 + i)}</span>
                          {` ${z}`}
                        </React.Fragment>
                      ))}
                    </p>
                    {expandedTurn.sections.map((sec) => (
                      <p key={sec.heading} className="mb-4 last:mb-0">
                        <span className="font-semibold">{sec.heading}</span>
                        <br />
                        {sec.body}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="flex w-full flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    {expandedTurn.followUps.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className="rounded-lg border-[0.5px] border-solid border-black bg-white px-2 py-1 text-[10px] font-normal leading-5 tracking-[-0.02em] text-[#1f2937] hover:bg-stone-50"
                        style={{ fontFamily: PANEL.fontMono }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {Math.abs(edgePull) > 8 && (
                  <p className="text-center text-[10px] leading-5" style={{ color: PANEL.neutral500 }}>
                    Release or keep pulling to return to index…
                  </p>
                )}
              </div>
            </div>

            <PromptBar />
          </>
        )}
      </div>
    </div>
  );
}
