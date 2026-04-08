import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pause, Play } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { endpoints, getMediaUrl } from '@/lib/config';
import { authFetch } from '@/services/auth';
import { useTemplateStore } from '../../store/templateStore';
import {
  clipDebugLog,
  registerClipDebugSnapshotProvider,
  useClipDebugEnabled,
} from '../../lib/clipStudioDebug';
import ZoneRenderer from '../Canvas/ZoneRenderer';
import ClipStudioTimeline from './ClipStudioTimeline';
import { getClipLayerDefinitions, getClipStageLayerDefinitions } from '../../utils/clipLayers';
import { getAssetPreviewUrl } from '../../utils/assetPreview';
import type { RenderPreviewRequest } from '../RenderPreview/RenderPreview';
import './ClipStudioWorkspace.css';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const VIEWPORT_STABLE_FRAME_COUNT = 2;
const STAGE_RECOVERY_VISIBILITY_THRESHOLD = 0.2;

type ViewportFitReason =
  | 'initial'
  | 'canvas_change'
  | 'source_change'
  | 'resize'
  | 'recovery'
  | 'manual_fit'
  | 'unknown';

type ViewportFitWaitPhase =
  | 'idle'
  | 'viewport_not_ready'
  | 'scroll_range_not_ready'
  | 'stabilizing'
  | 'target_unavailable'
  | 'applied';

interface ClipDebugRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

interface WorkspaceDebugSnapshot {
  templateId: string;
  layoutAuthority: 'exact' | 'stale_exact' | 'unavailable';
  layoutAuthorityReason: string | null;
  canvas: { width: number; height: number };
  zoneCount: number;
  interactionMode: string;
  zoom: number;
  scale: number;
  fitScale: number;
  sourceVideo: {
    url: string | null;
    loading: boolean;
    buffering: boolean;
    error: string | null;
    currentTime: number;
    duration: number;
    paused: boolean | null;
    readyState: number | null;
  };
  frame: {
    clientWidth: number;
    clientHeight: number;
  } | null;
  viewport: {
    clientWidth: number;
    clientHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    scrollLeft: number;
    scrollTop: number;
    maxLeft: number;
    maxTop: number;
  } | null;
  viewportWidthMismatch: boolean;
  plane: {
    width: number;
    height: number;
  };
  stage: {
    scaledWidth: number;
    scaledHeight: number;
    workspacePadding: number;
    visibilityRatio: number;
  };
  geometry: {
    frameRect: ClipDebugRect | null;
    viewportRect: ClipDebugRect | null;
    planeRect: ClipDebugRect | null;
    stageShellRect: ClipDebugRect | null;
    stageRect: ClipDebugRect | null;
  };
  fit: {
    pending: boolean;
    completed: boolean;
    userHasManuallyMovedViewport: boolean;
    recoveryFitUsed: boolean;
    lastRequestedReason: ViewportFitReason;
    lastWaitPhase: ViewportFitWaitPhase;
    lastStableFrameCount: number;
    lastFittedViewportSize: { width: number; height: number };
    lastTargetScroll: { left: number; top: number } | null;
    lastAppliedScroll:
      | {
          requestedLeft: number;
          requestedTop: number;
          appliedLeft: number;
          appliedTop: number;
          maxLeft: number;
          maxTop: number;
          clamped: boolean;
          reason: string;
        }
      | null;
  };
  renderPreviewRequest: RenderPreviewRequest | null;
}

interface CenteredViewportScrollInput {
  viewportWidth: number;
  viewportHeight: number;
  workspacePadding: number;
  scaledWidth: number;
  scaledHeight: number;
}

function getVisibleViewportSize(
  frame: HTMLDivElement | null,
  viewport: HTMLDivElement | null
): { width: number; height: number } {
  return {
    width: frame?.clientWidth ?? viewport?.clientWidth ?? 0,
    height: frame?.clientHeight ?? viewport?.clientHeight ?? 0,
  };
}

function getViewportScrollRange(
  viewport: HTMLDivElement,
  visibleViewport: { width: number; height: number } = {
    width: viewport.clientWidth,
    height: viewport.clientHeight,
  }
): { maxLeft: number; maxTop: number } {
  return {
    maxLeft: Math.max(0, viewport.scrollWidth - visibleViewport.width),
    maxTop: Math.max(0, viewport.scrollHeight - visibleViewport.height),
  };
}

export function getCenteredViewportScroll({
  viewportWidth,
  viewportHeight,
  workspacePadding,
  scaledWidth,
  scaledHeight,
}: CenteredViewportScrollInput): { left: number; top: number } | null {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    scaledWidth <= 0 ||
    scaledHeight <= 0
  ) {
    return null;
  }

  return {
    left: Math.max(0, workspacePadding + scaledWidth / 2 - viewportWidth / 2),
    top: Math.max(0, workspacePadding + scaledHeight / 2 - viewportHeight / 2),
  };
}

interface StageVisibilityInput {
  viewportWidth: number;
  viewportHeight: number;
  scrollLeft: number;
  scrollTop: number;
  workspacePadding: number;
  scaledWidth: number;
  scaledHeight: number;
}

export function getStageVisibilityRatio({
  viewportWidth,
  viewportHeight,
  scrollLeft,
  scrollTop,
  workspacePadding,
  scaledWidth,
  scaledHeight,
}: StageVisibilityInput): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    scaledWidth <= 0 ||
    scaledHeight <= 0
  ) {
    return 0;
  }

  const stageLeft = workspacePadding;
  const stageTop = workspacePadding;
  const stageRight = stageLeft + scaledWidth;
  const stageBottom = stageTop + scaledHeight;
  const viewportRight = scrollLeft + viewportWidth;
  const viewportBottom = scrollTop + viewportHeight;

  const intersectionWidth = Math.max(
    0,
    Math.min(stageRight, viewportRight) - Math.max(stageLeft, scrollLeft)
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(stageBottom, viewportBottom) - Math.max(stageTop, scrollTop)
  );
  const visibleArea = intersectionWidth * intersectionHeight;
  const totalStageArea = scaledWidth * scaledHeight;

  if (totalStageArea <= 0) {
    return 0;
  }

  return visibleArea / totalStageArea;
}

