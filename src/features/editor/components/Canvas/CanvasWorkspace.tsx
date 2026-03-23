import { useMemo } from 'react';
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
    const { template, selectZone, gridSnap, gridSize } = useTemplateStore();
    const { canvas, zones } = template;

    // Calculate scale to fit canvas within viewport (target ~600px max)
    const maxViewportSize = 620;
    const scale = useMemo(() => {
        const maxDim = Math.max(canvas.width, canvas.height);
        return Math.min(1, maxViewportSize / maxDim);
    }, [canvas.width, canvas.height]);

    const scaledW = canvas.width * scale;
    const scaledH = canvas.height * scale;

    return (
        <div className="canvas-workspace">
            <div className="canvas-workspace__viewport">
                <div
                    className={`canvas-workspace__canvas ${gridSnap ? 'canvas-workspace__canvas--grid' : ''}`}
                    style={{
                        width: scaledW,
                        height: scaledH,
                        backgroundSize: gridSnap ? `${gridSize * scale}px ${gridSize * scale}px` : undefined,
                    }}
                    onClick={() => selectZone(null)}
                >
                    {zones.length === 0 && (
                        <div className="canvas-workspace__empty">
                            <Layers size={40} className="canvas-workspace__empty-icon" />
                            <span>Add elements from the sidebar</span>
                            <span style={{ fontSize: 11 }}>{canvas.width} × {canvas.height}px</span>
                        </div>
                    )}

                    {zones.map((zone) => (
                        <ZoneRenderer key={zone.id} zone={zone} scale={scale} />
                    ))}
                </div>
            </div>
        </div>
    );
}
