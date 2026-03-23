import { useState } from 'react';
import {
    X, Maximize, Layers, Clock, AlertTriangle,
} from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';
import { exportTemplate } from '../../utils/exportTemplate';
import './PreviewPanel.css';

interface PreviewResult {
    success: boolean;
    error?: string;
    frames?: string[];
    framesBase64?: string[];
    template_id?: string;
    canvas?: { width: number; height: number };
    zone_count?: number;
    duration?: number;
}

interface Props {
    onClose: () => void;
}

/**
 * Preview panel — full-screen overlay that renders template via Python pipeline.
 *
 * 1. Sends template JSON + video path to /api/preview (Vite middleware)
 * 2. Middleware spawns preview.py which runs the rendering_v1 pipeline
 * 3. Returns PNG still frames displayed in a grid
 */
export default function PreviewPanel({ onClose }: Props) {
    const { template } = useTemplateStore();

    const [videoPath, setVideoPath] = useState('template-builder/sample.mp4');
    const [povText, setPovText] = useState('प्रीव्यू टेक्स्ट | Preview Text');
    const [copyLanguage, setCopyLanguage] = useState<'hi' | 'en'>('hi');
    const [numFrames, setNumFrames] = useState(3);

    const [status, setStatus] = useState<'idle' | 'validating' | 'rendering' | 'done' | 'error'>('idle');
    const [result, setResult] = useState<PreviewResult | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const handleValidate = async () => {
        setStatus('validating');
        setResult(null);
        setErrorMsg('');

        try {
            const templateJSON = JSON.parse(exportTemplate(template));
            const response = await fetch('/api/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template: templateJSON }),
            });

            const data = await response.json();
            setResult(data);
            setStatus(data.success ? 'done' : 'error');
            if (!data.success) setErrorMsg(data.error || 'Validation failed');
        } catch (err) {
            setStatus('error');
            setErrorMsg(String(err));
        }
    };

    const handleRender = async () => {
        setStatus('rendering');
        setResult(null);
        setErrorMsg('');

        try {
            const templateJSON = JSON.parse(exportTemplate(template));
            const response = await fetch('/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: templateJSON,
                    videoPath,
                    frames: numFrames,
                    povText,
                    copyLanguage,
                }),
            });

            const data = await response.json();
            setResult(data);
            setStatus(data.success ? 'done' : 'error');
            if (!data.success) setErrorMsg(data.error || 'Render failed');
        } catch (err) {
            setStatus('error');
            setErrorMsg(String(err));
        }
    };

    const statusLabel = {
        idle: null,
        validating: 'Validating…',
        rendering: 'Rendering…',
        done: 'Complete',
        error: 'Failed',
    };

    const statusClass = {
        idle: '',
        validating: 'preview-panel__status--loading',
        rendering: 'preview-panel__status--loading',
        done: 'preview-panel__status--success',
        error: 'preview-panel__status--error',
    };

    return (
        <div className="preview-panel" onClick={onClose}>
            <div className="preview-panel__inner" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="preview-panel__header">
                    <div className="preview-panel__title">
                        Template Preview
                        {statusLabel[status] && (
                            <span className={`preview-panel__status ${statusClass[status]}`}>
                                {statusLabel[status]}
                            </span>
                        )}
                    </div>
                    <button className="preview-panel__close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="preview-panel__body">
                    {/* Loading state */}
                    {(status === 'validating' || status === 'rendering') && (
                        <div className="preview-panel__loading">
                            <div className="preview-panel__spinner" />
                            <span>{status === 'validating' ? 'Validating template schema…' : 'Running rendering pipeline…'}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                This may take 10-30 seconds for full renders
                            </span>
                        </div>
                    )}

                    {/* Error state */}
                    {status === 'error' && (
                        <div className="preview-panel__error">
                            <AlertTriangle size={28} />
                            <span>Preview Failed</span>
                            {errorMsg && (
                                <div className="preview-panel__error-details">{errorMsg}</div>
                            )}
                        </div>
                    )}

                    {/* Idle state */}
                    {status === 'idle' && (
                        <div className="preview-panel__loading" style={{ color: 'var(--text-secondary)' }}>
                            <span style={{ fontSize: 14 }}>Configure settings below, then click Validate or Render</span>
                        </div>
                    )}

                    {/* Success state — frames */}
                    {status === 'done' && result?.success && (
                        <>
                            {result.framesBase64 && result.framesBase64.length > 0 && (
                                <div className="preview-panel__frames">
                                    {result.framesBase64.map((src, i) => (
                                        <div key={i} className="preview-panel__frame">
                                            <img src={src} alt={`Frame ${i}`} />
                                            <div className="preview-panel__frame-label">
                                                Frame {i + 1} / {result.framesBase64!.length}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="preview-panel__meta">
                                {result.template_id && (
                                    <span className="preview-panel__meta-item">
                                        <Layers size={12} /> {result.template_id}
                                    </span>
                                )}
                                {result.canvas && (
                                    <span className="preview-panel__meta-item">
                                        <Maximize size={12} /> {result.canvas.width}×{result.canvas.height}
                                    </span>
                                )}
                                {result.zone_count !== undefined && (
                                    <span className="preview-panel__meta-item">
                                        {result.zone_count} zones
                                    </span>
                                )}
                                {result.duration !== undefined && (
                                    <span className="preview-panel__meta-item">
                                        <Clock size={12} /> {result.duration.toFixed(1)}s
                                    </span>
                                )}
                            </div>

                            {/* Validation-only success (no frames) */}
                            {!result.framesBase64 && (
                                <div className="preview-panel__loading" style={{ color: 'var(--success)' }}>
                                    <span style={{ fontSize: 14 }}>✓ Template schema is valid</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Settings */}
                <div className="preview-panel__settings">
                    <div className="preview-panel__setting-field">
                        <span>Video</span>
                        <input
                            type="text"
                            className="preview-panel__setting-input"
                            value={videoPath}
                            onChange={(e) => setVideoPath(e.target.value)}
                            placeholder="path/to/sample.mp4"
                        />
                    </div>
                    <div className="preview-panel__setting-field">
                        <span>Text</span>
                        <input
                            type="text"
                            className="preview-panel__setting-input"
                            value={povText}
                            onChange={(e) => setPovText(e.target.value)}
                        />
                    </div>
                    <div className="preview-panel__setting-field">
                        <span>Lang</span>
                        <select
                            className="preview-panel__setting-input preview-panel__setting-input--small"
                            value={copyLanguage}
                            onChange={(e) => setCopyLanguage(e.target.value as 'hi' | 'en')}
                        >
                            <option value="hi">Hindi</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                    <div className="preview-panel__setting-field">
                        <span>Frames</span>
                        <input
                            type="number"
                            className="preview-panel__setting-input preview-panel__setting-input--small"
                            value={numFrames}
                            min={1}
                            max={10}
                            onChange={(e) => setNumFrames(Number(e.target.value) || 3)}
                        />
                    </div>

                    <button
                        className="preview-panel__render-btn"
                        style={{ background: 'var(--bg-hover)', marginLeft: 0 }}
                        onClick={handleValidate}
                        disabled={status === 'validating' || status === 'rendering'}
                    >
                        Validate
                    </button>
                    <button
                        className="preview-panel__render-btn"
                        onClick={handleRender}
                        disabled={status === 'validating' || status === 'rendering'}
                    >
                        Render Preview
                    </button>
                </div>
            </div>
        </div>
    );
}
