import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Lock, Trash2, Unlock, Upload } from 'lucide-react';
import { authFetch } from '@/services/auth';
import { endpoints, getMediaUrl } from '@/lib/config';
import { useTemplateStore } from '../../store/templateStore';
import type { ZoneSpec, TextSpec, MediaSpec } from '../../types/template';
import type { StudioCopySuggestionsResponse } from '../../types/manifest';
import { LOCAL_PREVIEW_ENABLED } from '../../lib/featureFlags';
import type { RenderPreviewRequest } from '../RenderPreview/RenderPreview';
import { hasForcedAutoHeight } from '../../utils/zoneRules';
import { getAssetPreviewUrl } from '../../utils/assetPreview';
import FontPicker from './FontPicker';
import './PropertyInspector.css';

interface PropertyInspectorProps {
    renderPreviewRequest?: RenderPreviewRequest | null;
}

function getClipZoneTitle(zone: ZoneSpec, previewTexts: Record<string, string>): string {
    if (zone.type === 'video') return 'Video';
    if (zone.type === 'shape') return 'Background';
    if (zone.type === 'image') return zone.role === 'logo' ? 'Logo' : 'Image';
    if (zone.content_ref && previewTexts[zone.content_ref]?.trim()) {
        return previewTexts[zone.content_ref].trim();
    }
    return 'Text';
}

function getZoneTypeLabel(zone: ZoneSpec): string {
    if (zone.type === 'shape') return 'shape';
    if (zone.type === 'image' && zone.role === 'logo') return 'logo';
    return zone.type;
}

export default function PropertyInspector({ renderPreviewRequest = null }: PropertyInspectorProps) {
    const { template, selectedZoneId, activeManifest } = useTemplateStore();
    const zone = template.zones.find((entry) => entry.id === selectedZoneId) ?? null;

    if (!zone) {
        if (activeManifest) return null;
        return <TemplateCanvasInspector />;
    }

    return activeManifest
        ? <ClipZoneInspector zone={zone} renderPreviewRequest={renderPreviewRequest} />
        : <TemplateZoneInspector zone={zone} renderPreviewRequest={renderPreviewRequest} />;
}

