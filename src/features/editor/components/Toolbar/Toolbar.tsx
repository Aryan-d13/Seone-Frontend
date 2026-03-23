import { Grid3x3, ZoomIn, ZoomOut, RotateCcw, Layers, Maximize } from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';
import './Toolbar.css';

interface ToolbarProps {
    mode?: 'template' | 'clip';
}

export default function Toolbar({ mode = 'template' }: ToolbarProps) {
    const { template, zoom, setZoom, gridSnap, toggleGrid, activeManifest } = useTemplateStore();
    const { canvas, zones } = template;
    const manifestLoaded = mode === 'clip' && Boolean(activeManifest);

    return (
        <div className="toolbar">
            <div className="toolbar__group">
                <button
                    className={`toolbar__btn ${gridSnap ? 'toolbar__btn--active' : ''}`}
                    onClick={toggleGrid}
                    title="Toggle grid snap"
                >
                    <Grid3x3 size={16} />
                </button>
            </div>

            <div className="toolbar__separator" />

            <div className="toolbar__group">
                <button className="toolbar__btn" onClick={() => setZoom(zoom - 0.1)} title="Zoom out">
                    <ZoomOut size={16} />
                </button>
                <span className="toolbar__zoom-display">{Math.round(zoom * 100)}%</span>
                <button className="toolbar__btn" onClick={() => setZoom(zoom + 0.1)} title="Zoom in">
                    <ZoomIn size={16} />
                </button>
                <button className="toolbar__btn" onClick={() => setZoom(1)} title="Reset zoom">
                    <RotateCcw size={14} />
                </button>
            </div>

            <div className="toolbar__info">
                <span className="toolbar__info-item">
                    <Maximize size={12} />
                    {canvas.width}×{canvas.height}
                </span>
                <span className="toolbar__info-item">
                    <Layers size={12} />
                    {zones.length} {mode === 'clip' ? 'layers' : 'zones'}
                </span>
                {manifestLoaded && <span className="toolbar__info-item">Manifest loaded</span>}
                <span className={`toolbar__compositing-badge toolbar__compositing-badge--${mode === 'clip' ? 'clip' : template.compositing_mode}`}>
                    {mode === 'clip' ? 'clip' : template.compositing_mode}
                </span>
            </div>
        </div>
    );
}
