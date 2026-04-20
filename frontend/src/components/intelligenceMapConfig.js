/**
 * Tunable map behavior for Intelligence: brush selection and polygon “lock” feedback.
 *
 * User-drawn map geometry animates best via **Mapbox paint/layout** (`setPaintProperty`), not Lottie/Rive:
 * those tools target layout UI (fixed artboards). Here the shape, position, and zoom change every time,
 * so you drive motion from **parameters** (translate px, stroke width, opacity) keyed to the close event.
 */

/** Paintbrush is only offered at “city block” scale and finer. */
export const BRUSH_SELECTION_CONFIG = {
  /** Map zoom must be >= this value (Mapbox zoom). ~14 ≈ large block / small neighborhood. */
  minZoom: 14,
  /** Default brush radius in screen pixels (stroke half-width visually). */
  defaultBrushRadiusPx: 22,
  minBrushRadiusPx: 8,
  maxBrushRadiusPx: 72,
  /** Ignore new stroke samples closer than this along the path (meters). Reduces point spam. */
  strokeSampleMinMeters: 1.5,
  /**
   * Turf simplify tolerance in **degrees** (roughly deg × 111km ≈ meters at equator).
   * Higher = coarser final polygon after mouse release.
   */
  simplifyToleranceDeg: 0.000012,
  /** Preview stroke while painting */
  previewLineColor: '#22c55e',
  previewLineOpacity: 0.38,
  /** Blur fraction of brush radius applied to preview line */
  previewLineBlurRatio: 0.35,
};

/**
 * One-shot “lock” bounce when Mapbox Draw closes a polygon.
 * Mapbox Draw registers two copies of each style layer (`.cold` / `.hot` sources); the animator
 * must update both—see `getPlotDrawPolygonLayerTriples` in `IntelligenceModal.jsx`.
 *
 * Motion is **fill-translate** / **line-translate** in viewport pixels (`translateAnchor`),
 * plus glow width/blur. Tune `peakPx` / `overshootPx` / `durationMs` for feel.
 */
export const POLYGON_LOCK_ANIMATION = {
  enabled: true,
  /** Slightly longer so the bigger bounce reads clearly. */
  durationMs: 500,
  /** Use viewport so “up” stays screen-up regardless of map bearing. */
  translateAnchor: 'viewport',
  translate: {
    /** Negative = toward top of screen (larger = more playful “lift”). */
    peakPx: -5,
    /** Positive = visible dip before settling (springy feel). */
    overshootPx: 5,
  },
  /**
   * Phase fractions (sum to 1): rise → fall to overshoot → settle.
   * Slightly longer settle keeps the motion from feeling abrupt.
   */
  phases: { rise: 0.26, fall: 0.34, settle: 0.4 },
  /** Sharp outline pulse (px) */
  outlineWidth: { basePx: 3, peakPx: 5 },
  /** Fill brightens a bit at the peak of the bounce */
  fillOpacity: { minMult: 1, peakMult: 1.25 },
  /** Glow opacity multiplier (combined with wider/blurrier stroke below) */
  glowOpacity: { minMult: 1, peakMult: 1.25 },
  /**
   * Soft outer “aura” stroke: width + blur swell in a second, overlapping hump
   * so the glow feels like an extra pulse after the shape lands.
   */
  glowLine: {
    peakWidthPx: 36,
    peakBlurPx: 22,
    /** Second sine hump offset (0–1 progress): delayed echo on glow only */
    echoDelay: 0.12,
    echoStrength: 0.58,
    echoSpan: 0.52,
  },
};