function TemplateCanvasInspector() {
    const { template, setCanvasSize, setTemplateId, setStyle, setCompositingMode } = useTemplateStore();

    return (
        <aside className="inspector">
            <div className="inspector__header">
                <div className="inspector__heading">
                    <span className="inspector__eyebrow">Inspector</span>
                    <span className="inspector__title">Canvas</span>
                </div>
            </div>

            <div className="inspector__section">
                <div className="inspector__section-title">Canvas</div>
                <div className="inspector__field">
                    <span className="inspector__label">Width</span>
                    <input
                        type="number"
                        className="inspector__input inspector__input--small"
                        value={template.canvas.width}
                        onChange={(e) => setCanvasSize(Number(e.target.value) || 1080, template.canvas.height)}
                    />
                </div>
                <div className="inspector__field">
                    <span className="inspector__label">Height</span>
                    <input
                        type="number"
                        className="inspector__input inspector__input--small"
                        value={template.canvas.height}
                        onChange={(e) => setCanvasSize(template.canvas.width, Number(e.target.value) || 1080)}
                    />
                </div>
                <div className="inspector__field">
                    <span className="inspector__label">ID</span>
                    <input
                        type="text"
                        className="inspector__input"
                        value={template.id}
                        onChange={(e) => setTemplateId(e.target.value)}
                    />
                </div>
                <div className="inspector__field">
                    <span className="inspector__label">Compositing</span>
                    <select
                        className="inspector__select"
                        value={template.compositing_mode}
                        onChange={(e) => setCompositingMode(e.target.value as 'stack' | 'overlay')}
                    >
                        <option value="stack">Stack</option>
                        <option value="overlay">Overlay</option>
                    </select>
                </div>
            </div>

            <div className="inspector__section">
                <div className="inspector__section-title">Styles</div>
                {Object.entries(template.styles).map(([key, style]) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                        <div
                            style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                marginBottom: 6,
                                fontFamily: 'var(--font-mono)',
                            }}
                        >
                            {key}
                        </div>
                        <div className="inspector__row">
                            <div className="inspector__field" style={{ flex: 1 }}>
                                <span className="inspector__label">Fill</span>
                                <input
                                    type="color"
                                    className="inspector__input inspector__input--color"
                                    value={style.fill || '#000000'}
                                    onChange={(e) => setStyle(key, { ...style, fill: e.target.value })}
                                />
                                <input
                                    type="text"
                                    className="inspector__input"
                                    value={style.fill || '#000000'}
                                    onChange={(e) => setStyle(key, { ...style, fill: e.target.value })}
                                    style={{ maxWidth: 80 }}
                                />
                            </div>
                        </div>
                        <div className="inspector__row" style={{ marginTop: 4 }}>
                            <div className="inspector__field" style={{ flex: 1 }}>
                                <span className="inspector__label">Bg</span>
                                <input
                                    type="color"
                                    className="inspector__input inspector__input--color"
                                    value={style.bg_fill || '#FFFFFF'}
                                    onChange={(e) => setStyle(key, { ...style, bg_fill: e.target.value })}
                                />
                                <input
                                    type="text"
                                    className="inspector__input"
                                    value={style.bg_fill || '#FFFFFF'}
                                    onChange={(e) => setStyle(key, { ...style, bg_fill: e.target.value })}
                                    style={{ maxWidth: 80 }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}

function TemplateZoneInspector({
    zone,
    renderPreviewRequest = null,
}: {
    zone: ZoneSpec;
    renderPreviewRequest?: RenderPreviewRequest | null;
}) {
    const { template, updateZone, reorderZone, duplicateZone, toggleLock, isLocked, removeZone } = useTemplateStore();
    const locked = isLocked(zone.id);

    return (
        <aside className="inspector">
            <InspectorHeader title={zone.id} zone={zone} />

            <div className="inspector__section">
                <div className="inspector__section-title">Identity</div>
                <div className="inspector__field">
                    <span className="inspector__label">ID</span>
                    <input
                        type="text"
                        className="inspector__input"
                        value={zone.id}
                        onChange={(e) => updateZone(zone.id, { id: e.target.value })}
                    />
                </div>
                <div className="inspector__field">
                    <span className="inspector__label">Z-Index</span>
                    <input
                        type="number"
                        className="inspector__input inspector__input--small"
                        value={zone.z}
                        onChange={(e) => reorderZone(zone.id, Number(e.target.value) || 0)}
                    />
                </div>
                {zone.content_ref !== undefined && (
                    <div className="inspector__field">
                        <span className="inspector__label">Content Ref</span>
                        <input
                            type="text"
                            className="inspector__input"
                            value={zone.content_ref || ''}
                            onChange={(e) => updateZone(zone.id, { content_ref: e.target.value })}
                        />
                    </div>
                )}
                {zone.style_ref !== undefined && (
                    <div className="inspector__field">
                        <span className="inspector__label">Style Ref</span>
                        <select
                            className="inspector__select"
                            value={zone.style_ref || ''}
                            onChange={(e) => updateZone(zone.id, { style_ref: e.target.value || undefined })}
                        >
                            <option value="">None</option>
                            {Object.keys(template.styles).map((key) => (
                                <option key={key} value={key}>{key}</option>
                            ))}
                        </select>
                    </div>
                )}
                {zone.asset_ref !== undefined && (
                    <div className="inspector__field">
                        <span className="inspector__label">Asset Ref</span>
                        <input
                            type="text"
                            className="inspector__input"
                            value={zone.asset_ref || ''}
                            onChange={(e) => updateZone(zone.id, { asset_ref: e.target.value })}
                        />
                    </div>
                )}
                {zone.type === 'image' && (
                    <div className="inspector__field">
                        <span className="inspector__label">Role</span>
                        <input
                            type="text"
                            className="inspector__input"
                            value={zone.role || ''}
                            onChange={(e) => updateZone(zone.id, { role: e.target.value || undefined })}
                        />
                    </div>
                )}
            </div>

            <BoundsEditor zone={zone} title="Bounds" />
            <TextColorsEditor zone={zone} />
            {zone.type === 'text' && zone.text && <TextSpecEditor zone={zone} minimal={false} />}
            {zone.type === 'video' && zone.media && <MediaSpecEditor zone={zone} />}
            {zone.type === 'image' && <ImageUploadEditor zone={zone} renderPreviewRequest={renderPreviewRequest} minimal={false} />}

            <div className="inspector__actions">
                <button className="inspector__action-btn" onClick={() => duplicateZone(zone.id)}>
                    <Copy size={14} /> Duplicate
                </button>
                <button className="inspector__action-btn" onClick={() => toggleLock(zone.id)}>
                    {locked ? <Unlock size={14} /> : <Lock size={14} />}
                    {locked ? 'Unlock' : 'Lock'}
                </button>
                <button className="inspector__action-btn inspector__action-btn--danger" onClick={() => removeZone(zone.id)}>
                    <Trash2 size={14} /> Delete
                </button>
            </div>
        </aside>
    );
}

function ClipZoneInspector({
    zone,
    renderPreviewRequest = null,
}: {
    zone: ZoneSpec;
    renderPreviewRequest?: RenderPreviewRequest | null;
}) {
    const {
        activeManifest,
        previewTexts,
        updateManifestRenderPayload,
    } = useTemplateStore();
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        setShowAdvanced(false);
    }, [zone.id]);

    return (
        <aside className="inspector">
            <div className="inspector__header inspector__header--compact">
                <div className="inspector__heading">
                    <span className="inspector__title">{getClipZoneTitle(zone, previewTexts)}</span>
                </div>
            </div>

            {zone.type === 'text' && <TextColorsEditor zone={zone} />}
            {zone.type === 'text' && zone.text && (
                <TextSpecEditor zone={zone} minimal renderPreviewRequest={renderPreviewRequest} />
            )}
            {zone.type === 'video' && zone.media && <MediaSpecEditor zone={zone} />}
            {zone.type === 'image' && (
                <ImageUploadEditor zone={zone} renderPreviewRequest={renderPreviewRequest} minimal />
            )}

            {zone.type === 'video' && (
                <div className="inspector__section">
                    <div className="inspector__section-title">Trim</div>
                    <div className="inspector__row">
                        <div className="inspector__field" style={{ flex: 1 }}>
                            <span className="inspector__label">Source In</span>
                            <input
                                type="number"
                                step="0.1"
                                className="inspector__input inspector__input--small"
                                value={activeManifest?.render_payload?.time_window?.start ?? 0}
                                onChange={(e) => {
                                    const nextStart = Math.max(0, Number(e.target.value) || 0);
                                    const currentEnd = activeManifest?.render_payload?.time_window?.end ?? Math.max(nextStart + 0.1, 0.1);
                                    updateManifestRenderPayload({
                                        time_window: {
                                            start: Math.min(nextStart, currentEnd - 0.1),
                                            end: currentEnd,
                                        },
                                    });
                                }}
                            />
                        </div>
                        <div className="inspector__field" style={{ flex: 1 }}>
                            <span className="inspector__label">Source Out</span>
                            <input
                                type="number"
                                step="0.1"
                                className="inspector__input inspector__input--small"
                                value={activeManifest?.render_payload?.time_window?.end ?? 0}
                                onChange={(e) => {
                                    const currentStart = activeManifest?.render_payload?.time_window?.start ?? 0;
                                    const nextEnd = Math.max(currentStart + 0.1, Number(e.target.value) || 0.1);
                                    updateManifestRenderPayload({
                                        time_window: {
                                            start: currentStart,
                                            end: nextEnd,
                                        },
                                    });
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="inspector__section inspector__section--compact">
                <button
                    type="button"
                    className="inspector__toggle-btn"
                    onClick={() => setShowAdvanced((value) => !value)}
                >
                    <span>Advanced</span>
                    {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>
            {showAdvanced && <BoundsEditor zone={zone} title="Position & Size" />}
        </aside>
    );
}

function InspectorHeader({ title, zone }: { title: string; zone: ZoneSpec }) {
    return (
        <div className="inspector__header">
            <div className="inspector__heading">
                <span className="inspector__eyebrow">Inspector</span>
                <span className="inspector__title">{title}</span>
            </div>
            <span className={`inspector__zone-type inspector__zone-type--${zone.type}`}>
                {getZoneTypeLabel(zone)}
            </span>
        </div>
    );
}

function BoundsEditor({ zone, title }: { zone: ZoneSpec; title: string }) {
    const { updateZoneBounds, updateZone } = useTemplateStore();
    const forcedAutoHeight = hasForcedAutoHeight(zone);

    return (
        <div className="inspector__section">
            <div className="inspector__section-title">{title}</div>
            <div className="inspector__row">
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">X</span>
                    <input
                        type="number"
                        className="inspector__input inspector__input--small"
                        value={Number(zone.bounds.x)}
                        onChange={(e) => updateZoneBounds(zone.id, { x: Number(e.target.value) || 0 })}
                    />
                </div>
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">Y</span>
                    <input
                        type="number"
                        className="inspector__input inspector__input--small"
                        value={Number(zone.bounds.y)}
                        onChange={(e) => updateZoneBounds(zone.id, { y: Number(e.target.value) || 0 })}
                    />
                </div>
            </div>
            <div className="inspector__row">
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">W</span>
                    <input
                        type="number"
                        className="inspector__input inspector__input--small"
                        value={Number(zone.bounds.width)}
                        onChange={(e) => updateZoneBounds(zone.id, { width: Number(e.target.value) || 10 })}
                    />
                </div>
                {!forcedAutoHeight && (
                    <div className="inspector__field" style={{ flex: 1 }}>
                        <span className="inspector__label">H</span>
                        <input
                            type="number"
                            className="inspector__input inspector__input--small"
                            value={zone.bounds.height !== undefined ? Number(zone.bounds.height) : ''}
                            placeholder="auto"
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value === '') {
                                    updateZone(zone.id, {
                                        bounds: { x: zone.bounds.x, y: zone.bounds.y, width: zone.bounds.width },
                                    });
                                    return;
                                }
                                updateZoneBounds(zone.id, { height: Number(value) || 10 });
                            }}
                        />
                    </div>
                )}
            </div>
            {forcedAutoHeight && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    Height follows the image aspect ratio
                </div>
            )}
            {!forcedAutoHeight && zone.bounds.height === undefined && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    Height auto-calculated from image aspect ratio
                </div>
            )}
        </div>
    );
}

