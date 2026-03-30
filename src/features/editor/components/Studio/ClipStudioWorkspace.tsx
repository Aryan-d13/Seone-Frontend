import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Pause,
    Play,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { endpoints, getMediaUrl } from '@/lib/config';
import { authFetch } from '@/services/auth';
import { useTemplateStore } from '../../store/templateStore';
import ZoneRenderer from '../Canvas/ZoneRenderer';
import ClipStudioTimeline from './ClipStudioTimeline';
import { getClipLayerDefinitions } from '../../utils/clipLayers';
import { getAssetPreviewUrl } from '../../utils/assetPreview';
import RenderPreview, { type RenderPreviewRequest } from '../RenderPreview/RenderPreview';
import './ClipStudioWorkspace.css';

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
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
        selectedZoneId,
        interactionMode,
        selectZone,
        zoom,
        setZoom,
        updateManifestRenderPayload,
        setUploadedImage,
        setSourceVideoAspectRatio,
    } = useTemplateStore();
    const { canvas, zones } = template;
    const viewportRef = useRef<HTMLDivElement>(null);
    const masterVideoRef = useRef<HTMLVideoElement>(null);
    const previousScaleRef = useRef(1);
    const shouldCenterViewportRef = useRef(true);
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

    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [sourceVideoLoading, setSourceVideoLoading] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(true);
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

    const rawWindow = activeManifest?.render_payload?.time_window;
    const startTime = typeof rawWindow?.start === 'number' ? rawWindow.start : 0;
    const endTime =
        typeof rawWindow?.end === 'number' && rawWindow.end > startTime
            ? rawWindow.end
            : duration || 0;
    const clipDuration = Math.max(0, endTime - startTime);
    const clipCurrentTime = clamp(currentTime - startTime, 0, clipDuration || Math.max(0, duration - startTime));

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
        [canvas.height, canvas.width],
    );
    const planeWidth = scaledWidth + workspacePadding * 2;
    const planeHeight = scaledHeight + workspacePadding * 2;

    const orderedZones = useMemo(
        () => [...zones].sort((left, right) => left.z - right.z),
        [zones],
    );

    const clipLayers = useMemo(
        () => getClipLayerDefinitions(orderedZones, activeManifest, clipDuration || Math.max(0, duration - startTime)),
        [orderedZones, activeManifest, clipDuration, duration, startTime],
    );

    const visibleLayers = useMemo(() => {
        return clipLayers.filter(({ zone, time }) => {
            if (zone.type === 'video' || zone.type === 'shape') return true;
            return clipCurrentTime >= time.start && clipCurrentTime <= time.end;
        });
    }, [clipCurrentTime, clipLayers]);

    const selectedZone = useMemo(
        () => zones.find((zone) => zone.id === selectedZoneId) ?? null,
        [selectedZoneId, zones],
    );

    const sourceLayer = useMemo(
        () => orderedZones.find((zone) => zone.type === 'video') ?? null,
        [orderedZones],
    );

    useEffect(() => {
        setIsPlaying(false);
        setCurrentTime(startTime);
        setVideoError(null);
        setSourceVideoLoading(Boolean(sourceVideoUrl));
        shouldCenterViewportRef.current = true;
    }, [activeManifest, sourceVideoUrl, startTime]);

    useEffect(() => {
        if (selectedZone?.type === 'video') {
            setTimelineCollapsed(false);
        }
    }, [selectedZone?.id, selectedZone?.type]);

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
        const imageZones = zones.filter((zone) => zone.type === 'image');

        async function fetchBlobPreview(url: string, authenticated: boolean): Promise<string | null> {
            try {
                const response = authenticated
                    ? await authFetch(url)
                    : await fetch(url, { cache: 'no-store' });
                if (!response.ok) return null;
                const blob = await response.blob();
                if (!blob.size) return null;
                return URL.createObjectURL(blob);
            } catch {
                return null;
            }
        }

        setAssetResolving(() =>
            Object.fromEntries(imageZones.map((zone) => [zone.id, true])),
        );
        setAssetFailures(() =>
            Object.fromEntries(imageZones.map((zone) => [zone.id, false])),
        );

        async function hydrateProtectedAssets() {
            await Promise.all(
                imageZones.map(async (zone) => {
                    const assetKey = zone.asset_ref || zone.id;
                    const templateAsset = template.assets[assetKey];
                    const manifestAssetUrl = manifest.assets?.[assetKey];
                    const clipAssetUrl =
                        renderPreviewRequest
                            ? getMediaUrl(endpoints.jobs.clipAsset(
                                renderPreviewRequest.jobId,
                                renderPreviewRequest.clipIndex,
                                assetKey,
                            ))
                            : null;
                    try {
                        const candidates: Array<() => Promise<string | null>> = [];

                        if (clipAssetUrl) {
                            candidates.push(() => fetchBlobPreview(clipAssetUrl, true));
                        } else {
                            const directPreviewUrl = getAssetPreviewUrl(templateAsset, manifestAssetUrl);
                            if (directPreviewUrl) {
                                candidates.push(() => fetchBlobPreview(directPreviewUrl, false));
                            }
                        }

                        for (const candidate of candidates) {
                            const resolvedUrl = await candidate();
                            if (!resolvedUrl) continue;

                            if (cancelled) {
                                if (resolvedUrl.startsWith('blob:')) {
                                    URL.revokeObjectURL(resolvedUrl);
                                }
                                return;
                            }

                            setUploadedImage(zone.id, resolvedUrl);
                            setAssetFailures((previous) => ({ ...previous, [zone.id]: false }));
                            return;
                        }
                        setAssetFailures((previous) => ({ ...previous, [zone.id]: true }));
                    } finally {
                        if (!cancelled) {
                            setAssetResolving((previous) => ({ ...previous, [zone.id]: false }));
                        }
                    }
                }),
            );
        }

        void hydrateProtectedAssets();

        return () => {
            cancelled = true;
        };
    }, [activeManifest, renderPreviewRequest, setUploadedImage, template.assets, template.id, zones]);

    useEffect(() => {
        if (!masterVideoRef.current || !Number.isFinite(currentTime)) return;
        if (Math.abs(masterVideoRef.current.currentTime - currentTime) > 0.15) {
            try {
                masterVideoRef.current.currentTime = currentTime;
            } catch {
                // Ignore seek failures during early metadata load.
            }
        }
    }, [currentTime]);

    useEffect(() => {
        if (!masterVideoRef.current) return;
        if (!sourceVideoUrl) {
            masterVideoRef.current.pause();
            setIsPlaying(false);
            return;
        }

        if (isPlaying) {
            void masterVideoRef.current.play().catch(() => {
                setIsPlaying(false);
            });
        } else {
            masterVideoRef.current.pause();
        }
    }, [isPlaying, sourceVideoUrl]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) {
            previousScaleRef.current = scale;
            zoomAnchorRef.current = null;
            return;
        }

        const centerStage = () => {
            viewport.scrollLeft = Math.max(0, workspacePadding + scaledWidth / 2 - viewport.clientWidth / 2);
            viewport.scrollTop = Math.max(0, workspacePadding + scaledHeight / 2 - viewport.clientHeight / 2);
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
            viewport.scrollLeft = Math.max(0, workspacePadding + anchor.canvasX * scale - anchor.viewportX);
            viewport.scrollTop = Math.max(0, workspacePadding + anchor.canvasY * scale - anchor.viewportY);
        } else {
            const centerCanvasX =
                (viewport.scrollLeft + viewport.clientWidth / 2 - workspacePadding) / Math.max(previousScale, 0.001);
            const centerCanvasY =
                (viewport.scrollTop + viewport.clientHeight / 2 - workspacePadding) / Math.max(previousScale, 0.001);

            viewport.scrollLeft = Math.max(0, workspacePadding + centerCanvasX * scale - viewport.clientWidth / 2);
            viewport.scrollTop = Math.max(0, workspacePadding + centerCanvasY * scale - viewport.clientHeight / 2);
        }

        previousScaleRef.current = scale;
        zoomAnchorRef.current = null;
    }, [scale, scaledHeight, scaledWidth, workspacePadding]);

    const handleLoadedMetadata = () => {
        const element = masterVideoRef.current;
        const nextDuration = element?.duration;
        if (!Number.isFinite(nextDuration) || !nextDuration) return;

        if (element && element.videoWidth > 0 && element.videoHeight > 0) {
            const nextAspectRatio = element.videoWidth / element.videoHeight;
            setSourceVideoAspectRatio(nextAspectRatio);
        }

        setSourceVideoLoading(false);
        setDuration(nextDuration);
        if (!(typeof rawWindow?.end === 'number') || rawWindow.end <= startTime) {
            updateManifestRenderPayload({
                time_window: {
                    start: startTime,
                    end: nextDuration,
                },
            });
        }
    };

    const handleTimeUpdate = () => {
        const element = masterVideoRef.current;
        if (!element) return;

        if (endTime > startTime && element.currentTime >= endTime) {
            element.pause();
            element.currentTime = startTime;
            setIsPlaying(false);
            setCurrentTime(startTime);
            return;
        }

        setCurrentTime(element.currentTime);
    };

    const handleSeek = (time: number) => {
        const targetTime = clamp(time, 0, duration || time);
        if (masterVideoRef.current) {
            masterVideoRef.current.currentTime = targetTime;
        }
        setCurrentTime(targetTime);
    };

    const handleTimeWindowChange = (nextStart: number, nextEnd: number) => {
        updateManifestRenderPayload({
            time_window: {
                start: nextStart,
                end: nextEnd,
            },
        });

        if (currentTime < nextStart || currentTime > nextEnd) {
            handleSeek(nextStart);
        }
    };

    const togglePlayback = () => {
        if (!sourceVideoUrl) return;

        if (currentTime < startTime || (endTime > startTime && currentTime > endTime)) {
            handleSeek(startTime);
        }

        setIsPlaying((value) => !value);
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
                canvasX: (viewport.scrollLeft + viewportX - workspacePadding) / Math.max(scale, 0.001),
                canvasY: (viewport.scrollTop + viewportY - workspacePadding) / Math.max(scale, 0.001),
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
        mode: 'space' | 'background',
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

    const handleViewportPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        const hitZone = Boolean(target?.closest('.zone-renderer'));

        if (spacePanActive) {
            beginPanSession(event, 'space');
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
            viewport.scrollLeft = Math.max(0, workspacePadding + scaledWidth / 2 - viewport.clientWidth / 2);
            viewport.scrollTop = Math.max(0, workspacePadding + scaledHeight / 2 - viewport.clientHeight / 2);
            shouldCenterViewportRef.current = false;
        }
    };

    return (
        <div className="clip-studio-workspace">
            <video
                ref={masterVideoRef}
                src={sourceVideoUrl || undefined}
                className="clip-studio-workspace__master-video"
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onCanPlay={() => setSourceVideoLoading(false)}
                onError={() => {
                    setIsPlaying(false);
                    setSourceVideoLoading(false);
                    setVideoError(`Could not load ${sourceVideoUrl}`);
                }}
            />

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
                                <strong>{canvas.width} × {canvas.height}</strong>
                            </div>
                            <div className="clip-studio-workspace__stage-tools">
                                <button
                                    className="clip-studio-workspace__transport"
                                    onClick={togglePlayback}
                                    type="button"
                                    disabled={!sourceVideoUrl}
                                >
                                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                                </button>
                                <div className="clip-studio-workspace__zoom">
                                    <button type="button" onClick={() => setZoom(zoom - 0.1)}>-</button>
                                    <span>{Math.round(zoom * 100)}%</span>
                                    <button type="button" onClick={() => setZoom(zoom + 0.1)}>+</button>
                                    <button type="button" onClick={handleResetViewport}>Fit</button>
                                </div>
                                <button
                                    type="button"
                                    className="clip-studio-workspace__trim-toggle"
                                    onClick={() => setTimelineCollapsed((value) => !value)}
                                >
                                    {timelineCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    Trim
                                </button>
                            </div>
                        </div>

                        <div
                            className="clip-studio-workspace__stage"
                            style={{ width: scaledWidth, height: scaledHeight }}
                        >
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
                                    <span>This clip manifest does not expose a usable source video URL yet.</span>
                                </div>
                            )}

                            {sourceVideoUrl && videoError && (
                                <div className="clip-studio-workspace__empty">
                                    <strong>Source video failed to load</strong>
                                    <span>{videoError}</span>
                                </div>
                            )}

                            {sourceVideoUrl && !videoError && visibleLayers.map(({ zone, time, resolvedZone }) => {
                                const isInactive =
                                    zone.type !== 'video' &&
                                    (clipCurrentTime < time.start || clipCurrentTime > time.end);

                                return (
                                    <div
                                        key={zone.id}
                                        className={isInactive ? 'clip-studio-workspace__zone-muted' : undefined}
                                    >
                                        <ZoneRenderer
                                            zone={zone}
                                            scale={scale}
                                            videoSrc={zone.id === sourceLayer?.id ? sourceVideoUrl : null}
                                        currentTime={currentTime}
                                        isPlaying={isPlaying}
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
                duration={duration}
                currentTime={currentTime}
                clipCurrentTime={clipCurrentTime}
                startTime={startTime}
                endTime={endTime}
                layers={clipLayers}
                onSeek={handleSeek}
                onTimeWindowChange={handleTimeWindowChange}
                collapsed={timelineCollapsed}
                onToggleCollapse={() => setTimelineCollapsed((value) => !value)}
            />
        </div>
    );
}
