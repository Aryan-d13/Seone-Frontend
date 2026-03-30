'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';
import ZoneRenderer from './ZoneRenderer';
import './CanvasWorkspace.css';

/**
 * The main canvas viewport.
 *
 * Scales the template canvas to fit within the available viewport.
 * Zones are rendered in z-order, with react-rnd providing interactivity.
 */
export default function CanvasWorkspace() {
    const { template, selectZone, gridSnap, gridSize, zoom, setZoom, interactionMode } = useTemplateStore();
    const { canvas, zones } = template;
    const viewportRef = useRef<HTMLDivElement>(null);
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
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [spacePanActive, setSpacePanActive] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

    const fitScale = useMemo(() => {
        const availableWidth = Math.max(viewportSize.width - 160, 320);
        const availableHeight = Math.max(viewportSize.height - 160, 320);
        const widthFit = availableWidth / Math.max(canvas.width, 1);
        const heightFit = availableHeight / Math.max(canvas.height, 1);
        return Math.min(1, widthFit, heightFit);
    }, [canvas.height, canvas.width, viewportSize.height, viewportSize.width]);

    const scale = fitScale * zoom;

    const scaledW = canvas.width * scale;
    const scaledH = canvas.height * scale;
    const workspacePadding = useMemo(
        () => Math.max(48, Math.round(Math.max(canvas.width, canvas.height) * 0.08)),
        [canvas.height, canvas.width],
    );
    const planeWidth = scaledW + workspacePadding * 2;
    const planeHeight = scaledH + workspacePadding * 2;
    const orderedZones = useMemo(
        () => [...zones].sort((left, right) => left.z - right.z),
        [zones],
    );

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return undefined;

        const syncViewportSize = () => {
            setViewportSize({
                width: viewport.clientWidth,
                height: viewport.clientHeight,
            });
        };

        syncViewportSize();

        const observer = new ResizeObserver(() => {
            syncViewportSize();
        });
        observer.observe(viewport);

        return () => observer.disconnect();
    }, []);

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
    }, [canvas.height, canvas.width, template.id, zones.length]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) {
            previousScaleRef.current = scale;
            zoomAnchorRef.current = null;
            return;
        }

        const centerStage = () => {
            viewport.scrollLeft = Math.max(0, workspacePadding + scaledW / 2 - viewport.clientWidth / 2);
            viewport.scrollTop = Math.max(0, workspacePadding + scaledH / 2 - viewport.clientHeight / 2);
        };

        const needsInitialPlacement =
            viewport.scrollLeft === 0 &&
            viewport.scrollTop === 0 &&
            (workspacePadding > viewport.clientWidth / 2 || workspacePadding > viewport.clientHeight / 2);

        if (shouldCenterViewportRef.current || needsInitialPlacement) {
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
    }, [scale, scaledH, scaledW, workspacePadding]);

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
            const nextZoom = Math.min(Math.max(Number((zoom + direction * 0.1).toFixed(2)), 0.25), 3);
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

    return (
        <div className="canvas-workspace">
            <div
                ref={viewportRef}
                className={`canvas-workspace__viewport ${
                    isPanning
                        ? 'canvas-workspace__viewport--panning'
                        : spacePanActive
                            ? 'canvas-workspace__viewport--space-pan'
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
                    className="canvas-workspace__plane"
                    style={{ width: planeWidth, height: planeHeight }}
                >
                    <div
                        className={`canvas-workspace__canvas ${gridSnap ? 'canvas-workspace__canvas--grid' : ''}`}
                        style={{
                            left: workspacePadding,
                            top: workspacePadding,
                            width: scaledW,
                            height: scaledH,
                            backgroundSize: gridSnap ? `${gridSize * scale}px ${gridSize * scale}px` : undefined,
                        }}
                    >
                        {zones.length === 0 && (
                            <div className="canvas-workspace__empty">
                                <Layers size={40} className="canvas-workspace__empty-icon" />
                                <span>Add elements from the sidebar</span>
                                <span style={{ fontSize: 11 }}>{canvas.width} × {canvas.height}px</span>
                            </div>
                        )}

                        {orderedZones.map((zone) => (
                            <ZoneRenderer key={zone.id} zone={zone} scale={scale} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
