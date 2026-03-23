import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import type { ClipLayerDefinition } from '../../utils/clipLayers';
import './ClipStudioTimeline.css';

interface ClipStudioTimelineProps {
    duration: number;
    currentTime: number;
    clipCurrentTime: number;
    startTime: number;
    endTime: number;
    layers: ClipLayerDefinition[];
    onSeek: (time: number) => void;
    onTimeWindowChange: (start: number, end: number) => void;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

type ActiveHandle = 'left' | 'right' | 'scrub' | null;

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
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
    previewTexts: Record<string, string>,
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
    duration,
    currentTime,
    clipCurrentTime,
    startTime,
    endTime,
    layers,
    onSeek,
    onTimeWindowChange,
    collapsed = false,
    onToggleCollapse,
}: ClipStudioTimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [activeHandle, setActiveHandle] = useState<ActiveHandle>(null);
    const [showOverlayTracks, setShowOverlayTracks] = useState(false);
    const previewTexts = useTemplateStore((state) => state.previewTexts);

    const layerTracks = useMemo(
        () => layers.filter((layer) => layer.zone.type !== 'video' && layer.zone.type !== 'shape'),
        [layers],
    );

    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    const startPercentage = duration > 0 ? (startTime / duration) * 100 : 0;
    const endPercentage = duration > 0 ? (endTime / duration) * 100 : 100;
    const clipDuration = Math.max(0, endTime - startTime);

    const updateFromClientX = (clientX: number, handle: NonNullable<ActiveHandle>) => {
        if (!trackRef.current || duration <= 0) return;

        const rect = trackRef.current.getBoundingClientRect();
        const x = clamp(clientX - rect.left, 0, rect.width);
        const time = (x / rect.width) * duration;

        if (handle === 'scrub') {
            onSeek(time);
            return;
        }

        if (handle === 'left') {
            const nextStart = clamp(time, 0, Math.max(0, endTime - 0.1));
            onTimeWindowChange(nextStart, endTime);
            onSeek(nextStart);
            return;
        }

        const nextEnd = clamp(time, Math.min(duration, startTime + 0.1), duration);
        onTimeWindowChange(startTime, nextEnd);
        onSeek(nextEnd);
    };

    const handlePointerDown = (
        event: React.PointerEvent<HTMLDivElement>,
        handle: NonNullable<ActiveHandle>,
    ) => {
        event.stopPropagation();
        setActiveHandle(handle);
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromClientX(event.clientX, handle);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!activeHandle) return;
        updateFromClientX(event.clientX, activeHandle);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!activeHandle) return;
        setActiveHandle(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <div className={`clip-studio-timeline ${collapsed ? 'clip-studio-timeline--collapsed' : ''}`}>
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
                    <span>Source In {formatTime(startTime)}</span>
                    <span>Source Out {formatTime(endTime)}</span>
                    <span>Clip {formatTime(clipCurrentTime)} / {formatTime(clipDuration)}</span>
                </div>
            </div>

            {collapsed ? null : (
            <div
                className="clip-studio-timeline__tracks"
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="clip-studio-timeline__ruler">
                    {Array.from({ length: 6 }).map((_, index) => {
                        const markerTime = duration > 0 ? (duration * index) / 5 : 0;
                        return (
                            <span key={index} className="clip-studio-timeline__ruler-mark">
                                {formatTime(markerTime)}
                            </span>
                        );
                    })}
                </div>

                <div
                    ref={trackRef}
                    className="clip-studio-timeline__track-surface"
                    onPointerDown={(event) => handlePointerDown(event, 'scrub')}
                >
                    <div
                        className="clip-studio-timeline__playhead"
                        style={{ left: `${progressPercentage}%` }}
                    >
                        <div className="clip-studio-timeline__playhead-knob" />
                    </div>

                    <div className="clip-studio-timeline__row clip-studio-timeline__row--video">
                        <span className="clip-studio-timeline__row-label">Source</span>
                        <div className="clip-studio-timeline__track">
                            <div className="clip-studio-timeline__trim-mask" style={{ width: `${startPercentage}%` }} />
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
                                    className="clip-studio-timeline__window-handle clip-studio-timeline__window-handle--left"
                                    onPointerDown={(event) => handlePointerDown(event, 'left')}
                                />
                                <div className="clip-studio-timeline__window-fill" />
                                <div
                                    className="clip-studio-timeline__window-handle clip-studio-timeline__window-handle--right"
                                    onPointerDown={(event) => handlePointerDown(event, 'right')}
                                />
                            </div>
                        </div>
                    </div>

                    {layerTracks.length > 0 && (
                        <div className="clip-studio-timeline__overlay-toggle-row">
                            <button
                                type="button"
                                className="clip-studio-timeline__overlay-toggle"
                                onClick={() => setShowOverlayTracks((value) => !value)}
                            >
                                {showOverlayTracks ? 'Hide Overlay Tracks' : 'Show Overlay Tracks'}
                            </button>
                        </div>
                    )}

                    {showOverlayTracks && layerTracks.map((layer) => {
                        const left = duration > 0 ? ((startTime + layer.time.start) / duration) * 100 : 0;
                        const width = duration > 0 ? ((layer.time.end - layer.time.start) / duration) * 100 : 0;
                        return (
                            <div key={layer.zone.id} className="clip-studio-timeline__row">
                                <span className="clip-studio-timeline__row-label">{getLayerLabel(layer, previewTexts)}</span>
                                <div className="clip-studio-timeline__track clip-studio-timeline__track--layer">
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
