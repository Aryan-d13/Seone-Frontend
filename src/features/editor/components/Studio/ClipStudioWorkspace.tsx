import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pause, Play } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { endpoints, getMediaUrl } from '@/lib/config';
import { authFetch } from '@/services/auth';
import { useTemplateStore } from '../../store/templateStore';
import ZoneRenderer from '../Canvas/ZoneRenderer';
import ClipStudioTimeline from './ClipStudioTimeline';
import { getClipLayerDefinitions, getClipStageLayerDefinitions } from '../../utils/clipLayers';
import { getAssetPreviewUrl } from '../../utils/assetPreview';
import RenderPreview, { type RenderPreviewRequest } from '../RenderPreview/RenderPreview';
import './ClipStudioWorkspace.css';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
  studioSource?: 'draft' | 'original';
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string | null;
  onDownloadMp4?: (() => void) | null;
  exporting?: boolean;
  previewOpen?: boolean;
  onPreviewClose?: (() => void) | null;
}

export default function ClipStudioWorkspace({
  renderPreviewRequest = null,
  previewOpen = false,
  onPreviewClose = null,
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const previousScaleRef = useRef(1);
  const shouldCenterViewportRef = useRef(true);
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
    shouldCenterViewportRef.current = true;
  }, [committedTrimWindow.start, sourceVideoUrl]);

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
    shouldCenterViewportRef.current = true;
  }, [canvas.height, canvas.width]);

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
    const viewport = viewportRef.current;
    if (!viewport) {
      previousScaleRef.current = scale;
      zoomAnchorRef.current = null;
      return;
    }

    const centerStage = () => {
      viewport.scrollLeft = Math.max(
        0,
        workspacePadding + scaledWidth / 2 - viewport.clientWidth / 2
      );
      viewport.scrollTop = Math.max(
        0,
        workspacePadding + scaledHeight / 2 - viewport.clientHeight / 2
      );
    };

    if (shouldCenterViewportRef.current) {
      centerStage();
      shouldCenterViewportRef.current = false;
      previousScaleRef.current = scale;
      zoomAnchorRef.current = null;
      return;
    }

    const previousScale = previousScaleRef.current;
    if (Math.abs(previousScale - scale) < 0.0001) {
      zoomAnchorRef.current = null;
      return;
    }

    const anchor = zoomAnchorRef.current;
    if (anchor) {
      viewport.scrollLeft = Math.max(
        0,
        workspacePadding + anchor.canvasX * scale - anchor.viewportX
      );
      viewport.scrollTop = Math.max(
        0,
        workspacePadding + anchor.canvasY * scale - anchor.viewportY
      );
    } else {
      const centerCanvasX =
        (viewport.scrollLeft + viewport.clientWidth / 2 - workspacePadding) /
        Math.max(previousScale, 0.001);
      const centerCanvasY =
        (viewport.scrollTop + viewport.clientHeight / 2 - workspacePadding) /
        Math.max(previousScale, 0.001);

      viewport.scrollLeft = Math.max(
        0,
        workspacePadding + centerCanvasX * scale - viewport.clientWidth / 2
      );
      viewport.scrollTop = Math.max(
        0,
        workspacePadding + centerCanvasY * scale - viewport.clientHeight / 2
      );
    }

    previousScaleRef.current = scale;
    zoomAnchorRef.current = null;
  }, [scale, scaledHeight, scaledWidth, workspacePadding]);

  const handleLoadedMetadata = () => {
    const element = sourceVideoRef.current;
    const nextDuration = element?.duration;
    if (!Number.isFinite(nextDuration) || !nextDuration) return;

    if (element && element.videoWidth > 0 && element.videoHeight > 0) {
      const nextAspectRatio = element.videoWidth / element.videoHeight;
      setSourceVideoAspectRatio(nextAspectRatio);
    }

    setSourceDuration(nextDuration);
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
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const handleViewportWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
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
    shouldCenterViewportRef.current = true;
    setZoom(1);

    if (zoom === 1 && viewportRef.current) {
      const viewport = viewportRef.current;
      viewport.scrollLeft = Math.max(
        0,
        workspacePadding + scaledWidth / 2 - viewport.clientWidth / 2
      );
      viewport.scrollTop = Math.max(
        0,
        workspacePadding + scaledHeight / 2 - viewport.clientHeight / 2
      );
      shouldCenterViewportRef.current = false;
    }
  };

  return (
    <div className="clip-studio-workspace">
      {previewOpen && (
        <div className="clip-studio-workspace__preview-sheet">
          <div className="clip-studio-workspace__preview-sheet-header">
            <span>Preview</span>
            <button type="button" onClick={() => onPreviewClose?.()}>
              <ChevronUp size={14} />
            </button>
          </div>
          <RenderPreview renderRequest={renderPreviewRequest} />
        </div>
      )}

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
          className="clip-studio-workspace__plane"
          style={{ width: planeWidth, height: planeHeight }}
        >
          <div
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
                  <button type="button" onClick={() => setZoom(zoom - 0.1)}>
                    -
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => setZoom(zoom + 0.1)}>
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
                  onLoadedData={() => setSourceVideoLoading(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => {
                    setIsPlaying(true);
                    setSourceVideoBuffering(false);
                  }}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onCanPlay={() => {
                    setSourceVideoLoading(false);
                    setSourceVideoBuffering(false);
                  }}
                  onWaiting={() => setSourceVideoBuffering(true)}
                  onPlaying={() => setSourceVideoBuffering(false)}
                  onError={() => {
                    setIsPlaying(false);
                    setSourceVideoLoading(false);
                    setSourceVideoBuffering(false);
                    setVideoError(`Could not load ${sourceVideoUrl}`);
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
