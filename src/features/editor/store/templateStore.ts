/**
 * Central Zustand store for the template builder.
 *
 * Holds the full TemplateJSON state plus UI-only state (selectedZoneId, zoom, etc.).
 * Undo/redo is implemented via a history stack of snapshots.
 */

import { create } from 'zustand';
import type {
  TemplateJSON,
  ZoneSpec,
  BoundsSpec,
  StyleDef,
  AssetDef,
} from '../types/template';
import type { RenderManifest, ResolvedTextLayout, ResolvedZone } from '../types/manifest';
import { importTemplate } from '../utils/importTemplate';
import { hasForcedAutoHeight } from '../utils/zoneRules';
import { getAssetPreviewUrl } from '../utils/assetPreview';
import {
  clampVideoBoundsPosition,
  normalizeVideoBounds,
  readBoundsAspectRatio,
} from '../utils/videoBounds';

/* ── UI-only state ─────────────────────────────── */

interface UIState {
  selectedZoneId: string | null;
  interactionMode: 'idle' | 'selected' | 'editing_text';
  editingTextZoneId: string | null;
  zoom: number;
  gridSnap: boolean;
  gridSize: number;
  lockedZoneIds: Set<string>;
  /** Maps zone id → objectURL for preview on canvas (UI-only, not serialized). */
  uploadedImages: Record<string, string>;
  assetPreviewError: string | null;
  /** Maps asset key → raw File blob for deferred GCS upload on save. */
  pendingFiles: Record<string, File>;
  /** Preview text content keyed by content_ref (e.g. pov_text → "actual words"). */
  previewTexts: Record<string, string>;
  /** Loaded manifest for re-render flow. */
  activeManifest: RenderManifest | null;
  /** Source video aspect ratio from media metadata, used only as a resize fallback. */
  sourceVideoAspectRatio: number | null;
  /** Re-render state. */
  reRenderState: {
    loading: boolean;
    resultUrl: string | null;
    error: string | null;
  };
  /** Ephemeral AI POV suggestions keyed by content_ref for the current page session. */
  aiCopySessions: Record<string, AICopySessionState>;
}

interface AICopySessionState {
  options: string[];
  rejected: string[];
  loading: boolean;
  error: string | null;
  copyLanguage: 'en' | 'hi' | null;
}

/* ── History (undo/redo) ───────────────────────── */

interface HistoryEntry {
  template: TemplateJSON;
}

/* ── Store shape ───────────────────────────────── */

interface TemplateStore extends UIState {
  template: TemplateJSON;
  history: HistoryEntry[];
  historyIndex: number;

  // Template-level
  setTemplate: (t: TemplateJSON) => void;
  setCanvasSize: (w: number, h: number) => void;
  setTemplateId: (id: string) => void;
  setCompositingMode: (mode: 'stack' | 'overlay') => void;

  // Zone CRUD
  addZone: (zone: ZoneSpec) => void;
  updateZone: (id: string, patch: Partial<ZoneSpec>) => void;
  updateZoneBounds: (id: string, bounds: Partial<BoundsSpec>) => void;
  updateZoneBoundsExact: (id: string, bounds: Partial<BoundsSpec>) => void;
  removeZone: (id: string) => void;
  duplicateZone: (id: string) => void;
  reorderZone: (id: string, newZ: number) => void;

  // Styles
  setStyle: (key: string, style: StyleDef) => void;
  removeStyle: (key: string) => void;

  // Assets
  setAsset: (key: string, asset: AssetDef) => void;
  removeAsset: (key: string) => void;

  // UI
  selectZone: (id: string | null) => void;
  beginTextEditing: (zoneId: string) => void;
  endTextEditing: (keepSelection?: boolean) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  setGridSize: (size: number) => void;
  toggleLock: (id: string) => void;
  isLocked: (id: string) => boolean;

  // Uploaded images (UI-only blob URLs for canvas preview)
  setUploadedImage: (zoneId: string, blobUrl: string) => void;
  removeUploadedImage: (zoneId: string) => void;
  setAssetPreviewError: (message: string | null) => void;

  // Pending files for deferred GCS upload
  setPendingFile: (assetKey: string, file: File) => void;
  removePendingFile: (assetKey: string) => void;
  getPendingFiles: () => Record<string, File>;
  clearPendingFiles: () => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Manifest / Interface Editor
  loadFromManifest: (manifest: RenderManifest) => void;
  setPreviewText: (contentRef: string, text: string) => void;
  setZoneClipTiming: (zoneId: string, start: number, end: number) => void;
  updateManifestRenderPayload: (patch: Record<string, unknown>) => void;
  setSourceVideoAspectRatio: (aspectRatio: number | null) => void;
  repairVideoZoneBounds: (zoneId: string, aspectRatio?: number | null) => void;
  setReRenderLoading: (loading: boolean) => void;
  setReRenderResult: (url: string | null, error?: string | null) => void;
  updateAICopySession: (contentRef: string, patch: Partial<AICopySessionState>) => void;
  clearAICopySessions: () => void;
}

/* ── Initial template ──────────────────────────── */