function serializeRect(rect: DOMRect | null | undefined): ClipDebugRect | null {
  if (!rect) {
    return null;
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function getRectVisibilityRatio(
  viewportRect: ClipDebugRect | null,
  stageRect: ClipDebugRect | null
): number {
  if (!viewportRect || !stageRect || stageRect.width <= 0 || stageRect.height <= 0) {
    return 0;
  }

  const intersectionWidth = Math.max(
    0,
    Math.min(viewportRect.right, stageRect.right) -
      Math.max(viewportRect.left, stageRect.left)
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(viewportRect.bottom, stageRect.bottom) -
      Math.max(viewportRect.top, stageRect.top)
  );
  const visibleArea = intersectionWidth * intersectionHeight;
  const totalArea = stageRect.width * stageRect.height;
  if (totalArea <= 0) return 0;
  return visibleArea / totalArea;
}

interface TimeWindow {
  start: number;
  end: number;
}

function coerceTimeWindow(value: unknown, fallbackEnd: number): TimeWindow {
  const raw = value as { start?: unknown; end?: unknown } | null | undefined;
  const start =
    typeof raw?.start === 'number' && Number.isFinite(raw.start) ? raw.start : 0;
  const fallbackWindowEnd = Math.max(fallbackEnd, start);
  const end =
    typeof raw?.end === 'number' && Number.isFinite(raw.end) && raw.end > start
      ? raw.end
      : fallbackWindowEnd;
  return {
    start,
    end,
  };
}

function clampPlayheadToWindow(playheadTime: number, window: TimeWindow): number {
  return clamp(playheadTime, window.start, Math.max(window.end, window.start));
}

function timeWindowEquals(left: TimeWindow, right: TimeWindow): boolean {
  return Math.abs(left.start - right.start) < 0.001 && Math.abs(left.end - right.end) < 0.001;
}

function cropAnchorToObjectPosition(anchor: unknown): string {
  switch (anchor) {
    case 'top':
      return 'center top';
    case 'bottom':
      return 'center bottom';
    default:
      return 'center center';
  }
}

function normalizeCropFocus(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null;
  const focus = value as Record<string, unknown>;
  const x = typeof focus.x === 'number' && Number.isFinite(focus.x) ? focus.x : 0.5;
  const y = typeof focus.y === 'number' && Number.isFinite(focus.y) ? focus.y : 0.5;
  return {
    x: Math.min(Math.max(x, 0), 1),
    y: Math.min(Math.max(y, 0), 1),
  };
}

function readDimension(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface ClipStudioWorkspaceProps {
  renderPreviewRequest?: RenderPreviewRequest | null;
  layoutAuthority?: 'exact' | 'stale_exact' | 'unavailable';
  layoutAuthorityReason?: string | null;
}

export default function ClipStudioWorkspace({
  renderPreviewRequest = null,
  layoutAuthority = 'exact',
  layoutAuthorityReason = null,
}: ClipStudioWorkspaceProps) {
  const {
    template,
    activeManifest,
    interactionMode,
    selectZone,
    zoom,
    setZoom,
    updateManifestRenderPayload,
    setUploadedImage,
    sourceVideoAspectRatio,
    setSourceVideoAspectRatio,
  } = useTemplateStore();
  const { canvas, zones } = template;
  const viewportFrameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const previousScaleRef = useRef(1);
  const needsInitialFitRef = useRef(true);
  const hasCompletedInitialFitRef = useRef(false);
  const userHasManuallyMovedViewportRef = useRef(false);
  const recoveryFitUsedRef = useRef(false);
  const lastFittedViewportSizeRef = useRef({ width: 0, height: 0 });
  const programmaticScrollRef = useRef(false);
  const programmaticScrollResetRef = useRef<number | null>(null);
  const previousViewportScrollRef = useRef({ left: 0, top: 0 });
  const hasHydratedSourceRef = useRef(false);
  const previousSourceIdentityRef = useRef<string | null>(null);
  const panSessionRef = useRef<{
    pointerId: number;
    mode: 'space' | 'background';
    originX: number;
    originY: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  } | null>(null);
  const suppressViewportClickRef = useRef(false);
  const zoomAnchorRef = useRef<{
    canvasX: number;
    canvasY: number;
    viewportX: number;
    viewportY: number;
  } | null>(null);
  const lastRequestedFitReasonRef = useRef<ViewportFitReason>('initial');
  const lastFitWaitPhaseRef = useRef<ViewportFitWaitPhase>('idle');
  const lastFitStableFrameCountRef = useRef(0);
  const lastTargetScrollRef = useRef<{ left: number; top: number } | null>(null);
  const lastAppliedScrollRef = useRef<WorkspaceDebugSnapshot['fit']['lastAppliedScroll']>(
    null
  );
  const fitAttemptCounterRef = useRef(0);

  const [sourceDuration, setSourceDuration] = useState(0);
  const [sourceMediaTime, setSourceMediaTime] = useState(0);
  const [editorPlayheadTime, setEditorPlayheadTime] = useState(0);
  const [draftTrimWindow, setDraftTrimWindow] = useState<TimeWindow | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [sourceVideoLoading, setSourceVideoLoading] = useState(false);
  const [sourceVideoBuffering, setSourceVideoBuffering] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [assetResolving, setAssetResolving] = useState<Record<string, boolean>>({});
  const [assetFailures, setAssetFailures] = useState<Record<string, boolean>>({});
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [viewportFitNonce, setViewportFitNonce] = useState(0);
  const [debugOverlayNonce, setDebugOverlayNonce] = useState(0);
  const debugEnabled = useClipDebugEnabled();
  const exactLayoutUnavailable = layoutAuthority === 'unavailable';

  const sourceVideoUrl = useMemo(() => {
    const rawUrl =
      typeof activeManifest?.render_payload?.source_video_url === 'string'
        ? activeManifest.render_payload.source_video_url
        : null;
    return rawUrl ? getMediaUrl(rawUrl) : null;
  }, [activeManifest?.render_payload?.source_video_url]);

  const committedTrimWindow = useMemo(
    () => coerceTimeWindow(activeManifest?.render_payload?.time_window, sourceDuration || 0),
    [activeManifest?.render_payload?.time_window, sourceDuration]
  );
  const activeTrimWindow = draftTrimWindow ?? committedTrimWindow;
  const clipDuration = Math.max(0, activeTrimWindow.end - activeTrimWindow.start);
  const clipCurrentTime = clamp(
    editorPlayheadTime - activeTrimWindow.start,
    0,
    clipDuration || Math.max(0, sourceDuration - activeTrimWindow.start)
  );

  const fitScale = useMemo(() => {
    const maxStageWidth = 920;
    const maxStageHeight = 620;
    return Math.min(1, maxStageWidth / canvas.width, maxStageHeight / canvas.height);
  }, [canvas.height, canvas.width]);

  const scale = fitScale * zoom;
  const scaledWidth = canvas.width * scale;
  const scaledHeight = canvas.height * scale;
  const workspacePadding = useMemo(
    () => Math.max(1400, Math.round(Math.max(canvas.width, canvas.height) * 1.5)),
    [canvas.height, canvas.width]
  );
  const planeWidth = scaledWidth + workspacePadding * 2;
  const planeHeight = scaledHeight + workspacePadding * 2;

  const orderedZones = useMemo(
    () => [...zones].sort((left, right) => left.z - right.z),
    [zones]
  );

  const clipLayers = useMemo(
    () =>
      getClipLayerDefinitions(
        orderedZones,
        activeManifest,
        clipDuration || Math.max(0, sourceDuration - activeTrimWindow.start)
      ),
    [
      orderedZones,
      activeManifest,
      clipDuration,
      sourceDuration,
      activeTrimWindow.start,
    ]
  );

  const stageLayers = useMemo(
    () => getClipStageLayerDefinitions(clipLayers, template.styles),
    [clipLayers, template.styles]
  );

  const sourceLayer = useMemo(
    () => orderedZones.find(zone => zone.type === 'video') ?? null,
    [orderedZones]
  );

  const sourceLayerRect = useMemo(() => {
    if (!sourceLayer) return null;
    const width = readDimension(sourceLayer.bounds.width, canvas.width) * scale;
    const heightFallback = sourceVideoAspectRatio
      ? width / sourceVideoAspectRatio
      : canvas.height * scale;
    const height = readDimension(sourceLayer.bounds.height, heightFallback) * scale;
    return {
      left: readDimension(sourceLayer.bounds.x, 0) * scale,
      top: readDimension(sourceLayer.bounds.y, 0) * scale,
      width,
      height,
    };
  }, [
    canvas.height,
    canvas.width,
    scale,
    sourceLayer,
    sourceVideoAspectRatio,
  ]);

  const sourceLayerObjectPosition = useMemo(() => {
    const cropFocus = normalizeCropFocus(sourceLayer?.media?.crop_focus);
    if (cropFocus) {
      return `${Math.round(cropFocus.x * 100)}% ${Math.round(cropFocus.y * 100)}%`;
    }
    return cropAnchorToObjectPosition(sourceLayer?.media?.crop_anchor);
  }, [sourceLayer?.media?.crop_anchor, sourceLayer?.media?.crop_focus]);

  const sourceLayerObjectFit = sourceLayer?.media?.fit ?? 'cover';

  const refreshDebugOverlay = useCallback(() => {
    if (!debugEnabled) return;
    setDebugOverlayNonce(value => value + 1);
  }, [debugEnabled]);

  const buildWorkspaceDebugSnapshot = useCallback((): WorkspaceDebugSnapshot => {
    const frame = viewportFrameRef.current;
    const viewport = viewportRef.current;
    const plane = planeRef.current;
    const stageShell = stageShellRef.current;
    const stage = stageRef.current;
    const sourceVideo = sourceVideoRef.current;
    const visibleViewport = getVisibleViewportSize(frame, viewport);
    const frameRect =
      serializeRect(frame?.getBoundingClientRect()) ||
      serializeRect(viewport?.getBoundingClientRect());
    const viewportRect = viewport ? serializeRect(viewport.getBoundingClientRect()) : null;
    const planeRect = plane ? serializeRect(plane.getBoundingClientRect()) : null;
    const stageShellRect = stageShell
      ? serializeRect(stageShell.getBoundingClientRect())
      : null;
    const stageRect = stage ? serializeRect(stage.getBoundingClientRect()) : null;
    const scrollRange = viewport
      ? getViewportScrollRange(viewport, visibleViewport)
      : { maxLeft: 0, maxTop: 0 };

    return {
      templateId: template.id,
      layoutAuthority,
      layoutAuthorityReason,
      canvas: {
        width: canvas.width,
        height: canvas.height,
      },
      zoneCount: zones.length,
      interactionMode,
      zoom,
      scale,
      fitScale,
      sourceVideo: {
        url: sourceVideoUrl,
        loading: sourceVideoLoading,
        buffering: sourceVideoBuffering,
        error: videoError,
        currentTime: sourceVideo?.currentTime ?? sourceMediaTime,
        duration: sourceVideo?.duration ?? sourceDuration,
        paused: sourceVideo ? sourceVideo.paused : null,
        readyState: sourceVideo ? sourceVideo.readyState : null,
      },
      frame:
        visibleViewport.width > 0 || visibleViewport.height > 0
          ? {
              clientWidth: visibleViewport.width,
              clientHeight: visibleViewport.height,
            }
          : null,
      viewport: viewport
        ? {
            clientWidth: viewport.clientWidth,
            clientHeight: viewport.clientHeight,
            scrollWidth: viewport.scrollWidth,
            scrollHeight: viewport.scrollHeight,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            maxLeft: scrollRange.maxLeft,
            maxTop: scrollRange.maxTop,
          }
        : null,
      viewportWidthMismatch: Boolean(
        viewport &&
          (Math.abs(viewport.clientWidth - visibleViewport.width) > 1 ||
            Math.abs(viewport.clientHeight - visibleViewport.height) > 1)
      ),
      plane: {
        width: planeWidth,
        height: planeHeight,
      },
      stage: {
        scaledWidth,
        scaledHeight,
        workspacePadding,
        visibilityRatio:
          getRectVisibilityRatio(frameRect, stageRect) ||
          (viewport
            ? getStageVisibilityRatio({
                viewportWidth: visibleViewport.width,
                viewportHeight: visibleViewport.height,
                scrollLeft: viewport.scrollLeft,
                scrollTop: viewport.scrollTop,
                workspacePadding,
                scaledWidth,
                scaledHeight,
              })
            : 0),
      },
      geometry: {
        frameRect,
        viewportRect,
        planeRect,
        stageShellRect,
        stageRect,
      },
      fit: {
        pending: needsInitialFitRef.current,
        completed: hasCompletedInitialFitRef.current,
        userHasManuallyMovedViewport: userHasManuallyMovedViewportRef.current,
        recoveryFitUsed: recoveryFitUsedRef.current,
        lastRequestedReason: lastRequestedFitReasonRef.current,
        lastWaitPhase: lastFitWaitPhaseRef.current,
        lastStableFrameCount: lastFitStableFrameCountRef.current,
        lastFittedViewportSize: lastFittedViewportSizeRef.current,
        lastTargetScroll: lastTargetScrollRef.current,
        lastAppliedScroll: lastAppliedScrollRef.current,
      },
      renderPreviewRequest,
    };
  }, [
    canvas.height,
    canvas.width,
    fitScale,
    interactionMode,
    planeHeight,
    planeWidth,
    renderPreviewRequest,
    scale,
    scaledHeight,
    scaledWidth,
    sourceDuration,
    sourceMediaTime,
    sourceVideoBuffering,
    sourceVideoLoading,
    sourceVideoUrl,
    template.id,
    layoutAuthority,
    layoutAuthorityReason,
    videoError,
    workspacePadding,
    zoom,
    zones.length,
  ]);

  const workspaceDebugSnapshot = useMemo(
    () => buildWorkspaceDebugSnapshot(),
    [buildWorkspaceDebugSnapshot, debugOverlayNonce]
  );

  const applyViewportScroll = useCallback((left: number, top: number, reason = 'unknown') => {
    const frame = viewportFrameRef.current;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { maxLeft, maxTop } = getViewportScrollRange(
      viewport,
      getVisibleViewportSize(frame, viewport)
    );
    const nextLeft = clamp(left, 0, maxLeft);
    const nextTop = clamp(top, 0, maxTop);

    programmaticScrollRef.current = true;
    viewport.scrollLeft = nextLeft;
    viewport.scrollTop = nextTop;
    previousViewportScrollRef.current = { left: nextLeft, top: nextTop };
    lastAppliedScrollRef.current = {
      requestedLeft: left,
      requestedTop: top,
      appliedLeft: nextLeft,
      appliedTop: nextTop,
      maxLeft,
      maxTop,
      clamped: Math.abs(left - nextLeft) > 0.5 || Math.abs(top - nextTop) > 0.5,
      reason,
    };
    clipDebugLog('workspace:scroll:apply', lastAppliedScrollRef.current);
    refreshDebugOverlay();

    if (programmaticScrollResetRef.current !== null) {
      cancelAnimationFrame(programmaticScrollResetRef.current);
    }

    programmaticScrollResetRef.current = requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
      programmaticScrollResetRef.current = null;
      if (!viewportRef.current) return;
      previousViewportScrollRef.current = {
        left: viewportRef.current.scrollLeft,
        top: viewportRef.current.scrollTop,
      };
      refreshDebugOverlay();
    });
  }, [refreshDebugOverlay]);

  const requestViewportFit = useCallback(
    ({
      resetManualState = false,
      allowRecovery = false,
      reason = 'unknown',
    }: {
      resetManualState?: boolean;
      allowRecovery?: boolean;
      reason?: ViewportFitReason;
    } = {}) => {
      needsInitialFitRef.current = true;
      hasCompletedInitialFitRef.current = false;
      lastRequestedFitReasonRef.current = reason;
      lastFitWaitPhaseRef.current = 'idle';
      lastFitStableFrameCountRef.current = 0;
      if (resetManualState) {
        userHasManuallyMovedViewportRef.current = false;
      }
      if (allowRecovery) {
        recoveryFitUsedRef.current = false;
      }
      const viewport = viewportRef.current;
      clipDebugLog('workspace:fit:request', {
        reason,
        resetManualState,
        allowRecovery,
        viewport: viewport
          ? {
              clientWidth: viewport.clientWidth,
              clientHeight: viewport.clientHeight,
              scrollWidth: viewport.scrollWidth,
              scrollHeight: viewport.scrollHeight,
              scrollLeft: viewport.scrollLeft,
              scrollTop: viewport.scrollTop,
            }
          : null,
      });
      refreshDebugOverlay();
      setViewportFitNonce(value => value + 1);
    },
    [refreshDebugOverlay]
  );

  const seekToTime = useCallback(
    (nextTime: number) => {
      const targetTime = clamp(nextTime, 0, sourceDuration || nextTime);
      const element = sourceVideoRef.current;
      if (element && Math.abs(element.currentTime - targetTime) > 0.05) {
        try {
          element.currentTime = targetTime;
        } catch {
          // Ignore seek failures during early metadata load.
        }
      }
      setSourceMediaTime(targetTime);
      setEditorPlayheadTime(targetTime);
    },
    [sourceDuration]
  );

  useEffect(() => {
    const sourceIdentity = sourceVideoUrl || '';
    const sourceChanged = previousSourceIdentityRef.current !== sourceIdentity;
    if (hasHydratedSourceRef.current && !sourceChanged) {
      return;
    }

    hasHydratedSourceRef.current = true;
    previousSourceIdentityRef.current = sourceIdentity;
    setDraftTrimWindow(null);
    setIsPlaying(false);
    setSourceMediaTime(committedTrimWindow.start);
    setEditorPlayheadTime(committedTrimWindow.start);
    setVideoError(null);
    setSourceVideoLoading(Boolean(sourceVideoUrl));
    setSourceVideoBuffering(false);
    setTimelineCollapsed(!sourceVideoUrl);
    clipDebugLog('workspace:source:hydrate', {
      sourceVideoUrl,
      sourceChanged,
      committedTrimWindow,
    });
    refreshDebugOverlay();
    requestViewportFit({
      resetManualState: true,
      allowRecovery: true,
      reason: sourceChanged ? 'source_change' : 'initial',
    });
  }, [committedTrimWindow.start, requestViewportFit, sourceVideoUrl]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      const tag = element?.tagName?.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        Boolean(element?.isContentEditable)
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (interactionMode === 'editing_text' || isEditableTarget(event.target)) return;
      event.preventDefault();
      if (!event.repeat) {
        setSpacePanActive(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      setSpacePanActive(false);
    };

    const resetPanMode = () => {
      setSpacePanActive(false);
      setIsPanning(false);
      panSessionRef.current = null;
      suppressViewportClickRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', resetPanMode);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', resetPanMode);
    };
  }, [interactionMode]);

  useEffect(() => {
    requestViewportFit({
      resetManualState: true,
      allowRecovery: true,
      reason: 'canvas_change',
    });
  }, [canvas.height, canvas.width, requestViewportFit]);

  useEffect(() => {
    if (!activeManifest) return;

    let cancelled = false;
    const manifest = activeManifest;
    const imageZones = zones.filter(zone => zone.type === 'image');

    async function fetchProtectedPreview(url: string): Promise<string | null> {
      try {
        const response = await authFetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.size) return null;
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    }

    setAssetResolving(() => Object.fromEntries(imageZones.map(zone => [zone.id, true])));
    setAssetFailures(() => Object.fromEntries(imageZones.map(zone => [zone.id, false])));

    async function hydrateProtectedAssets() {
      await Promise.all(
        imageZones.map(async zone => {
          const assetKey = zone.asset_ref || zone.id;
          const templateAsset = template.assets[assetKey];
          const manifestAssetUrl = manifest.assets?.[assetKey];
          const clipAssetUrl = renderPreviewRequest
            ? getMediaUrl(
                endpoints.jobs.clipAsset(
                  renderPreviewRequest.jobId,
                  renderPreviewRequest.clipIndex,
                  assetKey
                )
              )
            : null;
          const directPreviewUrl = getAssetPreviewUrl(templateAsset, manifestAssetUrl);
          try {
            if (directPreviewUrl) {
              if (!cancelled) {
                setUploadedImage(zone.id, directPreviewUrl);
                setAssetFailures(previous => ({ ...previous, [zone.id]: false }));
              }
              return;
            }

            const protectedCandidates = clipAssetUrl ? [clipAssetUrl] : [];

            for (const candidate of protectedCandidates) {
              const resolvedUrl = await fetchProtectedPreview(candidate);
              if (!resolvedUrl) continue;

              if (cancelled) {
                if (resolvedUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(resolvedUrl);
                }
                return;
              }

              setUploadedImage(zone.id, resolvedUrl);
              setAssetFailures(previous => ({ ...previous, [zone.id]: false }));
              return;
            }
            setAssetFailures(previous => ({ ...previous, [zone.id]: true }));
          } finally {
            if (!cancelled) {
              setAssetResolving(previous => ({ ...previous, [zone.id]: false }));
            }
          }
        })
      );
    }

    void hydrateProtectedAssets();

    return () => {
      cancelled = true;
    };
  }, [
    activeManifest,
    renderPreviewRequest,
    setUploadedImage,
    template.assets,
    template.id,
    zones,
  ]);

  useEffect(() => {
    if (draftTrimWindow) return;
    const clampedPlayheadTime = clampPlayheadToWindow(
      editorPlayheadTime,
      committedTrimWindow
    );
    if (Math.abs(clampedPlayheadTime - editorPlayheadTime) > 0.001) {
      seekToTime(clampedPlayheadTime);
    }
  }, [committedTrimWindow, draftTrimWindow, seekToTime]);

  useEffect(() => {
    const element = sourceVideoRef.current;
    if (!element) return;
    if (!sourceVideoUrl) {
      element.pause();
      setIsPlaying(false);
      return;
    }
  }, [sourceVideoUrl]);

  useEffect(() => {
    const frame = viewportFrameRef.current;
    const viewport = viewportRef.current;
    if (!viewport) {
      previousScaleRef.current = scale;
      zoomAnchorRef.current = null;
      return;
    }

    if (needsInitialFitRef.current) {
      return;
    }

    const previousScale = previousScaleRef.current;
    if (Math.abs(previousScale - scale) < 0.0001) {
      zoomAnchorRef.current = null;
      return;
    }

    const anchor = zoomAnchorRef.current;
    const visibleViewport = getVisibleViewportSize(frame, viewport);
    if (anchor) {
      applyViewportScroll(
        Math.max(0, workspacePadding + anchor.canvasX * scale - anchor.viewportX),
        Math.max(0, workspacePadding + anchor.canvasY * scale - anchor.viewportY),
        'zoom'
      );
    } else {
      const centerCanvasX =
        (viewport.scrollLeft + visibleViewport.width / 2 - workspacePadding) /
        Math.max(previousScale, 0.001);
      const centerCanvasY =
        (viewport.scrollTop + visibleViewport.height / 2 - workspacePadding) /
        Math.max(previousScale, 0.001);

      applyViewportScroll(
        Math.max(0, workspacePadding + centerCanvasX * scale - visibleViewport.width / 2),
        Math.max(0, workspacePadding + centerCanvasY * scale - visibleViewport.height / 2),
        'zoom'
      );
    }

    previousScaleRef.current = scale;
    zoomAnchorRef.current = null;
  }, [applyViewportScroll, scale, workspacePadding]);

  useEffect(() => {
    const frame = viewportFrameRef.current;
    const viewport = viewportRef.current;
    if (!viewport || !frame || !needsInitialFitRef.current) {
      return;
    }

    let frameId = 0;
    let cancelled = false;
    let lastMeasuredWidth = -1;
    let lastMeasuredHeight = -1;
    let lastMeasuredScrollWidth = -1;
    let lastMeasuredScrollHeight = -1;
    let stableFrameCount = 0;
    let lastWaitLogSignature = '';
    const attempt = fitAttemptCounterRef.current + 1;
    fitAttemptCounterRef.current = attempt;
    const fitReason = lastRequestedFitReasonRef.current;
    const emitFitWait = (phase: ViewportFitWaitPhase, payload: Record<string, unknown>) => {
      lastFitWaitPhaseRef.current = phase;
      lastFitStableFrameCountRef.current = stableFrameCount;
      const eventPayload = {
        attempt,
        reason: fitReason,
        phase,
        ...payload,
      };
      const signature = JSON.stringify(eventPayload);
      if (lastWaitLogSignature !== signature) {
        lastWaitLogSignature = signature;
        clipDebugLog('workspace:fit:wait', eventPayload);
        refreshDebugOverlay();
        return;
      }
      if (debugEnabled) {
        refreshDebugOverlay();
      }
    };

    const emitFitApply = (payload: Record<string, unknown>) => {
      lastWaitLogSignature = '';
      clipDebugLog('workspace:fit:apply', {
        attempt,
        reason: fitReason,
        ...payload,
      });
    };

    clipDebugLog('workspace:fit:start', {
      attempt,
      reason: fitReason,
      viewportSize,
      plane: { width: planeWidth, height: planeHeight },
      stage: { width: scaledWidth, height: scaledHeight },
    });
    refreshDebugOverlay();

    const fitWhenStable = () => {
      if (cancelled) return;

      const visibleViewport = getVisibleViewportSize(frame, viewport);
      const currentWidth = visibleViewport.width;
      const currentHeight = visibleViewport.height;
      const currentScrollWidth = viewport.scrollWidth;
      const currentScrollHeight = viewport.scrollHeight;
      const scrollRange = getViewportScrollRange(viewport, visibleViewport);
      const targetScroll = getCenteredViewportScroll({
        viewportWidth: currentWidth,
        viewportHeight: currentHeight,
        workspacePadding,
        scaledWidth,
        scaledHeight,
      });

      if (currentWidth <= 0 || currentHeight <= 0 || scaledWidth <= 0 || scaledHeight <= 0) {
        emitFitWait('viewport_not_ready', {
          stableFrameCount,
          viewport: {
            width: currentWidth,
            height: currentHeight,
          },
          stage: {
            width: scaledWidth,
            height: scaledHeight,
          },
        });
        frameId = requestAnimationFrame(fitWhenStable);
        return;
      }

      if (!targetScroll) {
        emitFitWait('target_unavailable', {
          stableFrameCount,
          viewport: {
            width: currentWidth,
            height: currentHeight,
          },
          target: null,
        });
        frameId = requestAnimationFrame(fitWhenStable);
        return;
      }

      const horizontalReady = targetScroll.left <= 0.5 || scrollRange.maxLeft > 0.5;
      const verticalReady = targetScroll.top <= 0.5 || scrollRange.maxTop > 0.5;
      if (!horizontalReady || !verticalReady) {
        stableFrameCount = 0;
        emitFitWait('scroll_range_not_ready', {
          stableFrameCount,
          viewport: {
            width: currentWidth,
            height: currentHeight,
          },
          scroll: {
            width: currentScrollWidth,
            height: currentScrollHeight,
            range: scrollRange,
          },
          target: targetScroll,
          readiness: {
            horizontalReady,
            verticalReady,
          },
        });
        frameId = requestAnimationFrame(fitWhenStable);
        return;
      }

      if (
        currentWidth === lastMeasuredWidth &&
        currentHeight === lastMeasuredHeight &&
        currentScrollWidth === lastMeasuredScrollWidth &&
        currentScrollHeight === lastMeasuredScrollHeight
      ) {
        stableFrameCount += 1;
      } else {
        lastMeasuredWidth = currentWidth;
        lastMeasuredHeight = currentHeight;
        lastMeasuredScrollWidth = currentScrollWidth;
        lastMeasuredScrollHeight = currentScrollHeight;
        stableFrameCount = 1;
      }

      if (stableFrameCount < VIEWPORT_STABLE_FRAME_COUNT) {
        emitFitWait('stabilizing', {
          stableFrameCount,
          viewport: {
            width: currentWidth,
            height: currentHeight,
          },
          scroll: {
            width: currentScrollWidth,
            height: currentScrollHeight,
            range: scrollRange,
          },
        });
        frameId = requestAnimationFrame(fitWhenStable);
        return;
      }

      lastFitWaitPhaseRef.current = 'applied';
      lastFitStableFrameCountRef.current = stableFrameCount;
      lastTargetScrollRef.current = targetScroll;
      applyViewportScroll(targetScroll.left, targetScroll.top, fitReason);
      needsInitialFitRef.current = false;
      hasCompletedInitialFitRef.current = true;
      lastFittedViewportSizeRef.current = {
        width: currentWidth,
        height: currentHeight,
      };
      previousScaleRef.current = scale;
      zoomAnchorRef.current = null;
      const geometry = buildWorkspaceDebugSnapshot();
      emitFitApply({
        stableFrameCount,
        targetScroll,
        appliedScroll: lastAppliedScrollRef.current,
        viewport: geometry.viewport,
        plane: geometry.plane,
        stage: geometry.stage,
        geometry: geometry.geometry,
      });
      refreshDebugOverlay();
    };

    frameId = requestAnimationFrame(fitWhenStable);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [
    applyViewportScroll,
    scale,
    scaledHeight,
    scaledWidth,
    viewportFitNonce,
    viewportSize.height,
    viewportSize.width,
    workspacePadding,
    debugEnabled,
  ]);

  useEffect(() => {
    const frame = viewportFrameRef.current;
    const viewport = viewportRef.current;
    if (!viewport || !frame || typeof ResizeObserver === 'undefined') return;

    const syncViewportSize = () => {
      const visibleViewport = getVisibleViewportSize(frame, viewport);
      const scrollRange = getViewportScrollRange(viewport, visibleViewport);
      setViewportSize({
        width: visibleViewport.width,
        height: visibleViewport.height,
      });
      clipDebugLog('workspace:viewport:resize', {
        frame: {
          clientWidth: visibleViewport.width,
          clientHeight: visibleViewport.height,
        },
        viewport: {
          clientWidth: viewport.clientWidth,
          clientHeight: viewport.clientHeight,
          scrollWidth: viewport.scrollWidth,
          scrollHeight: viewport.scrollHeight,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        },
        scrollRange,
        viewportWidthMismatch:
          Math.abs(viewport.clientWidth - visibleViewport.width) > 1 ||
          Math.abs(viewport.clientHeight - visibleViewport.height) > 1,
      });
      refreshDebugOverlay();
    };

    syncViewportSize();
    const observer = new ResizeObserver(() => {
      syncViewportSize();
    });
    observer.observe(frame);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    previousViewportScrollRef.current = {
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };

    const handleScroll = () => {
      const nextLeft = viewport.scrollLeft;
      const nextTop = viewport.scrollTop;
      const previousScroll = previousViewportScrollRef.current;
      previousViewportScrollRef.current = { left: nextLeft, top: nextTop };

      if (programmaticScrollRef.current) {
        clipDebugLog('workspace:viewport:scroll', {
          scrollLeft: nextLeft,
          scrollTop: nextTop,
          programmatic: true,
          userHasManuallyMovedViewport: userHasManuallyMovedViewportRef.current,
        });
        refreshDebugOverlay();
        return;
      }

      const moved =
        Math.abs(nextLeft - previousScroll.left) > 1 ||
        Math.abs(nextTop - previousScroll.top) > 1;
      if (!moved || !hasCompletedInitialFitRef.current) {
        clipDebugLog('workspace:viewport:scroll', {
          scrollLeft: nextLeft,
          scrollTop: nextTop,
          programmatic: false,
          moved,
          fitCompleted: hasCompletedInitialFitRef.current,
          userHasManuallyMovedViewport: userHasManuallyMovedViewportRef.current,
        });
        refreshDebugOverlay();
        return;
      }

      userHasManuallyMovedViewportRef.current = true;
      clipDebugLog('workspace:viewport:scroll', {
        scrollLeft: nextLeft,
        scrollTop: nextTop,
        programmatic: false,
        moved: true,
        fitCompleted: true,
        userHasManuallyMovedViewport: true,
      });
      refreshDebugOverlay();
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (
      viewportSize.width <= 0 ||
      viewportSize.height <= 0 ||
      !hasCompletedInitialFitRef.current ||
      userHasManuallyMovedViewportRef.current
    ) {
      return;
    }

    const lastFittedSize = lastFittedViewportSizeRef.current;
    if (
      lastFittedSize.width === viewportSize.width &&
      lastFittedSize.height === viewportSize.height
    ) {
      return;
    }

    clipDebugLog('workspace:fit:resize-trigger', {
      previousViewportSize: lastFittedSize,
      nextViewportSize: viewportSize,
    });
    requestViewportFit({ reason: 'resize' });
  }, [requestViewportFit, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    const frame = viewportFrameRef.current;
    const viewport = viewportRef.current;
    if (
      !viewport ||
      !frame ||
      needsInitialFitRef.current ||
      !hasCompletedInitialFitRef.current ||
      userHasManuallyMovedViewportRef.current ||
      recoveryFitUsedRef.current
    ) {
      return;
    }

    const visibleViewport = getVisibleViewportSize(frame, viewport);
    const visibleRatio = getStageVisibilityRatio({
      viewportWidth: visibleViewport.width,
      viewportHeight: visibleViewport.height,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      workspacePadding,
      scaledWidth,
      scaledHeight,
    });

    clipDebugLog('workspace:fit:recovery-check', {
      visibleRatio,
      threshold: STAGE_RECOVERY_VISIBILITY_THRESHOLD,
      userHasManuallyMovedViewport: userHasManuallyMovedViewportRef.current,
      recoveryFitUsed: recoveryFitUsedRef.current,
    });
    refreshDebugOverlay();

    if (visibleRatio >= STAGE_RECOVERY_VISIBILITY_THRESHOLD) {
      return;
    }

    recoveryFitUsedRef.current = true;
    requestViewportFit({ reason: 'recovery' });
  }, [
    requestViewportFit,
    scale,
    scaledHeight,
    scaledWidth,
    viewportFitNonce,
    viewportSize.height,
    viewportSize.width,
    workspacePadding,
  ]);

  useEffect(() => {
    clipDebugLog('workspace:mount', {
      templateId: template.id,
      canvas,
      renderPreviewRequest,
    });
    refreshDebugOverlay();

    return () => {
      clipDebugLog('workspace:unmount', {
        templateId: template.id,
      });
    };
  }, [canvas, refreshDebugOverlay, renderPreviewRequest, template.id]);

  useEffect(() => {
    return registerClipDebugSnapshotProvider('workspace', () =>
      buildWorkspaceDebugSnapshot()
    );
  }, [buildWorkspaceDebugSnapshot]);

  useEffect(() => {
    return () => {
      if (programmaticScrollResetRef.current !== null) {
        cancelAnimationFrame(programmaticScrollResetRef.current);
      }
    };
  }, []);

  const handleLoadedMetadata = () => {
    const element = sourceVideoRef.current;
    const nextDuration = element?.duration;
    if (!Number.isFinite(nextDuration) || !nextDuration) return;

    if (element && element.videoWidth > 0 && element.videoHeight > 0) {
      const nextAspectRatio = element.videoWidth / element.videoHeight;
      setSourceVideoAspectRatio(nextAspectRatio);
    }

    setSourceDuration(nextDuration);
    clipDebugLog('workspace:source:loaded-metadata', {
      duration: nextDuration,
      videoWidth: element?.videoWidth ?? null,
      videoHeight: element?.videoHeight ?? null,
      sourceVideoUrl,
    });
    refreshDebugOverlay();
    if (
      !(typeof activeManifest?.render_payload?.time_window?.end === 'number') ||
      activeManifest.render_payload.time_window.end <= committedTrimWindow.start
    ) {
      updateManifestRenderPayload({
        time_window: {
          start: committedTrimWindow.start,
          end: nextDuration,
        },
      });
    }
  };

  const handleTimeUpdate = () => {
    const element = sourceVideoRef.current;
    if (!element) return;

    if (
      activeTrimWindow.end > activeTrimWindow.start &&
      element.currentTime >= activeTrimWindow.end
    ) {
      element.pause();
      element.currentTime = activeTrimWindow.end;
      setIsPlaying(false);
      setSourceMediaTime(activeTrimWindow.end);
      setEditorPlayheadTime(activeTrimWindow.end);
      return;
    }

    setSourceMediaTime(element.currentTime);
    setEditorPlayheadTime(element.currentTime);
  };

  const handleScrub = (nextPlayheadTime: number) => {
    seekToTime(clamp(nextPlayheadTime, 0, Math.max(sourceDuration, 0)));
  };

  const handleTrimDraftChange = (nextTrimWindow: TimeWindow) => {
    setDraftTrimWindow(nextTrimWindow);
    const clampedPlayheadTime = clampPlayheadToWindow(
      editorPlayheadTime,
      nextTrimWindow
    );
    if (Math.abs(clampedPlayheadTime - editorPlayheadTime) > 0.001) {
      seekToTime(clampedPlayheadTime);
    }
  };

  const handleTrimCommit = (nextTrimWindow: TimeWindow) => {
    setDraftTrimWindow(null);
    if (!timeWindowEquals(nextTrimWindow, committedTrimWindow)) {
      updateManifestRenderPayload({
        time_window: {
          start: nextTrimWindow.start,
          end: nextTrimWindow.end,
        },
      });
    }

    const clampedPlayheadTime = clampPlayheadToWindow(
      editorPlayheadTime,
      nextTrimWindow
    );
    if (Math.abs(clampedPlayheadTime - editorPlayheadTime) > 0.001) {
      seekToTime(clampedPlayheadTime);
    }
  };

  const handleTrimCancel = () => {
    setDraftTrimWindow(null);
    const clampedPlayheadTime = clampPlayheadToWindow(
      editorPlayheadTime,
      committedTrimWindow
    );
    if (Math.abs(clampedPlayheadTime - editorPlayheadTime) > 0.001) {
      seekToTime(clampedPlayheadTime);
    }
  };

  const togglePlayback = () => {
    const element = sourceVideoRef.current;
    if (!sourceVideoUrl || !element) return;

    if (
      editorPlayheadTime < activeTrimWindow.start ||
      editorPlayheadTime >= activeTrimWindow.end
    ) {
      seekToTime(activeTrimWindow.start);
    }

    setVideoError(null);

    if (!element.paused) {
      element.pause();
      return;
    }

    setSourceVideoBuffering(true);
    void element.play().catch(error => {
      setSourceVideoBuffering(false);
      setIsPlaying(false);
      setVideoError(
        error instanceof Error ? error.message : 'Playback could not start.'
      );
    });
  };

  useEffect(() => {
    const frame = viewportFrameRef.current;
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const handleViewportWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      event.preventDefault();

      const rect = (frame ?? viewport).getBoundingClientRect();
      const viewportX = event.clientX - rect.left;
      const viewportY = event.clientY - rect.top;
      zoomAnchorRef.current = {
        canvasX:
          (viewport.scrollLeft + viewportX - workspacePadding) / Math.max(scale, 0.001),
        canvasY:
          (viewport.scrollTop + viewportY - workspacePadding) / Math.max(scale, 0.001),
        viewportX,
        viewportY,
      };

      const direction = event.deltaY < 0 ? 1 : -1;
      const nextZoom = clamp(Number((zoom + direction * 0.1).toFixed(2)), 0.25, 3);
      if (nextZoom === zoom) return;
      userHasManuallyMovedViewportRef.current = true;
      setZoom(nextZoom);
    };

    viewport.addEventListener('wheel', handleViewportWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleViewportWheel);
    };
  }, [scale, setZoom, workspacePadding, zoom]);

  const beginPanSession = (
    event: React.PointerEvent<HTMLDivElement>,
    mode: 'space' | 'background'
  ) => {
    if (event.button !== 0) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    panSessionRef.current = {
      pointerId: event.pointerId,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      moved: false,
    };

    if (mode === 'space') {
      suppressViewportClickRef.current = true;
      setIsPanning(true);
      event.preventDefault();
      event.stopPropagation();
    }

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishPanSession = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    panSessionRef.current = null;
    setIsPanning(false);

    if (session.mode === 'space' || session.moved) {
      window.setTimeout(() => {
        suppressViewportClickRef.current = false;
      }, 0);
    }
  };

  const handleViewportPointerDownCapture = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const target = event.target as HTMLElement | null;
    const hitZone = Boolean(target?.closest('.zone-renderer'));
    const hitInteractiveChrome = Boolean(
      target?.closest(
        '.clip-studio-workspace__stage-chrome, button, a, input, textarea, select, [data-clip-studio-interactive="true"]'
      )
    );

    if (spacePanActive) {
      beginPanSession(event, 'space');
      return;
    }

    if (hitInteractiveChrome) {
      return;
    }

    if (!hitZone) {
      beginPanSession(event, 'background');
    }
  };

  const handleViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    const viewport = viewportRef.current;
    if (!session || !viewport || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.originX;
    const deltaY = event.clientY - session.originY;
    const distance = Math.abs(deltaX) + Math.abs(deltaY);

    if (!session.moved && session.mode === 'background' && distance < 4) {
      return;
    }

    if (!session.moved) {
      session.moved = true;
      suppressViewportClickRef.current = true;
      setIsPanning(true);
      userHasManuallyMovedViewportRef.current = true;
      clipDebugLog('workspace:pan:latched', {
        mode: session.mode,
        pointerId: session.pointerId,
      });
      refreshDebugOverlay();
    }

    event.preventDefault();
    viewport.scrollLeft = session.scrollLeft - deltaX;
    viewport.scrollTop = session.scrollTop - deltaY;
  };

  const handleViewportClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressViewportClickRef.current) {
      suppressViewportClickRef.current = false;
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.zone-renderer')) return;

    selectZone(null);
  };

  const handleResetViewport = () => {
    setZoom(1);
    requestViewportFit({
      resetManualState: true,
      allowRecovery: true,
      reason: 'manual_fit',
    });

    if (zoom === 1 && viewportRef.current) {
      const visibleViewport = getVisibleViewportSize(
        viewportFrameRef.current,
        viewportRef.current
      );
      const targetScroll = getCenteredViewportScroll({
        viewportWidth: visibleViewport.width,
        viewportHeight: visibleViewport.height,
        workspacePadding,
        scaledWidth,
        scaledHeight,
      });
      if (targetScroll) {
        lastTargetScrollRef.current = targetScroll;
        applyViewportScroll(targetScroll.left, targetScroll.top, 'manual_fit');
        needsInitialFitRef.current = false;
        hasCompletedInitialFitRef.current = true;
        lastFittedViewportSizeRef.current = {
          width: visibleViewport.width,
          height: visibleViewport.height,
        };
        refreshDebugOverlay();
      }
    }
  };

  return (
    <div className="clip-studio-workspace">
      <div
        ref={viewportFrameRef}
        data-testid="clip-studio-viewport-frame"
        className="clip-studio-workspace__viewport-frame"
      >
      <div
        ref={viewportRef}
        data-testid="clip-studio-viewport"
        className={`clip-studio-workspace__viewport ${
          isPanning
            ? 'clip-studio-workspace__viewport--panning'
            : spacePanActive
              ? 'clip-studio-workspace__viewport--space-pan'
              : ''
        }`}
        onPointerDownCapture={handleViewportPointerDownCapture}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={finishPanSession}
        onPointerCancel={finishPanSession}
        onLostPointerCapture={() => {
          panSessionRef.current = null;
          setIsPanning(false);
          window.setTimeout(() => {
            suppressViewportClickRef.current = false;
          }, 0);
        }}
        onClick={handleViewportClick}
      >
        <div
          ref={planeRef}
          className="clip-studio-workspace__plane"
          style={{ width: planeWidth, height: planeHeight }}
        >
          <div
            ref={stageShellRef}
            className="clip-studio-workspace__stage-shell"
            style={{ left: workspacePadding, top: workspacePadding }}
          >
            <div className="clip-studio-workspace__stage-chrome">
              <div className="clip-studio-workspace__stage-label">
                <strong>
                  {canvas.width} × {canvas.height}
                </strong>
              </div>
              <div className="clip-studio-workspace__stage-tools">
                <button
                  data-testid="clip-studio-transport"
                  className="clip-studio-workspace__transport"
                  onClick={togglePlayback}
                  type="button"
                  disabled={!sourceVideoUrl}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <div className="clip-studio-workspace__zoom">
                  <button
                    type="button"
                    onClick={() => {
                      const nextZoom = clamp(Number((zoom - 0.1).toFixed(2)), 0.25, 3);
                      if (nextZoom === zoom) return;
                      userHasManuallyMovedViewportRef.current = true;
                      setZoom(nextZoom);
                    }}
                  >
                    -
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextZoom = clamp(Number((zoom + 0.1).toFixed(2)), 0.25, 3);
                      if (nextZoom === zoom) return;
                      userHasManuallyMovedViewportRef.current = true;
                      setZoom(nextZoom);
                    }}
                  >
                    +
                  </button>
                  <button type="button" onClick={handleResetViewport}>
                    Fit
                  </button>
                </div>
                <button
                  type="button"
                  className="clip-studio-workspace__trim-toggle"
                  onClick={() => setTimelineCollapsed(value => !value)}
                >
                  {timelineCollapsed ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  Trim
                </button>
              </div>
            </div>

            <div
              ref={stageRef}
              className="clip-studio-workspace__stage"
              style={{ width: scaledWidth, height: scaledHeight }}
            >
              {sourceVideoUrl && sourceLayerRect && (
                <video
                  ref={sourceVideoRef}
                  data-testid="clip-studio-source-video"
                  src={sourceVideoUrl}
                  className="clip-studio-workspace__stage-video"
                  playsInline
                  preload="metadata"
                  style={{
                    left: `${sourceLayerRect.left}px`,
                    top: `${sourceLayerRect.top}px`,
                    width: `${sourceLayerRect.width}px`,
                    height: `${sourceLayerRect.height}px`,
                    objectFit: sourceLayerObjectFit,
                    objectPosition: sourceLayerObjectPosition,
                  }}
                  onLoadedMetadata={handleLoadedMetadata}
                  onLoadedData={() => {
                    setSourceVideoLoading(false);
                    clipDebugLog('workspace:source:loaded-data', {
                      sourceVideoUrl,
                    });
                    refreshDebugOverlay();
                  }}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => {
                    setIsPlaying(true);
                    setSourceVideoBuffering(false);
                    clipDebugLog('workspace:source:play', {
                      currentTime: sourceVideoRef.current?.currentTime ?? null,
                    });
                    refreshDebugOverlay();
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    clipDebugLog('workspace:source:pause', {
                      currentTime: sourceVideoRef.current?.currentTime ?? null,
                    });
                    refreshDebugOverlay();
                  }}
                  onEnded={() => {
                    setIsPlaying(false);
                    clipDebugLog('workspace:source:ended', {
                      currentTime: sourceVideoRef.current?.currentTime ?? null,
                    });
                    refreshDebugOverlay();
                  }}
                  onCanPlay={() => {
                    setSourceVideoLoading(false);
                    setSourceVideoBuffering(false);
                    clipDebugLog('workspace:source:can-play', {
                      readyState: sourceVideoRef.current?.readyState ?? null,
                    });
                    refreshDebugOverlay();
                  }}
                  onWaiting={() => {
                    setSourceVideoBuffering(true);
                    clipDebugLog('workspace:source:waiting', {
                      currentTime: sourceVideoRef.current?.currentTime ?? null,
                    });
                    refreshDebugOverlay();
                  }}
                  onPlaying={() => {
                    setSourceVideoBuffering(false);
                    clipDebugLog('workspace:source:playing', {
                      currentTime: sourceVideoRef.current?.currentTime ?? null,
                    });
                    refreshDebugOverlay();
                  }}
                  onError={() => {
                    setIsPlaying(false);
                    setSourceVideoLoading(false);
                    setSourceVideoBuffering(false);
                    setVideoError(`Could not load ${sourceVideoUrl}`);
                    clipDebugLog('workspace:source:error', {
                      sourceVideoUrl,
                    });
                    refreshDebugOverlay();
                  }}
                />
              )}

              {sourceVideoUrl && !videoError && sourceVideoLoading && (
                <div
                  className="clip-studio-workspace__stage-loading"
                  data-testid="clip-studio-video-loading"
                >
                  <Skeleton className="clip-studio-workspace__stage-loading-video" />
                  <div className="clip-studio-workspace__stage-loading-top">
                    <Skeleton className="clip-studio-workspace__stage-loading-logo" />
                    <Skeleton className="clip-studio-workspace__stage-loading-title" />
                  </div>
                </div>
              )}

              {!sourceVideoUrl && (
                <div className="clip-studio-workspace__empty">
                  <strong>Source video unavailable</strong>
                  <span>
                    This clip manifest does not expose a usable source video URL yet.
                  </span>
                </div>
              )}

              {sourceVideoUrl && videoError && (
                <div className="clip-studio-workspace__empty">
                  <strong>Source video failed to load</strong>
                  <span>{videoError}</span>
                </div>
              )}

              {sourceVideoUrl && !videoError && sourceVideoBuffering && !sourceVideoLoading && (
                <div
                  className="clip-studio-workspace__buffering"
                  data-testid="clip-studio-buffering"
                >
                  Buffering source video...
                </div>
              )}

              {exactLayoutUnavailable && (
                <div
                  className="clip-studio-workspace__authority-overlay"
                  data-testid="clip-studio-layout-unavailable"
                >
                  <strong>
                    {layoutAuthorityReason?.includes('Preparing exact layout') ||
                    layoutAuthorityReason?.includes('Saving exact layout')
                      ? 'Preparing exact layout'
                      : 'Exact layout unavailable'}
                  </strong>
                  <span>
                    {layoutAuthorityReason ||
                      'Studio is waiting for resolver-generated geometry before this canvas can be treated as exact.'}
                  </span>
                </div>
              )}

              {sourceVideoUrl &&
                !videoError &&
                stageLayers.map(({ zone, time, resolvedZone }) => {
                  return (
                    <div key={zone.id}>
                      <ZoneRenderer
                        zone={zone}
                        scale={scale}
                        suppressMediaContent={zone.id === sourceLayer?.id}
                        resolvedZone={resolvedZone}
                        renderMode="clip"
                        assetResolving={assetResolving[zone.id] ?? false}
                        assetFailed={assetFailures[zone.id] ?? false}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
      </div>

      {debugEnabled && (
        <div className="clip-studio-workspace__debug-overlay" data-testid="clip-studio-debug-overlay">
          <strong>Clip Debug</strong>
          <span>
            fit: {workspaceDebugSnapshot.fit.lastRequestedReason} /{' '}
            {workspaceDebugSnapshot.fit.lastWaitPhase}
          </span>
          <span>layout: {workspaceDebugSnapshot.layoutAuthority}</span>
          <span>
            frame:{' '}
            {workspaceDebugSnapshot.frame
              ? `${workspaceDebugSnapshot.frame.clientWidth}×${workspaceDebugSnapshot.frame.clientHeight}`
              : 'n/a'}
          </span>
          <span>
            viewport:{' '}
            {workspaceDebugSnapshot.viewport
              ? `${workspaceDebugSnapshot.viewport.clientWidth}×${workspaceDebugSnapshot.viewport.clientHeight}`
              : 'n/a'}
          </span>
          {workspaceDebugSnapshot.viewportWidthMismatch && (
            <span>mismatch: true</span>
          )}
          <span>
            scroll:{' '}
            {workspaceDebugSnapshot.viewport
              ? `${Math.round(workspaceDebugSnapshot.viewport.scrollLeft)},${Math.round(workspaceDebugSnapshot.viewport.scrollTop)} / ${Math.round(workspaceDebugSnapshot.viewport.maxLeft)},${Math.round(workspaceDebugSnapshot.viewport.maxTop)}`
              : 'n/a'}
          </span>
          <span>
            stage:{' '}
            {workspaceDebugSnapshot.geometry.stageRect
              ? `${Math.round(workspaceDebugSnapshot.geometry.stageRect.left)},${Math.round(workspaceDebugSnapshot.geometry.stageRect.top)}`
              : 'n/a'}
          </span>
          <span>
            visible: {(workspaceDebugSnapshot.stage.visibilityRatio * 100).toFixed(1)}%
          </span>
          <span>
            source:{' '}
            {workspaceDebugSnapshot.sourceVideo.url
              ? workspaceDebugSnapshot.sourceVideo.error
                ? `error: ${workspaceDebugSnapshot.sourceVideo.error}`
                : workspaceDebugSnapshot.sourceVideo.loading
                  ? 'loading'
                  : workspaceDebugSnapshot.sourceVideo.buffering
                    ? 'buffering'
                    : 'ready'
              : 'missing'}
          </span>
        </div>
      )}

      <ClipStudioTimeline
        sourceDuration={sourceDuration}
        sourceMediaTime={sourceMediaTime}
        editorPlayheadTime={editorPlayheadTime}
        clipCurrentTime={clipCurrentTime}
        draftTrimWindow={activeTrimWindow}
        layers={clipLayers}
        onScrub={handleScrub}
        onTrimDraftChange={handleTrimDraftChange}
        onTrimCommit={handleTrimCommit}
        onTrimCancel={handleTrimCancel}
        collapsed={timelineCollapsed}
        onToggleCollapse={() => setTimelineCollapsed(value => !value)}
      />
    </div>
  );
}