function TextColorsEditor({ zone }: { zone: ZoneSpec }) {
    const { template, setStyle, activeManifest } = useTemplateStore();
    if (!zone.style_ref || !template.styles[zone.style_ref]) return null;
    const backgroundZone =
        activeManifest
            ? template.zones.find((entry) => entry.id === `${zone.id}__bg` && entry.type === 'shape')
            : null;
    const backgroundStyle =
        backgroundZone?.style_ref ? template.styles[backgroundZone.style_ref] : null;

    return (
        <div className="inspector__section">
            <div className="inspector__section-title">Appearance</div>
            <div className="inspector__row">
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">Text</span>
                    <div className="inspector__color-row">
                        <input
                            type="color"
                            className="inspector__input inspector__input--color"
                            value={template.styles[zone.style_ref].fill || '#000000'}
                            onChange={(e) =>
                                setStyle(zone.style_ref!, { ...template.styles[zone.style_ref!], fill: e.target.value })
                            }
                        />
                        <input
                            type="text"
                            className="inspector__input"
                            value={template.styles[zone.style_ref].fill || '#000000'}
                            onChange={(e) =>
                                setStyle(zone.style_ref!, { ...template.styles[zone.style_ref!], fill: e.target.value })
                            }
                            style={{ maxWidth: 72, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                        />
                    </div>
                </div>
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">Background</span>
                    <div className="inspector__color-row">
                        <input
                            type="color"
                            className="inspector__input inspector__input--color"
                            value={backgroundStyle?.fill || template.styles[zone.style_ref].bg_fill || '#FFFFFF'}
                            onChange={(e) =>
                                backgroundZone?.style_ref
                                    ? setStyle(backgroundZone.style_ref, { ...(backgroundStyle || {}), fill: e.target.value })
                                    : setStyle(zone.style_ref!, { ...template.styles[zone.style_ref!], bg_fill: e.target.value })
                            }
                        />
                        <input
                            type="text"
                            className="inspector__input"
                            value={backgroundStyle?.fill || template.styles[zone.style_ref].bg_fill || '#FFFFFF'}
                            onChange={(e) =>
                                backgroundZone?.style_ref
                                    ? setStyle(backgroundZone.style_ref, { ...(backgroundStyle || {}), fill: e.target.value })
                                    : setStyle(zone.style_ref!, { ...template.styles[zone.style_ref!], bg_fill: e.target.value })
                            }
                            style={{ maxWidth: 72, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function TextSpecEditor({
    zone,
    minimal = false,
    renderPreviewRequest = null,
}: {
    zone: ZoneSpec;
    minimal?: boolean;
    renderPreviewRequest?: RenderPreviewRequest | null;
}) {
    const { updateZone, previewTexts, setPreviewText, aiCopySessions, updateAICopySession } = useTemplateStore();
    const text = zone.text!;
    const contentRef = zone.content_ref || '';
    const previewText = contentRef ? previewTexts[contentRef] || '' : '';
    const aiCopyEnabled = Boolean(renderPreviewRequest && contentRef === 'pov_text');
    const aiCopyState = aiCopyEnabled
        ? aiCopySessions[contentRef] ?? {
            options: [],
            rejected: [],
            loading: false,
            error: null,
            copyLanguage: null,
        }
        : null;

    const patchText = (patch: Partial<TextSpec>) => {
        updateZone(zone.id, { text: { ...text, ...patch } });
    };

    const handleGenerateSuggestions = async (mode: 'generate' | 'regenerate') => {
        if (!renderPreviewRequest || !contentRef) return;

        const rejectedOptions =
            mode === 'regenerate'
                ? Array.from(new Set([...(aiCopyState?.rejected || []), ...(aiCopyState?.options || [])]))
                : aiCopyState?.rejected || [];

        updateAICopySession(contentRef, {
            loading: true,
            error: null,
            rejected: rejectedOptions,
        });

        try {
            const response = await authFetch(
                endpoints.jobs.copySuggestions(renderPreviewRequest.jobId, renderPreviewRequest.clipIndex),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        current_text: previewText,
                        rejected_options: rejectedOptions,
                    }),
                },
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.detail || `HTTP ${response.status}`);
            }

            const payload = (await response.json()) as StudioCopySuggestionsResponse;
            if (!Array.isArray(payload.options) || payload.options.length !== 3) {
                throw new Error('AI copy returned an invalid response');
            }

            updateAICopySession(contentRef, {
                loading: false,
                error: null,
                options: payload.options,
                rejected: rejectedOptions,
                copyLanguage: payload.copy_language,
            });
        } catch (error) {
            updateAICopySession(contentRef, {
                loading: false,
                error: error instanceof Error ? error.message : 'Failed to generate AI POV suggestions',
                rejected: rejectedOptions,
            });
        }
    };

    return (
        <div className="inspector__section">
            <div className="inspector__section-title">Text</div>
            {contentRef && (
                <div className="inspector__field">
                    <span className="inspector__label">Content</span>
                    <textarea
                        className="inspector__input"
                        value={previewText}
                        onChange={(e) => setPreviewText(contentRef, e.target.value)}
                        rows={2}
                        style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                    />
                </div>
            )}
            <div className="inspector__field">
                <span className="inspector__label">Font</span>
                <FontPicker
                    value={text.font.family}
                    weight={text.font.weight}
                    onChange={(family) => patchText({ font: { ...text.font, family } })}
                    onWeightChange={(weight) => patchText({ font: { ...text.font, weight } })}
                />
            </div>
            <div className="inspector__row">
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">Size</span>
                    <input
                        type="number"
                        className="inspector__input inspector__input--small"
                        value={text.font.size ?? ''}
                        onChange={(e) => patchText({ font: { ...text.font, size: Number(e.target.value) || null } })}
                    />
                </div>
            </div>
            <div className="inspector__row">
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">H Align</span>
                    <select
                        className="inspector__select"
                        value={text.horizontal_align}
                        onChange={(e) => patchText({ horizontal_align: e.target.value as TextSpec['horizontal_align'] })}
                    >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                    </select>
                </div>
                <div className="inspector__field" style={{ flex: 1 }}>
                    <span className="inspector__label">V Align</span>
                    <select
                        className="inspector__select"
                        value={text.vertical_align}
                        onChange={(e) => patchText({ vertical_align: e.target.value as TextSpec['vertical_align'] })}
                    >
                        <option value="top">Top</option>
                        <option value="middle">Middle</option>
                        <option value="bottom">Bottom</option>
                    </select>
                </div>
            </div>
            {!minimal && (
                <>
                    <div className="inspector__row">
                        <div className="inspector__field" style={{ flex: 1 }}>
                            <span className="inspector__label">Lines</span>
                            <input
                                type="number"
                                className="inspector__input inspector__input--small"
                                value={text.max_lines}
                                onChange={(e) => patchText({ max_lines: Number(e.target.value) || 1 })}
                                min={1}
                            />
                        </div>
                        <div className="inspector__field" style={{ flex: 1 }}>
                            <span className="inspector__label">Overflow</span>
                            <select
                                className="inspector__select"
                                value={text.overflow}
                                onChange={(e) => patchText({ overflow: e.target.value as TextSpec['overflow'] })}
                            >
                                <option value="wrap">Wrap</option>
                                <option value="shrink">Shrink</option>
                            </select>
                        </div>
                    </div>
                    <div className="inspector__row">
                        <div className="inspector__field" style={{ flex: 1 }}>
                            <span className="inspector__label">Width %</span>
                            <input
                                type="number"
                                className="inspector__input inspector__input--small"
                                value={text.width_percent ?? ''}
                                onChange={(e) => patchText({ width_percent: Number(e.target.value) || null })}
                            />
                        </div>
                        <div className="inspector__field" style={{ flex: 1 }}>
                            <span className="inspector__label">Min Size</span>
                            <input
                                type="number"
                                className="inspector__input inspector__input--small"
                                value={text.min_font_size ?? ''}
                                onChange={(e) => patchText({ min_font_size: Number(e.target.value) || null })}
                            />
                        </div>
                    </div>
                    <div className="inspector__field">
                        <span className="inspector__label">Spacing</span>
                        <input
                            type="number"
                            className="inspector__input inspector__input--small"
                            value={text.line_spacing_px}
                            onChange={(e) => patchText({ line_spacing_px: Number(e.target.value) || 0 })}
                        />
                    </div>
                </>
            )}
            {aiCopyEnabled && aiCopyState && (
                <div className="inspector__ai-copy">
                    <div className="inspector__ai-copy-header">
                        <span className="inspector__section-title" style={{ marginBottom: 0 }}>AI Copy</span>
                        {aiCopyState.copyLanguage && (
                            <span className="inspector__ai-copy-language">
                                {aiCopyState.copyLanguage.toUpperCase()}
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        className="inspector__action-btn inspector__ai-copy-trigger"
                        onClick={() => handleGenerateSuggestions('generate')}
                        disabled={aiCopyState.loading}
                    >
                        {aiCopyState.loading ? 'Generating...' : 'Generate 3 POVs'}
                    </button>

                    {aiCopyState.options.length > 0 && (
                        <div className="inspector__ai-copy-list">
                            {aiCopyState.options.map((option, index) => (
                                <div key={`${option}-${index}`} className="inspector__ai-copy-card">
                                    <div className="inspector__ai-copy-text">{option}</div>
                                    <button
                                        type="button"
                                        className="inspector__action-btn inspector__ai-copy-use"
                                        onClick={() => setPreviewText(contentRef, option)}
                                    >
                                        Use
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {aiCopyState.options.length > 0 && (
                        <div className="inspector__ai-copy-actions">
                            <button
                                type="button"
                                className="inspector__action-btn"
                                onClick={() => handleGenerateSuggestions('regenerate')}
                                disabled={aiCopyState.loading}
                            >
                                Regenerate
                            </button>
                        </div>
                    )}

                    {aiCopyState.error && (
                        <div className="inspector__ai-copy-error">{aiCopyState.error}</div>
                    )}
                </div>
            )}
        </div>
    );
}

function MediaSpecEditor({ zone }: { zone: ZoneSpec }) {
    const { updateZone } = useTemplateStore();
    const media = zone.media!;
    const cropFocus = media.crop_focus ?? { x: 0.5, y: 0.5 };

    const patchMedia = (patch: Partial<MediaSpec>) => {
        updateZone(zone.id, { media: { ...media, ...patch } });
    };

    return (
        <div className="inspector__section">
            <div className="inspector__section-title">Video</div>
            <div className="inspector__field">
                <span className="inspector__label">Fit</span>
                <select
                    className="inspector__select"
                    value={media.fit}
                    onChange={(e) => patchMedia({ fit: e.target.value as MediaSpec['fit'] })}
                >
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                </select>
            </div>
            <div className="inspector__field">
                <span className="inspector__label">Anchor</span>
                <select
                    className="inspector__select"
                    value={media.crop_anchor}
                    onChange={(e) => patchMedia({ crop_anchor: e.target.value as MediaSpec['crop_anchor'] })}
                >
                    <option value="center">Center</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                </select>
            </div>
            {media.fit === 'cover' && (
                <>
                    <div className="inspector__field">
                        <span className="inspector__label">Crop Focus X</span>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            className="inspector__input"
                            value={cropFocus.x}
                            onChange={(e) =>
                                patchMedia({
                                    crop_focus: {
                                        x: Number(e.target.value),
                                        y: cropFocus.y,
                                    },
                                })
                            }
                        />
                    </div>
                    <div className="inspector__field">
                        <span className="inspector__label">Crop Focus Y</span>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            className="inspector__input"
                            value={cropFocus.y}
                            onChange={(e) =>
                                patchMedia({
                                    crop_focus: {
                                        x: cropFocus.x,
                                        y: Number(e.target.value),
                                    },
                                })
                            }
                        />
                    </div>
                    <button
                        type="button"
                        className="inspector__action-btn"
                        onClick={() => patchMedia({ crop_focus: { x: 0.5, y: 0.5 } })}
                    >
                        Reset Crop
                    </button>
                </>
            )}
        </div>
    );
}

function ImageUploadEditor({
    zone,
    renderPreviewRequest = null,
    minimal = false,
}: {
    zone: ZoneSpec;
    renderPreviewRequest?: RenderPreviewRequest | null;
    minimal?: boolean;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const { template, setAsset, setUploadedImage, uploadedImages, updateZone, setPendingFile, activeManifest } =
        useTemplateStore();
    const assetKey = zone.asset_ref || zone.id;
    const currentPreview =
        uploadedImages[zone.id] ||
        getAssetPreviewUrl(template.assets[assetKey], activeManifest?.assets?.[assetKey]) ||
        null;
    const isClipUpload = Boolean(renderPreviewRequest?.jobId && activeManifest);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const blobUrl = URL.createObjectURL(file);
        setUploadedImage(zone.id, blobUrl);
        setPendingFile(assetKey, file);
        setAsset(assetKey, { type: 'image', path: file.name });
        updateZone(zone.id, { asset_ref: assetKey });

        if (isClipUpload && renderPreviewRequest) {
            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await authFetch(endpoints.jobs.uploadAsset(renderPreviewRequest.jobId), {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || `HTTP ${response.status}`);
                }

                const result = await response.json();
                const assetUrl = getMediaUrl(result.url);

                setAsset(assetKey, {
                    type: 'image',
                    path: result.storage_key || file.name,
                    source_uri: assetUrl,
                });
                setUploadedImage(zone.id, assetUrl);
            } catch (error) {
                alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        if (!isClipUpload && LOCAL_PREVIEW_ENABLED) {
            try {
                const response = await fetch('/api/upload-asset', {
                    method: 'POST',
                    headers: { 'X-Filename': file.name },
                    body: file,
                });
                const result = await response.json();
                if (result.success) {
                    setUploadedImage(zone.id, result.url);
                }
            } catch {
                // Local upload is optional.
            }
        }

        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className="inspector__section">
            <div className="inspector__section-title">{zone.role === 'logo' ? 'Logo' : 'Image'}</div>
            {currentPreview && (
                <div
                    style={{
                        marginBottom: 10,
                        borderRadius: 'var(--radius-sm)',
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)',
                    }}
                >
                    <img
                        src={currentPreview}
                        alt="Preview"
                        style={{ width: '100%', display: 'block', maxHeight: 120, objectFit: 'contain', background: 'var(--bg-elevated)' }}
                    />
                </div>
            )}
            {!currentPreview && minimal && activeManifest && zone.role === 'logo' && (
                <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                    Logo preview unavailable. Replace the logo or retry after asset access is fixed.
                </div>
            )}
            <button
                className="inspector__action-btn"
                onClick={() => fileRef.current?.click()}
                style={{
                    width: '100%',
                    justifyContent: 'center',
                    border: '1px dashed var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                }}
            >
                <Upload size={14} />
                {currentPreview ? 'Replace Image' : 'Upload Image'}
            </button>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
            />
            {!minimal && (
                <div className="inspector__field" style={{ marginTop: 8 }}>
                    <span className="inspector__label">Asset Key</span>
                    <input
                        type="text"
                        className="inspector__input"
                        value={zone.asset_ref || ''}
                        onChange={(e) => updateZone(zone.id, { asset_ref: e.target.value })}
                    />
                </div>
            )}
        </div>
    );
}