const INITIAL_TEMPLATE: TemplateJSON = {
  template_version: '1.0',
  id: 'untitled/v1',
  canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
  compositing_mode: 'stack',
  zones: [
    {
      id: 'title_band',
      type: 'text',
      content_ref: 'pov_text',
      bounds: { x: 0, y: 0, width: 1080, height: 270 },
      z: 10,
      text: {
        max_lines: 3,
        overflow: 'shrink',
        font: { family: 'NotoSansDevanagari', weight: 700, fallbacks: [], size: 60 },
        width_percent: 75,
        min_font_size: 24,
        horizontal_align: 'center',
        vertical_align: 'middle',
        line_spacing_px: 6,
      },
      style_ref: 'title_style',
    },
    {
      id: 'logo_mark',
      type: 'image',
      role: 'logo',
      asset_ref: 'logo_mark',
      bounds: { x: 15, y: 15, width: 50 },
      z: 20,
    },
    {
      id: 'video_main',
      type: 'video',
      bounds: { x: 0, y: 270, width: 1080, height: 810 },
      z: 0,
      media: { fit: 'cover', crop_anchor: 'center' },
    },
  ],
  styles: {
    title_style: { fill: '#000000', bg_fill: '#FFFFFF' },
  },
  assets: {},
};

const MAX_HISTORY = 50;

/* ── Helpers ───────────────────────────────────── */

function snap(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return value;
  return Math.round(value / gridSize) * gridSize;
}

function cloneTemplate(t: TemplateJSON): TemplateJSON {
  return JSON.parse(JSON.stringify(t));
}

