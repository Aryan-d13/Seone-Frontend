import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import type { ClipLayerDefinition } from '../../utils/clipLayers';
import './ClipStudioTimeline.css';

interface TimeWindow {
  start: number;
  end: number;
}

interface ClipStudioTimelineProps {
  sourceDuration: number;
  sourceMediaTime: number;
  editorPlayheadTime: number;
  clipCurrentTime: number;
  draftTrimWindow: TimeWindow;
  layers: ClipLayerDefinition[];
  onScrub: (playheadTime: number) => void;
  onTrimDraftChange: (window: TimeWindow) => void;
  onTrimCommit: (window: TimeWindow) => void;
  onTrimCancel: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

type ActiveHandle = 'left' | 'right' | 'scrub' | null;

interface PointerSession {
  pointerId: number;
  handle: NonNullable<ActiveHandle>;
  latestTime: number;
  latestWindow: TimeWindow;
}

interface SourceTrackRect {
  left: number;
  width: number;
  offsetLeft: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createSourceTrackTimeMapper(trackRect: SourceTrackRect, sourceDuration: number) {
  const safeDuration =
    Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : 0;
  const safeWidth =
    Number.isFinite(trackRect.width) && trackRect.width > 0 ? trackRect.width : 0;

  const clampTime = (time: number) => clamp(time, 0, safeDuration);

  return {
    clientXToTime(clientX: number) {
      if (safeDuration <= 0 || safeWidth <= 0) return 0;
      const relativeX = clamp(clientX - trackRect.left, 0, safeWidth);
      return clampTime((relativeX / safeWidth) * safeDuration);
    },
    timeToPercent(time: number) {
      if (safeDuration <= 0) return 0;
      return (clampTime(time) / safeDuration) * 100;
    },
    timeToTrackX(time: number) {
      if (safeDuration <= 0 || safeWidth <= 0) return trackRect.offsetLeft;
      return trackRect.offsetLeft + (clampTime(time) / safeDuration) * safeWidth;
    },
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.0';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

function getLayerLabel(
  layer: ClipLayerDefinition,
  previewTexts: Record<string, string>
): string {
  if (layer.zone.type === 'video') return 'Video';
  if (layer.zone.type === 'shape') return 'Background';
  if (layer.zone.type === 'image') return layer.zone.role === 'logo' ? 'Logo' : 'Image';
  if (layer.zone.content_ref && previewTexts[layer.zone.content_ref]?.trim()) {
    return previewTexts[layer.zone.content_ref].trim();
  }
  return 'Text';
}

export default function ClipStudioTimeline({
  sourceDuration,
  sourceMediaTime,
  editorPlayheadTime,
  clipCurrentTime,
  draftTrimWindow,
  layers,
  onScrub,
  onTrimDraftChange,
  onTrimCommit,
  onTrimCancel,
  collapsed = false,
  onToggleCollapse,
}: ClipStudioTimelineProps) {
  const trackSurfaceRef = useRef<HTMLDivElement>(null);
  const sourceTrackRef = useRef<HTMLDivElement>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);
  const [activeHandle, setActiveHandle] = useState<ActiveHandle>(null);
  const [showOverlayTracks, setShowOverlayTracks] = useState(false);
  const [sourceTrackRect, setSourceTrackRect] = useState<SourceTrackRect>({
    left: 0,
    width: 0,
    offsetLeft: 0,
  });
  const previewTexts = useTemplateStore(state => state.previewTexts);

  const layerTracks = useMemo(
    () =>
      layers.filter(layer => layer.zone.type !== 'video' && layer.zone.type !== 'shape'),
    [layers]
  );

  const readSourceTrackRect = (): SourceTrackRect => {
    const trackSurface = trackSurfaceRef.current;
    const sourceTrack = sourceTrackRef.current;
    if (!trackSurface || !sourceTrack) {
      return { left: 0, width: 0, offsetLeft: 0 };
    }

    const surfaceRect = trackSurface.getBoundingClientRect();
    const trackRect = sourceTrack.getBoundingClientRect();
    return {
      left: trackRect.left,
      width: trackRect.width,
      offsetLeft: Math.max(0, trackRect.left - surfaceRect.left),
    };
  };

  const syncSourceTrackRect = (nextRect = readSourceTrackRect()) => {
    setSourceTrackRect(current => {
      if (
        Math.abs(current.left - nextRect.left) < 0.5 &&
        Math.abs(current.width - nextRect.width) < 0.5 &&
        Math.abs(current.offsetLeft - nextRect.offsetLeft) < 0.5
      ) {
        return current;
      }
      return nextRect;
    });
    return nextRect;
  };

  useEffect(() => {
    syncSourceTrackRect();

    const handleResize = () => {
      syncSourceTrackRect();
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncSourceTrackRect();
      });
      if (trackSurfaceRef.current) {
        resizeObserver.observe(trackSurfaceRef.current);
      }
      if (sourceTrackRef.current) {
        resizeObserver.observe(sourceTrackRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [collapsed, showOverlayTracks]);

  const sourceTrackTimeMapper = useMemo(
    () => createSourceTrackTimeMapper(sourceTrackRect, sourceDuration),
    [sourceTrackRect, sourceDuration]
  );

  const progressTrackX = sourceTrackTimeMapper.timeToTrackX(editorPlayheadTime);
  const startPercentage = sourceTrackTimeMapper.timeToPercent(draftTrimWindow.start);
  const endPercentage = sourceTrackTimeMapper.timeToPercent(draftTrimWindow.end);
  const clipDuration = Math.max(0, draftTrimWindow.end - draftTrimWindow.start);

  const getLiveMapper = () =>
    createSourceTrackTimeMapper(syncSourceTrackRect(), sourceDuration);

  const updatePointerSession = (
    clientX: number,
    session: PointerSession,
    mapper = getLiveMapper()
  ) => {
    const time = mapper.clientXToTime(clientX);
    session.latestTime = time;

    if (session.handle === 'scrub') {
      onScrub(time);
      return;
    }

    if (session.handle === 'left') {
      const nextWindow = {
        start: clamp(time, 0, Math.max(0, session.latestWindow.end - 0.1)),
        end: session.latestWindow.end,
      };
      session.latestWindow = nextWindow;
      onTrimDraftChange(nextWindow);
      return;
    }

    const nextWindow = {
      start: session.latestWindow.start,
      end: clamp(
        time,
        Math.min(sourceDuration, session.latestWindow.start + 0.1),
        sourceDuration
      ),
    };
    session.latestWindow = nextWindow;
    onTrimDraftChange(nextWindow);
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: NonNullable<ActiveHandle>
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const sourceTrack = sourceTrackRef.current;
    if (!sourceTrack) return;

    const mapper = getLiveMapper();
    const pointerSession: PointerSession = {
      pointerId: event.pointerId,
      handle,
      latestTime: mapper.clientXToTime(event.clientX),
      latestWindow: { ...draftTrimWindow },
    };
    pointerSessionRef.current = pointerSession;
    setActiveHandle(handle);
    sourceTrack.setPointerCapture(event.pointerId);
    updatePointerSession(event.clientX, pointerSession, mapper);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    updatePointerSession(event.clientX, session);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const sourceTrack = sourceTrackRef.current;
    if (sourceTrack?.hasPointerCapture(event.pointerId)) {
      sourceTrack.releasePointerCapture(event.pointerId);
    }

    if (session.handle === 'left' || session.handle === 'right') {
      onTrimCommit(session.latestWindow);
    }

    pointerSessionRef.current = null;
    setActiveHandle(null);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const sourceTrack = sourceTrackRef.current;
    if (sourceTrack?.hasPointerCapture(event.pointerId)) {
      sourceTrack.releasePointerCapture(event.pointerId);
    }

    if (session.handle === 'left' || session.handle === 'right') {
      onTrimCancel();
    }

    pointerSessionRef.current = null;
    setActiveHandle(null);
  };

  return (
    <div
      data-testid="clip-studio-timeline"
      className={`clip-studio-timeline ${collapsed ? 'clip-studio-timeline--collapsed' : ''}`}
    >
      <div className="clip-studio-timeline__toolbar">
        <div className="clip-studio-timeline__toolbar-start">
          <button
            type="button"
            className="clip-studio-timeline__toggle"
            onClick={onToggleCollapse}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{collapsed ? 'Show Timing' : 'Hide Timing'}</span>
          </button>
          <span className="clip-studio-timeline__label">Timeline</span>
        </div>
        <div className="clip-studio-timeline__meta">
          <span>Source In {formatTime(draftTrimWindow.start)}</span>
          <span>Source Out {formatTime(draftTrimWindow.end)}</span>
          <span>
            Clip {formatTime(clipCurrentTime)} / {formatTime(clipDuration)}
          </span>
          <span>Source {formatTime(sourceMediaTime)}</span>
        </div>
      </div>

      {collapsed ? null : (
        <div className="clip-studio-timeline__tracks">
          <div className="clip-studio-timeline__ruler">
            {Array.from({ length: 6 }).map((_, index) => {
              const markerTime = sourceDuration > 0 ? (sourceDuration * index) / 5 : 0;
              return (
                <span key={index} className="clip-studio-timeline__ruler-mark">
                  {formatTime(markerTime)}
                </span>
              );
            })}
          </div>

          <div
            ref={trackSurfaceRef}
            data-testid="clip-studio-track-surface"
            data-active-handle={activeHandle ?? undefined}
            className="clip-studio-timeline__track-surface"
          >
            <div
              data-testid="clip-studio-playhead"
              className="clip-studio-timeline__playhead"
              style={{ left: `${progressTrackX}px` }}
            >
              <div className="clip-studio-timeline__playhead-knob" />
            </div>

            <div className="clip-studio-timeline__row clip-studio-timeline__row--video">
              <span className="clip-studio-timeline__row-label">Source</span>
              <div
                ref={sourceTrackRef}
                data-testid="clip-studio-source-track"
                className="clip-studio-timeline__track"
                onPointerDown={event => handlePointerDown(event, 'scrub')}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onLostPointerCapture={() => {
                  pointerSessionRef.current = null;
                  setActiveHandle(null);
                }}
              >
                <div
                  className="clip-studio-timeline__trim-mask"
                  style={{ width: `${startPercentage}%` }}
                />
                <div
                  className="clip-studio-timeline__trim-mask clip-studio-timeline__trim-mask--right"
                  style={{ width: `${100 - endPercentage}%`, left: `${endPercentage}%` }}
                />
                <div
                  className="clip-studio-timeline__time-window"
                  style={{
                    left: `${startPercentage}%`,
                    width: `${Math.max(0, endPercentage - startPercentage)}%`,
                  }}
                >
                  <div
                    data-testid="clip-studio-trim-handle-left"
                    className="clip-studio-timeline__window-handle clip-studio-timeline__window-handle--left"
                    onPointerDown={event => handlePointerDown(event, 'left')}
                  />
                  <div className="clip-studio-timeline__window-fill" />
                  <div
                    data-testid="clip-studio-trim-handle-right"
                    className="clip-studio-timeline__window-handle clip-studio-timeline__window-handle--right"
                    onPointerDown={event => handlePointerDown(event, 'right')}
                  />
                </div>
              </div>
            </div>

            {layerTracks.length > 0 && (
              <div className="clip-studio-timeline__overlay-toggle-row">
                <button
                  type="button"
                  className="clip-studio-timeline__overlay-toggle"
                  onClick={() => setShowOverlayTracks(value => !value)}
                >
                  {showOverlayTracks ? 'Hide Overlay Tracks' : 'Show Overlay Tracks'}
                </button>
              </div>
            )}

            {showOverlayTracks &&
              layerTracks.map(layer => {
                const layerStartTime = draftTrimWindow.start + layer.time.start;
                const layerEndTime = draftTrimWindow.start + layer.time.end;
                const left = sourceTrackTimeMapper.timeToPercent(layerStartTime);
                const width = Math.max(
                  0,
                  sourceTrackTimeMapper.timeToPercent(layerEndTime) - left
                );
                return (
                  <div key={layer.zone.id} className="clip-studio-timeline__row">
                    <span className="clip-studio-timeline__row-label">
                      {getLayerLabel(layer, previewTexts)}
                    </span>
                    <div
                      data-testid={`clip-studio-overlay-track-${layer.zone.id}`}
                      className="clip-studio-timeline__track clip-studio-timeline__track--layer"
                    >
                      <div
                        className={`clip-studio-timeline__clip clip-studio-timeline__clip--${layer.zone.type}`}
                        style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                      >
                        <span>{layer.zone.type}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
