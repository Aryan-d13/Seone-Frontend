/**
 * ManifestLoader — Load a render manifest to hydrate the editor.
 *
 * Supports:
 * 1. File drop / file picker (JSON file)
 * 2. Paste JSON directly into a textarea
 * 3. URL fetch (paste a manifest URL)
 */

import { useState, useCallback, useRef } from 'react';
import { FileDown, ClipboardPaste, Link, X, AlertCircle, Check } from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';
import type { RenderManifest } from '../../types/manifest';
import './ManifestLoader.css';

interface ManifestLoaderProps {
    onClose: () => void;
}

export default function ManifestLoader({ onClose }: ManifestLoaderProps) {
    const { loadFromManifest } = useTemplateStore();
    const [mode, setMode] = useState<'file' | 'paste' | 'url'>('file');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [urlText, setUrlText] = useState('');
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const validate = useCallback((data: unknown): RenderManifest => {
        const obj = data as Record<string, unknown>;
        if (!obj.manifest_version) throw new Error('Not a valid manifest: missing manifest_version');
        if (!obj.template_ir) throw new Error('Not a valid manifest: missing template_ir');
        return obj as unknown as RenderManifest;
    }, []);

    const handleLoad = useCallback((jsonStr: string) => {
        setError(null);
        try {
            const parsed = JSON.parse(jsonStr);
            const manifest = validate(parsed);
            loadFromManifest(manifest);
            setSuccess(true);
            setTimeout(() => onClose(), 600);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Invalid JSON');
        }
    }, [loadFromManifest, validate, onClose]);

    const handleFileDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        file.text().then(handleLoad).catch(() => setError('Could not read file'));
    }, [handleLoad]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        file.text().then(handleLoad).catch(() => setError('Could not read file'));
    }, [handleLoad]);

    const handleUrlFetch = useCallback(async () => {
        setError(null);
        if (!urlText.trim()) return;
        try {
            const res = await fetch(urlText.trim());
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            handleLoad(text);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Fetch failed');
        }
    }, [urlText, handleLoad]);

    return (
        <div className="manifest-loader__backdrop" onClick={onClose}>
            <div className="manifest-loader" onClick={(e) => e.stopPropagation()}>
                <div className="manifest-loader__header">
                    <h3 className="manifest-loader__title">Load Render Manifest</h3>
                    <button className="manifest-loader__close" onClick={onClose} type="button">
                        <X size={16} />
                    </button>
                </div>

                {/* Mode tabs */}
                <div className="manifest-loader__tabs">
                    <button
                        className={`manifest-loader__tab ${mode === 'file' ? 'manifest-loader__tab--active' : ''}`}
                        onClick={() => setMode('file')}
                        type="button"
                    >
                        <FileDown size={13} /> File
                    </button>
                    <button
                        className={`manifest-loader__tab ${mode === 'paste' ? 'manifest-loader__tab--active' : ''}`}
                        onClick={() => setMode('paste')}
                        type="button"
                    >
                        <ClipboardPaste size={13} /> Paste
                    </button>
                    <button
                        className={`manifest-loader__tab ${mode === 'url' ? 'manifest-loader__tab--active' : ''}`}
                        onClick={() => setMode('url')}
                        type="button"
                    >
                        <Link size={13} /> URL
                    </button>
                </div>

                {/* Content */}
                <div className="manifest-loader__body">
                    {mode === 'file' && (
                        <div
                            className={`manifest-loader__dropzone ${dragging ? 'manifest-loader__dropzone--active' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleFileDrop}
                            onClick={() => fileRef.current?.click()}
                        >
                            <FileDown size={28} style={{ opacity: 0.3 }} />
                            <span>Drop a manifest JSON here or click to browse</span>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".json,application/json"
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                        </div>
                    )}

                    {mode === 'paste' && (
                        <>
                            <textarea
                                className="manifest-loader__textarea"
                                placeholder='Paste manifest JSON here...'
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                rows={10}
                            />
                            <button
                                className="manifest-loader__action"
                                onClick={() => handleLoad(pasteText)}
                                type="button"
                                disabled={!pasteText.trim()}
                            >
                                Load Manifest
                            </button>
                        </>
                    )}

                    {mode === 'url' && (
                        <>
                            <input
                                className="manifest-loader__url-input"
                                type="url"
                                placeholder="https://api.example.com/render/.../manifest"
                                value={urlText}
                                onChange={(e) => setUrlText(e.target.value)}
                            />
                            <button
                                className="manifest-loader__action"
                                onClick={handleUrlFetch}
                                type="button"
                                disabled={!urlText.trim()}
                            >
                                Fetch & Load
                            </button>
                        </>
                    )}
                </div>

                {/* Status */}
                {error && (
                    <div className="manifest-loader__error">
                        <AlertCircle size={14} />
                        {error}
                    </div>
                )}
                {success && (
                    <div className="manifest-loader__success">
                        <Check size={14} />
                        Manifest loaded successfully
                    </div>
                )}
            </div>
        </div>
    );
}