function maybeRevokeObjectUrl(url: string): void {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function normalizeZone(zone: ZoneSpec): ZoneSpec {
  if (!hasForcedAutoHeight(zone) || zone.bounds.height === undefined) return zone;
  const { height: _height, ...bounds } = zone.bounds;
  return { ...zone, bounds };
}

function normalizeTemplate(template: TemplateJSON): TemplateJSON {
  return {
    ...template,
    zones: template.zones.map(zone => normalizeZone(zone)),
  };
}

function coerceFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildTemplateWithBoundsUpdate(
  template: TemplateJSON,
  zoneId: string,
  boundsUpdate: Partial<BoundsSpec>,
  options: {
    gridSnap: boolean;
    gridSize: number;
    sourceVideoAspectRatio: number | null;
    snapEnabled: boolean;
  }
): TemplateJSON {
  const maybeSnap = (value: number) =>
    options.snapEnabled ? snap(value, options.gridSize, options.gridSnap) : value;

  const nextTemplate = {
    ...template,
    zones: template.zones.map(zone => {
      if (zone.id !== zoneId) return zone;

      const old = zone.bounds;
      const newBounds: BoundsSpec = {
        x: boundsUpdate.x !== undefined ? maybeSnap(boundsUpdate.x as number) : old.x,
        y: boundsUpdate.y !== undefined ? maybeSnap(boundsUpdate.y as number) : old.y,
        width:
          boundsUpdate.width !== undefined
            ? Math.max(10, maybeSnap(boundsUpdate.width as number))
            : old.width,
      };

      if (!hasForcedAutoHeight(zone) && boundsUpdate.height !== undefined) {
        newBounds.height = Math.max(10, maybeSnap(boundsUpdate.height as number));
      } else if (!hasForcedAutoHeight(zone) && old.height !== undefined) {
        newBounds.height = old.height;
      }

      if (zone.type === 'video') {
        const widthChanged = boundsUpdate.width !== undefined;
        const heightChanged = boundsUpdate.height !== undefined;
        const currentWidth = Number(old.width) || template.canvas.width;
        const currentHeight =
          Number(old.height ?? template.canvas.height) || template.canvas.height;
        const currentAspectRatio =
          readBoundsAspectRatio(old) ?? options.sourceVideoAspectRatio;
        const rawBounds: BoundsSpec = {
          x: Number(newBounds.x) || 0,
          y: Number(newBounds.y) || 0,
          width: Number(newBounds.width) || currentWidth,
          height: Number(newBounds.height ?? currentHeight) || currentHeight,
        };

        let adjustedBounds = rawBounds;
        if (
          currentAspectRatio &&
          currentAspectRatio > 0 &&
          (widthChanged || heightChanged)
        ) {
          if (widthChanged && !heightChanged) {
            adjustedBounds = {
              ...rawBounds,
              height: Math.max(
                10,
                Math.round(Number(rawBounds.width) / currentAspectRatio)
              ),
            };
          } else if (heightChanged && !widthChanged) {
            adjustedBounds = {
              ...rawBounds,
              width: Math.max(
                10,
                Math.round(Number(rawBounds.height) * currentAspectRatio)
              ),
            };
          } else if (widthChanged && heightChanged) {
            const widthDelta = Math.abs(Number(rawBounds.width) - currentWidth);
            const heightDelta = Math.abs(Number(rawBounds.height) - currentHeight);
            adjustedBounds =
              widthDelta >= heightDelta
                ? {
                    ...rawBounds,
                    height: Math.max(
                      10,
                      Math.round(Number(rawBounds.width) / currentAspectRatio)
                    ),
                  }
                : {
                    ...rawBounds,
                    width: Math.max(
                      10,
                      Math.round(Number(rawBounds.height) * currentAspectRatio)
                    ),
                  };
          }
        }

        const normalizedBounds =
          widthChanged || heightChanged
            ? normalizeVideoBounds(adjustedBounds, template.canvas)
            : clampVideoBoundsPosition(adjustedBounds, template.canvas);
        return normalizeZone({ ...zone, bounds: normalizedBounds });
      }

      return normalizeZone({ ...zone, bounds: newBounds });
    }),
  };

  return nextTemplate.compositing_mode === 'stack'
    ? enforceClipStackConstraints(nextTemplate)
    : nextTemplate;
}

function isResolvedTextLayout(value: unknown): value is ResolvedTextLayout {
  return Boolean(value) && typeof value === 'object';
}

function deriveEditableTextBounds(
  zone: ZoneSpec,
  resolvedZone: ResolvedZone | undefined
): BoundsSpec | null {
  if (zone.type !== 'text' || !zone.text || !resolvedZone) return null;

  const layout = isResolvedTextLayout(resolvedZone.resolved?.text_layout)
    ? resolvedZone.resolved.text_layout
    : null;
  const rect = resolvedZone.rect;
  if (!layout || !rect) return null;

  const fontSize = coerceFiniteNumber(layout.font_size_used, zone.text.font.size ?? 40);
  const paddingX = Math.max(18, Math.round(fontSize * 0.3));
  const paddingY = Math.max(10, Math.round(fontSize * 0.18));
  const measuredTextWidth = coerceFiniteNumber(
    layout.max_text_width_px,
    coerceFiniteNumber(layout.block_width_px, rect.w - paddingX * 2)
  );
  const blockHeight = coerceFiniteNumber(layout.block_height_px, fontSize);
  const lineCount = Math.max(1, Math.round(coerceFiniteNumber(layout.line_count, 1)));
  const lineSpacing = Math.max(
    0,
    coerceFiniteNumber(layout.line_spacing_px, zone.text.line_spacing_px ?? 0)
  );
  const estimatedLineHeight = Math.max(
    coerceFiniteNumber(layout.line_height_px, fontSize * 0.92),
    fontSize * 0.92
  );
  const estimatedBlockHeight = Math.max(
    blockHeight,
    Math.round(lineCount * estimatedLineHeight + Math.max(0, lineCount - 1) * lineSpacing)
  );
  const totalWidth = clamp(Math.round(measuredTextWidth + paddingX * 2), 120, rect.w);
  const totalHeight = clamp(
    Math.round(estimatedBlockHeight + paddingY * 2 + Math.max(4, fontSize * 0.08)),
    Math.round(fontSize + paddingY * 2),
    rect.h
  );

  const horizontalAlign =
    zone.text.horizontal_align ?? layout.horizontal_align ?? 'center';
  const verticalAlign = zone.text.vertical_align ?? layout.vertical_align ?? 'middle';

  let nextX = rect.x + (rect.w - totalWidth) / 2;
  if (horizontalAlign === 'left') {
    nextX = rect.x + paddingX;
  } else if (horizontalAlign === 'right') {
    nextX = rect.x + rect.w - totalWidth - paddingX;
  }

  let nextY = rect.y + (rect.h - totalHeight) / 2;
  if (verticalAlign === 'top') {
    nextY = rect.y + paddingY;
  } else if (verticalAlign === 'bottom') {
    nextY = rect.y + rect.h - totalHeight - paddingY;
  }

  return {
    x: Math.round(clamp(nextX, rect.x, rect.x + rect.w - totalWidth)),
    y: Math.round(clamp(nextY, rect.y, rect.y + rect.h - totalHeight)),
    width: totalWidth,
    height: totalHeight,
  };
}

function boundsFromResolvedRect(
  resolvedZone: ResolvedZone | undefined
): BoundsSpec | null {
  const rect = resolvedZone?.rect;
  if (!rect) return null;

  return {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
  };
}

function clampBoundsWithinContainer(
  bounds: BoundsSpec,
  container: BoundsSpec
): BoundsSpec {
  const containerX = Number(container.x) || 0;
  const containerY = Number(container.y) || 0;
  const containerWidth = Math.max(10, Number(container.width) || 10);
  const containerHeight = Math.max(10, Number(container.height) || 10);
  const width = Math.min(Math.max(10, Number(bounds.width) || 10), containerWidth);
  const height = Math.min(
    Math.max(
      10,
      bounds.height !== undefined ? Number(bounds.height) || 10 : containerHeight
    ),
    containerHeight
  );

  return {
    x: clamp(
      Number(bounds.x) || containerX,
      containerX,
      containerX + containerWidth - width
    ),
    y: clamp(
      Number(bounds.y) || containerY,
      containerY,
      containerY + containerHeight - height
    ),
    width,
    height,
  };
}

function makeUniqueStyleKey(existing: Record<string, StyleDef>, baseKey: string): string {
  if (!existing[baseKey]) return baseKey;
  let index = 2;
  while (existing[`${baseKey}_${index}`]) {
    index += 1;
  }
  return `${baseKey}_${index}`;
}

function splitTextBackgroundLayers(
  template: TemplateJSON,
  manifest: RenderManifest
): { template: TemplateJSON; lockedZoneIds: Set<string> } {
  const nextStyles: Record<string, StyleDef> = { ...template.styles };
  const nextZones: ZoneSpec[] = [];
  const lockedZoneIds = new Set<string>();
  const resolvedZonesById = new Map(manifest.resolved_zones.map(zone => [zone.id, zone]));
  const backgroundZonesById = new Map<string, ZoneSpec>();

  for (const zone of template.zones) {
    if (zone.type === 'shape' && zone.role === 'text_background') {
      lockedZoneIds.add(zone.id);
      backgroundZonesById.set(zone.id, zone);
      continue;
    }

    if (zone.type !== 'text') {
      nextZones.push(zone);
      continue;
    }
  }

  for (const zone of template.zones) {
    if (zone.type !== 'text') {
      continue;
    }

    const resolvedZone = resolvedZonesById.get(zone.id);
    const editableBounds = deriveEditableTextBounds(zone, resolvedZone);
    const backgroundZoneId = `${zone.id}__bg`;
    const existingBackgroundZone = backgroundZonesById.get(backgroundZoneId);
    const existingBackgroundStyle = existingBackgroundZone?.style_ref
      ? nextStyles[existingBackgroundZone.style_ref]
      : undefined;
    const originalStyle = zone.style_ref ? nextStyles[zone.style_ref] : undefined;
    const resolvedFills = resolvedZone?.resolved?.fills as
      | Record<string, unknown>
      | undefined;
    const backgroundFill =
      (typeof existingBackgroundStyle?.fill === 'string' &&
        existingBackgroundStyle.fill) ||
      (typeof existingBackgroundStyle?.bg_fill === 'string' &&
        existingBackgroundStyle.bg_fill) ||
      (typeof originalStyle?.bg_fill === 'string' && originalStyle.bg_fill) ||
      (typeof resolvedFills?.bg === 'string' ? resolvedFills.bg : '');
    const textFill =
      (typeof originalStyle?.fill === 'string' && originalStyle.fill) ||
      (typeof resolvedFills?.text === 'string' ? resolvedFills.text : '#000000');
    const canonicalBackgroundBounds =
      boundsFromResolvedRect(resolvedZone) ||
      existingBackgroundZone?.bounds ||
      zone.bounds;

    const migratedZone: ZoneSpec = normalizeZone({
      ...zone,
      bounds: clampBoundsWithinContainer(
        editableBounds ?? zone.bounds,
        canonicalBackgroundBounds
      ),
      text: zone.text
        ? {
            ...zone.text,
            width_percent: 100,
          }
        : zone.text,
    });

    if (!backgroundFill && !existingBackgroundZone) {
      nextZones.push(migratedZone);
      continue;
    }

    let backgroundStyleKey = existingBackgroundZone?.style_ref;
    if (!backgroundStyleKey) {
      const baseStyleKey = zone.style_ref || `${zone.id}_style`;
      backgroundStyleKey = makeUniqueStyleKey(nextStyles, `${baseStyleKey}__background`);
      nextStyles[backgroundStyleKey] = { fill: backgroundFill };
    } else {
      nextStyles[backgroundStyleKey] = {
        ...(nextStyles[backgroundStyleKey] || {}),
        fill: backgroundFill,
      };
    }
    nextZones.push(
      normalizeZone({
        ...(existingBackgroundZone || {}),
        id: backgroundZoneId,
        type: 'shape',
        bounds: canonicalBackgroundBounds,
        z: existingBackgroundZone?.z ?? zone.z - 1,
        style_ref: backgroundStyleKey,
        shape: existingBackgroundZone?.shape || { kind: 'rect' },
        role: 'text_background',
      })
    );
    lockedZoneIds.add(backgroundZoneId);

    const baseStyleKey = zone.style_ref || `${zone.id}_style`;
    const textStyleKey = makeUniqueStyleKey(nextStyles, `${baseStyleKey}__text`);
    nextStyles[textStyleKey] = {
      ...(originalStyle || {}),
      fill: textFill,
    };
    delete nextStyles[textStyleKey].bg_fill;
    migratedZone.style_ref = textStyleKey;

    nextZones.push(migratedZone);
  }

  return {
    template: {
      ...template,
      styles: nextStyles,
      zones: nextZones.sort((left, right) => left.z - right.z),
    },
    lockedZoneIds,
  };
}

function findPrimaryVideoZoneIndex(zones: ZoneSpec[]): number {
  const explicitIndex = zones.findIndex(
    zone => zone.id === 'video_main' && zone.type === 'video'
  );
  if (explicitIndex >= 0) return explicitIndex;
  return zones.findIndex(zone => zone.type === 'video');
}

function findPrimaryTitleZoneIndex(zones: ZoneSpec[]): number {
  const explicitIndex = zones.findIndex(
    zone => zone.id === 'title_band' && zone.type === 'text'
  );
  if (explicitIndex >= 0) return explicitIndex;
  return zones.findIndex(zone => zone.type === 'text' && zone.content_ref === 'pov_text');
}

function enforceClipStackConstraints(template: TemplateJSON): TemplateJSON {
  const nextTemplate =
    template.compositing_mode === 'stack'
      ? template
      : { ...template, compositing_mode: 'stack' as const };
  const nextZones = [...nextTemplate.zones];
  const videoIndex = findPrimaryVideoZoneIndex(nextZones);
  const textIndex = findPrimaryTitleZoneIndex(nextZones);

  if (videoIndex < 0 || textIndex < 0) {
    return nextTemplate;
  }

  const videoZone = nextZones[videoIndex];
  const textZone = nextZones[textIndex];
  const backgroundZoneId = `${textZone.id}__bg`;
  const backgroundIndex = nextZones.findIndex(
    zone =>
      zone.id === backgroundZoneId &&
      zone.type === 'shape' &&
      zone.role === 'text_background'
  );

  if (backgroundIndex < 0) {
    return nextTemplate;
  }

  const backgroundZone = nextZones[backgroundIndex];
  const canvasWidth = Math.max(10, Number(nextTemplate.canvas.width) || 10);
  const canvasHeight = Math.max(10, Number(nextTemplate.canvas.height) || 10);
  const stackWidth = clamp(
    Math.round(
      Number(videoZone.bounds.width) || Number(backgroundZone.bounds.width) || canvasWidth
    ),
    10,
    canvasWidth
  );
  const stackX = clamp(
    Math.round(Number(videoZone.bounds.x) || Number(backgroundZone.bounds.x) || 0),
    0,
    Math.max(canvasWidth - stackWidth, 0)
  );
  const backgroundHeight = Math.max(
    10,
    Math.round(Number(backgroundZone.bounds.height) || 10)
  );
  const backgroundY = clamp(
    Math.round(Number(backgroundZone.bounds.y) || 0),
    0,
    Math.max(canvasHeight - backgroundHeight, 0)
  );
  const videoY = clamp(
    Math.round(Number(videoZone.bounds.y) || backgroundY + backgroundHeight),
    backgroundY + backgroundHeight,
    Math.max(canvasHeight - 10, backgroundY + backgroundHeight)
  );
  const maxVideoHeight = Math.max(canvasHeight - videoY, 10);
  const videoHeight = clamp(
    Math.round(Number(videoZone.bounds.height) || maxVideoHeight),
    10,
    maxVideoHeight
  );

  const syncedBackground: ZoneSpec = normalizeZone({
    ...backgroundZone,
    bounds: {
      x: stackX,
      y: backgroundY,
      width: stackWidth,
      height: backgroundHeight,
    },
  });

  const syncedVideo: ZoneSpec = normalizeZone({
    ...videoZone,
    bounds: {
      x: stackX,
      y: videoY,
      width: stackWidth,
      height: videoHeight,
    },
  });

  const syncedText: ZoneSpec = normalizeZone({
    ...textZone,
    bounds: clampBoundsWithinContainer(textZone.bounds, syncedBackground.bounds),
  });

  nextZones[backgroundIndex] = syncedBackground;
  nextZones[videoIndex] = syncedVideo;
  nextZones[textIndex] = syncedText;

  return {
    ...nextTemplate,
    zones: nextZones.sort((left, right) => left.z - right.z),
  };
}

/* ── Store ─────────────────────────────────────── */

export const useTemplateStore = create<TemplateStore>((set, get) => {
  /**
   * Push a snapshot to history before mutating.
   * Called by every action that changes the template.
   */
  function pushHistory() {
    const { template, history, historyIndex } = get();
    const truncated = history.slice(0, historyIndex + 1);
    const next = [...truncated, { template: cloneTemplate(template) }];
    if (next.length > MAX_HISTORY) next.shift();
    set({ history: next, historyIndex: next.length - 1 });
  }

  return {
    // State
    template: normalizeTemplate(cloneTemplate(INITIAL_TEMPLATE)),
    selectedZoneId: null,
    interactionMode: 'idle',
    editingTextZoneId: null,
    zoom: 1,
    gridSnap: true,
    gridSize: 10,
    lockedZoneIds: new Set(),
    uploadedImages: {},
    assetPreviewError: null,
    pendingFiles: {},
    previewTexts: {},
    activeManifest: null,
    sourceVideoAspectRatio: null,
    reRenderState: { loading: false, resultUrl: null, error: null },
    aiCopySessions: {},
    history: [{ template: normalizeTemplate(cloneTemplate(INITIAL_TEMPLATE)) }],
    historyIndex: 0,

    // ── Template-level ────────────────────────────
    setTemplate: t => {
      const currentImages = get().uploadedImages;
      Object.values(currentImages).forEach(url => maybeRevokeObjectUrl(url));
      const normalized = normalizeTemplate(cloneTemplate(t));

      set({
        template: normalized,
        selectedZoneId: null,
        interactionMode: 'idle',
        editingTextZoneId: null,
        pendingFiles: {},
        uploadedImages: {},
        assetPreviewError: null,
        lockedZoneIds: new Set(),
        sourceVideoAspectRatio: null,
        aiCopySessions: {},
        history: [{ template: normalized }],
        historyIndex: 0,
      });
    },
    setCanvasSize: (w, h) => {
      pushHistory();
      set(s => ({
        template: {
          ...s.template,
          canvas: { ...s.template.canvas, width: w, height: h },
        },
      }));
    },
    setTemplateId: id => {
      pushHistory();
      set(s => ({ template: { ...s.template, id } }));
    },
    setCompositingMode: mode => {
      pushHistory();
      set(s => ({
        template:
          mode === 'stack'
            ? enforceClipStackConstraints({ ...s.template, compositing_mode: mode })
            : { ...s.template, compositing_mode: mode },
      }));
    },

    // ── Zone CRUD ─────────────────────────────────
    addZone: zone => {
      pushHistory();
      const normalizedZone = normalizeZone(zone);
      set(s => ({
        template: { ...s.template, zones: [...s.template.zones, normalizedZone] },
        selectedZoneId: normalizedZone.id,
        interactionMode: 'selected',
        editingTextZoneId: null,
      }));
    },
    updateZone: (id, patch) => {
      pushHistory();
      set(s => ({
        template: {
          ...s.template,
          zones: s.template.zones.map(z =>
            z.id === id ? normalizeZone({ ...z, ...patch }) : z
          ),
        },
      }));
    },
    updateZoneBounds: (id, boundsUpdate) => {
      const { gridSnap, gridSize } = get();
      pushHistory();
      set(s => ({
        template: buildTemplateWithBoundsUpdate(s.template, id, boundsUpdate, {
          gridSnap,
          gridSize,
          sourceVideoAspectRatio: s.sourceVideoAspectRatio,
          snapEnabled: true,
        }),
      }));
    },
    updateZoneBoundsExact: (id, boundsUpdate) => {
      const { gridSnap, gridSize } = get();
      pushHistory();
      set(s => ({
        template: buildTemplateWithBoundsUpdate(s.template, id, boundsUpdate, {
          gridSnap,
          gridSize,
          sourceVideoAspectRatio: s.sourceVideoAspectRatio,
          snapEnabled: false,
        }),
      }));
    },
    removeZone: id => {
      pushHistory();
      set(s => ({
        template: {
          ...s.template,
          zones: s.template.zones.filter(z => z.id !== id),
        },
        selectedZoneId: s.selectedZoneId === id ? null : s.selectedZoneId,
        interactionMode: s.selectedZoneId === id ? 'idle' : s.interactionMode,
        editingTextZoneId: s.editingTextZoneId === id ? null : s.editingTextZoneId,
      }));
    },
    duplicateZone: id => {
      const zone = get().template.zones.find(z => z.id === id);
      if (!zone) return;
      pushHistory();
      const dup: ZoneSpec = {
        ...JSON.parse(JSON.stringify(zone)),
        id: `${zone.id}_copy_${Date.now()}`,
        bounds: {
          x: (zone.bounds.x as number) + 20,
          y: (zone.bounds.y as number) + 20,
          width: zone.bounds.width,
          ...(!hasForcedAutoHeight(zone) && zone.bounds.height !== undefined
            ? { height: zone.bounds.height }
            : {}),
        },
      };
      set(s => ({
        template: { ...s.template, zones: [...s.template.zones, normalizeZone(dup)] },
        selectedZoneId: dup.id,
        interactionMode: 'selected',
        editingTextZoneId: null,
      }));
    },
    reorderZone: (id, newZ) => {
      pushHistory();
      set(s => ({
        template: {
          ...s.template,
          zones: s.template.zones.map(z => (z.id === id ? { ...z, z: newZ } : z)),
        },
      }));
    },

    // ── Styles ────────────────────────────────────
    setStyle: (key, style) => {
      pushHistory();
      set(s => ({
        template: {
          ...s.template,
          styles: { ...s.template.styles, [key]: style },
        },
      }));
    },
    removeStyle: key => {
      pushHistory();
      set(s => {
        const next = { ...s.template.styles };
        delete next[key];
        return { template: { ...s.template, styles: next } };
      });
    },

    // ── Assets ────────────────────────────────────
    setAsset: (key, asset) => {
      pushHistory();
      set(s => ({
        template: {
          ...s.template,
          assets: { ...s.template.assets, [key]: asset },
        },
      }));
    },
    removeAsset: key => {
      pushHistory();
      set(s => {
        const next = { ...s.template.assets };
        delete next[key];
        return { template: { ...s.template, assets: next } };
      });
    },

    // ── UI ────────────────────────────────────────
    selectZone: id =>
      set(s => {
        const nextId = id && s.lockedZoneIds.has(id) ? null : id;
        return {
          selectedZoneId: nextId,
          interactionMode: nextId ? 'selected' : 'idle',
          editingTextZoneId: null,
        };
      }),
    beginTextEditing: zoneId =>
      set({
        selectedZoneId: zoneId,
        interactionMode: 'editing_text',
        editingTextZoneId: zoneId,
      }),
    endTextEditing: (keepSelection = true) =>
      set(s => ({
        selectedZoneId: keepSelection ? s.selectedZoneId : null,
        interactionMode: keepSelection && s.selectedZoneId ? 'selected' : 'idle',
        editingTextZoneId: null,
      })),
    setZoom: zoom => set({ zoom: Math.max(0.25, Math.min(3, zoom)) }),
    toggleGrid: () => set(s => ({ gridSnap: !s.gridSnap })),
    setGridSize: size => set({ gridSize: Math.max(1, size) }),
    toggleLock: id => {
      set(s => {
        const next = new Set(s.lockedZoneIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { lockedZoneIds: next };
      });
    },
    isLocked: id => get().lockedZoneIds.has(id),

    // ── Uploaded images ───────────────────────────
    setUploadedImage: (zoneId, blobUrl) => {
      set(s => {
        const previousUrl = s.uploadedImages[zoneId];
        if (previousUrl && previousUrl !== blobUrl) {
          maybeRevokeObjectUrl(previousUrl);
        }

        return {
          uploadedImages: { ...s.uploadedImages, [zoneId]: blobUrl },
        };
      });
    },
    removeUploadedImage: zoneId => {
      set(s => {
        const next = { ...s.uploadedImages };
        if (next[zoneId]) {
          maybeRevokeObjectUrl(next[zoneId]);
          delete next[zoneId];
        }
        return { uploadedImages: next };
      });
    },
    setAssetPreviewError: message => set({ assetPreviewError: message }),

    // ── Pending files (deferred GCS upload) ──────
    setPendingFile: (assetKey, file) => {
      set(s => ({
        pendingFiles: { ...s.pendingFiles, [assetKey]: file },
      }));
    },
    removePendingFile: assetKey => {
      set(s => {
        if (!(assetKey in s.pendingFiles)) return { pendingFiles: s.pendingFiles };
        const nextPending = { ...s.pendingFiles };
        delete nextPending[assetKey];
        return { pendingFiles: nextPending };
      });
    },
    getPendingFiles: () => get().pendingFiles,
    clearPendingFiles: () => set({ pendingFiles: {} }),

    // ── History ───────────────────────────────────
    undo: () => {
      const { historyIndex, history } = get();
      if (historyIndex <= 0) return;
      const prevIndex = historyIndex - 1;
      set({
        template: cloneTemplate(history[prevIndex].template),
        historyIndex: prevIndex,
        selectedZoneId: null,
        interactionMode: 'idle',
        editingTextZoneId: null,
      });
    },
    redo: () => {
      const { historyIndex, history } = get();
      if (historyIndex >= history.length - 1) return;
      const nextIndex = historyIndex + 1;
      set({
        template: cloneTemplate(history[nextIndex].template),
        historyIndex: nextIndex,
        selectedZoneId: null,
        interactionMode: 'idle',
        editingTextZoneId: null,
      });
    },
    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,

    // ── Manifest / Interface Editor ───────────────
    loadFromManifest: manifest => {
      // Clean up previous blob URLs
      const currentImages = get().uploadedImages;
      Object.values(currentImages).forEach(url => maybeRevokeObjectUrl(url));

      // The manifest's template_ir is already in TemplateJSON-compatible format.
      // Run it through importTemplate to validate & apply defaults.
      const templateJson = importTemplate(JSON.stringify(manifest.template_ir));
      const normalized = normalizeTemplate(cloneTemplate(templateJson));
      const splitTemplate = splitTextBackgroundLayers(
        {
          ...normalized,
          assets: { ...normalized.assets },
        },
        manifest
      );
      const normalizedTemplate = enforceClipStackConstraints(splitTemplate.template);

      // Extract preview texts from the render payload inputs
      const previewTexts: Record<string, string> = {};
      if (manifest.render_payload?.inputs) {
        for (const [key, value] of Object.entries(manifest.render_payload.inputs)) {
          previewTexts[key] = value;
        }
      }

      for (const zone of normalizedTemplate.zones) {
        if (zone.type !== 'text' || !zone.content_ref || previewTexts[zone.content_ref])
          continue;
        const resolvedZone = manifest.resolved_zones.find(entry => entry.id === zone.id);
        const resolvedText = resolvedZone?.resolved?.text_layout;
        if (typeof resolvedText?.source_text === 'string') {
          previewTexts[zone.content_ref] = resolvedText.source_text;
        }
      }

      const uploadedImages: Record<string, string> = {};
      for (const zone of normalizedTemplate.zones) {
        if (zone.type !== 'image') continue;
        const assetKey = zone.asset_ref || zone.id;
        const asset = normalizedTemplate.assets[assetKey];
        const previewUrl = asset?.gcs_path
          ? null
          : getAssetPreviewUrl(asset, manifest.assets?.[assetKey]);

        if (previewUrl) {
          uploadedImages[zone.id] = previewUrl;
        }
      }

      set({
        template: normalizedTemplate,
        selectedZoneId: null,
        interactionMode: 'idle',
        editingTextZoneId: null,
        pendingFiles: {},
        uploadedImages,
        previewTexts,
        activeManifest: manifest,
        sourceVideoAspectRatio: null,
        reRenderState: { loading: false, resultUrl: null, error: null },
        aiCopySessions: {},
        lockedZoneIds: splitTemplate.lockedZoneIds,
        history: [{ template: cloneTemplate(normalizedTemplate) }],
        historyIndex: 0,
      });
    },

    setPreviewText: (contentRef, text) => {
      set(s => ({
        previewTexts: { ...s.previewTexts, [contentRef]: text },
      }));
    },

    setZoneClipTiming: (zoneId, start, end) => {
      set(s => {
        if (!s.activeManifest) return {};

        const zone = s.template.zones.find(entry => entry.id === zoneId);
        if (!zone) return {};

        const nextStart = Math.max(0, start);
        const nextEnd = Math.max(nextStart + 0.1, end);
        const rectHeight =
          typeof zone.bounds.height === 'number'
            ? zone.bounds.height
            : Number(zone.bounds.width) || 0;
        const nextResolvedZone = {
          id: zone.id,
          type: zone.type,
          rect: {
            x: Number(zone.bounds.x) || 0,
            y: Number(zone.bounds.y) || 0,
            w: Number(zone.bounds.width) || 0,
            h: rectHeight,
          },
          z: zone.z,
          time: {
            start: nextStart,
            end: nextEnd,
          },
          resolved:
            s.activeManifest.resolved_zones.find(entry => entry.id === zoneId)
              ?.resolved ?? {},
          ...(zone.role ? { role: zone.role } : {}),
        };

        const nextResolvedZones = [...s.activeManifest.resolved_zones];
        const existingIndex = nextResolvedZones.findIndex(entry => entry.id === zoneId);
        if (existingIndex >= 0) {
          nextResolvedZones[existingIndex] = {
            ...nextResolvedZones[existingIndex],
            ...nextResolvedZone,
          };
        } else {
          nextResolvedZones.push(nextResolvedZone);
        }

        return {
          activeManifest: {
            ...s.activeManifest,
            resolved_zones: nextResolvedZones,
          },
        };
      });
    },

    updateManifestRenderPayload: patch => {
      set(s => {
        if (!s.activeManifest) return {};
        return {
          activeManifest: {
            ...s.activeManifest,
            render_payload: {
              ...s.activeManifest.render_payload,
              ...patch,
            },
          },
        };
      });
    },

    setSourceVideoAspectRatio: aspectRatio => {
      set({
        sourceVideoAspectRatio:
          typeof aspectRatio === 'number' &&
          Number.isFinite(aspectRatio) &&
          aspectRatio > 0
            ? aspectRatio
            : null,
      });
    },

    repairVideoZoneBounds: (zoneId, aspectRatio = null) => {
      set(s => {
        const zone = s.template.zones.find(entry => entry.id === zoneId);
        if (!zone || zone.type !== 'video') {
          return typeof aspectRatio === 'number' &&
            Number.isFinite(aspectRatio) &&
            aspectRatio > 0
            ? { sourceVideoAspectRatio: aspectRatio }
            : {};
        }

        const normalizedBounds = normalizeVideoBounds(zone.bounds, s.template.canvas);
        const boundsChanged =
          Number(zone.bounds.x) !== normalizedBounds.x ||
          Number(zone.bounds.y) !== normalizedBounds.y ||
          Number(zone.bounds.width) !== normalizedBounds.width ||
          Number(zone.bounds.height) !== normalizedBounds.height;

        if (!boundsChanged) {
          return typeof aspectRatio === 'number' &&
            Number.isFinite(aspectRatio) &&
            aspectRatio > 0
            ? { sourceVideoAspectRatio: aspectRatio }
            : {};
        }

        return {
          sourceVideoAspectRatio:
            typeof aspectRatio === 'number' &&
            Number.isFinite(aspectRatio) &&
            aspectRatio > 0
              ? aspectRatio
              : s.sourceVideoAspectRatio,
          template: {
            ...s.template,
            zones: s.template.zones.map(entry =>
              entry.id === zoneId
                ? normalizeZone({ ...entry, bounds: normalizedBounds })
                : entry
            ),
          },
        };
      });
    },

    setReRenderLoading: loading => {
      set(s => ({
        reRenderState: { ...s.reRenderState, loading, error: null },
      }));
    },

    setReRenderResult: (url, error = null) => {
      set({
        reRenderState: { loading: false, resultUrl: url, error },
      });
    },

    updateAICopySession: (contentRef, patch) => {
      set(s => {
        const current = s.aiCopySessions[contentRef] ?? {
          options: [],
          rejected: [],
          loading: false,
          error: null,
          copyLanguage: null,
        };
        return {
          aiCopySessions: {
            ...s.aiCopySessions,
            [contentRef]: {
              ...current,
              ...patch,
            },
          },
        };
      });
    },

    clearAICopySessions: () => {
      set({ aiCopySessions: {} });
    },
  };
});
