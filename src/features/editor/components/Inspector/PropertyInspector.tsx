import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Lock, Trash2, Unlock, Upload } from 'lucide-react';
import { authFetch } from '@/services/auth';
import { endpoints, getMediaUrl } from '@/lib/config';
import { useFontCatalog } from '@/hooks/useFontCatalog';
import { useTemplateStore } from '../../store/templateStore';
import type { ZoneSpec, TextSpec, MediaSpec } from '../../types/template';
import type { StudioCopySuggestionsResponse } from '../../types/manifest';
import { LOCAL_PREVIEW_ENABLED } from '../../lib/featureFlags';
import {
  PROTECTED_ASSET_AUTH_MESSAGE,
  PROTECTED_ASSET_LOAD_MESSAGE,
} from '../../lib/protectedAssetLoader';
import { isAzureAssetUploadConfigured } from '../../lib/storageService';
import {
  analyzeFontFile,
  buildFontAssetKey,
  inferFontFamily,
  inferFontStyle,
  inferFontWeight,
  isSupportedFontFile,
  listUploadedFontEntries,
  mergeFontEntries,
} from '../../lib/fontAssets';
import {
  applyTextFontSelection,
  getActiveTextFontSelection,
  resolveRuntimeTextFont,
} from '../../lib/runtimeFontResolver';
import { useProtectedAssetUrl } from '../../hooks/useProtectedAssetUrl';
import type { RenderPreviewRequest } from '../RenderPreview/RenderPreview';
import { hasForcedAutoHeight } from '../../utils/zoneRules';
import { getAssetPreviewUrl, getTemplateAssetProxyUrl } from '../../utils/assetPreview';
import type { StudioEditorState } from '../../types/studioUi';
import FontPicker from './FontPicker';
import './PropertyInspector.css';

interface PropertyInspectorProps {
  renderPreviewRequest?: RenderPreviewRequest | null;
  variant?: 'default' | 'admin';
  embedded?: boolean;
  studioEditorState?: StudioEditorState | null;
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

function formatNumericDraftValue(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseNumericDraftValue(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function formatFontSourceLabel(source: 'builtin' | 'uploaded' | 'fallback' | 'unknown') {
  if (source === 'uploaded') return 'Uploaded';
  if (source === 'fallback') return 'Fallback active';
  if (source === 'unknown') return 'Unknown';
  return 'Built-in';
}

interface DraftNumberInputProps {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  allowEmpty?: boolean;
  mode?: 'int' | 'float';
  className?: string;
  placeholder?: string;
  ariaLabel: string;
}

function DraftNumberInput({
  value,
  onCommit,
  allowEmpty = false,
  mode = 'int',
  className = 'inspector__input',
  placeholder,
  ariaLabel,
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState(() => formatNumericDraftValue(value));
  const [isEditing, setIsEditing] = useState(false);
  const skipBlurCommitRef = useRef(false);
  const displayValue = isEditing ? draft : formatNumericDraftValue(value);

  const resetDraft = () => {
    setDraft(formatNumericDraftValue(value));
  };

  const commitDraft = () => {
    const parsed = parseNumericDraftValue(draft);
    if (parsed === null) {
      if (!allowEmpty) {
        resetDraft();
        return;
      }
      onCommit(null);
      return;
    }
    if (parsed === undefined) {
      resetDraft();
      return;
    }
    onCommit(parsed);
  };

  return (
    <input
      type="text"
      inputMode={mode === 'float' ? 'decimal' : 'numeric'}
      className={className}
      value={displayValue}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      autoComplete="off"
      onFocus={() => {
        setDraft(formatNumericDraftValue(value));
        setIsEditing(true);
      }}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          setIsEditing(false);
          return;
        }
        commitDraft();
        setIsEditing(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitDraft();
          setIsEditing(false);
          skipBlurCommitRef.current = true;
          event.currentTarget.blur();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          resetDraft();
          setIsEditing(false);
          skipBlurCommitRef.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export default function PropertyInspector({
  renderPreviewRequest = null,
  variant = 'default',
  embedded = false,
  studioEditorState = null,
}: PropertyInspectorProps) {
  const { template, selectedZoneId, activeManifest } = useTemplateStore();
  const zone = template.zones.find(entry => entry.id === selectedZoneId) ?? null;

  if (!zone) {
    if (activeManifest) {
      return (
        <ClipCanvasInspector embedded={embedded} studioEditorState={studioEditorState} />
      );
    }
    return <TemplateCanvasInspector variant={variant} embedded={embedded} />;
  }

  return activeManifest ? (
    <ClipZoneInspector
      key={zone.id}
      zone={zone}
      renderPreviewRequest={renderPreviewRequest}
      embedded={embedded}
      studioEditorState={studioEditorState}
    />
  ) : (
    <TemplateZoneInspector
      key={`${variant}:${zone.id}`}
      zone={zone}
      renderPreviewRequest={renderPreviewRequest}
      variant={variant}
      embedded={embedded}
    />
  );
}

function NeedsAttentionCard({
  blockers,
  zoneId = null,
}: {
  blockers: StudioEditorState['blockers'];
  zoneId?: string | null;
}) {
  const relevantBlockers = blockers.filter(
    blocker => !zoneId || blocker.zoneId === zoneId
  );
  if (!relevantBlockers.length) return null;

  return (
    <div className="inspector__attention">
      <div className="inspector__attention-title">Needs Attention</div>
      <div className="inspector__attention-body">
        {relevantBlockers.map((blocker, index) => (
          <div key={`${blocker.code}:${blocker.zoneId || 'global'}:${index}`}>
            {blocker.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTemplateName(templateId: string): string {
  const [namePart] = templateId.split('/');
  return namePart
    .split(/[-_]+/)
    .filter(Boolean)
    .map(chunk => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function TemplateCanvasInspector({
  variant = 'default',
  embedded = false,
}: {
  variant?: 'default' | 'admin';
  embedded?: boolean;
}) {
  const { template, setCanvasSize, setTemplateId, setStyle } = useTemplateStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const adminMinimal = variant === 'admin';

  return (
    <aside className={`inspector ${embedded ? 'inspector--embedded' : ''}`}>
      <div className="inspector__header">
        <div className="inspector__heading">
          <span className="inspector__eyebrow">Inspector</span>
          <span className="inspector__title">Canvas</span>
        </div>
      </div>

      <div className="inspector__section">
        <div className="inspector__section-title">Canvas</div>
        {adminMinimal && (
          <div className="inspector__field">
            <span className="inspector__label">Template</span>
            <input
              type="text"
              className="inspector__input"
              value={formatTemplateName(template.id)}
              readOnly
            />
          </div>
        )}
        <div className="inspector__field">
          <span className="inspector__label">Width</span>
          <DraftNumberInput
            className="inspector__input inspector__input--small"
            value={template.canvas.width}
            ariaLabel="Canvas Width"
            onCommit={value =>
              setCanvasSize(
                Math.max(1, Math.round(value ?? template.canvas.width)),
                template.canvas.height
              )
            }
          />
        </div>
        <div className="inspector__field">
          <span className="inspector__label">Height</span>
          <DraftNumberInput
            className="inspector__input inspector__input--small"
            value={template.canvas.height}
            ariaLabel="Canvas Height"
            onCommit={value =>
              setCanvasSize(
                template.canvas.width,
                Math.max(1, Math.round(value ?? template.canvas.height))
              )
            }
          />
        </div>
      </div>

      {(variant === 'default' || showAdvanced) && (
        <>
          {adminMinimal && (
            <div className="inspector__section inspector__section--compact">
              <button
                type="button"
                className="inspector__toggle-btn"
                onClick={() => setShowAdvanced(value => !value)}
              >
                <span>Position & Timing</span>
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          )}

          {!adminMinimal || showAdvanced ? (
            <>
              <div className="inspector__section">
                <div className="inspector__section-title">Identity</div>
                <div className="inspector__field">
                  <span className="inspector__label">ID</span>
                  <input
                    type="text"
                    className="inspector__input"
                    value={template.id}
                    onChange={e => setTemplateId(e.target.value)}
                  />
                </div>
                <div className="inspector__field">
                  <span className="inspector__label">Compositing</span>
                  <input
                    type="text"
                    className="inspector__input"
                    value="Stack"
                    readOnly
                  />
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
                          onChange={e =>
                            setStyle(key, { ...style, fill: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="inspector__input"
                          value={style.fill || '#000000'}
                          onChange={e =>
                            setStyle(key, { ...style, fill: e.target.value })
                          }
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
                          onChange={e =>
                            setStyle(key, { ...style, bg_fill: e.target.value })
                          }
                        />
                        <input
                          type="text"
                          className="inspector__input"
                          value={style.bg_fill || '#FFFFFF'}
                          onChange={e =>
                            setStyle(key, { ...style, bg_fill: e.target.value })
                          }
                          style={{ maxWidth: 80 }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {adminMinimal && !showAdvanced && (
        <div className="inspector__section inspector__section--compact">
          <button
            type="button"
            className="inspector__toggle-btn"
            onClick={() => setShowAdvanced(true)}
          >
            <span>Position & Timing</span>
            <ChevronDown size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}

function TemplateZoneInspector({
  zone,
  renderPreviewRequest = null,
  variant = 'default',
  embedded = false,
}: {
  zone: ZoneSpec;
  renderPreviewRequest?: RenderPreviewRequest | null;
  variant?: 'default' | 'admin';
  embedded?: boolean;
}) {
  const {
    template,
    updateZone,
    reorderZone,
    duplicateZone,
    toggleLock,
    isLocked,
    removeZone,
  } = useTemplateStore();
  const locked = isLocked(zone.id);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const adminMinimal = variant === 'admin';

  return (
    <aside className={`inspector ${embedded ? 'inspector--embedded' : ''}`}>
      <InspectorHeader title={zone.id} zone={zone} hideZoneType={adminMinimal} />

      <BoundsEditor zone={zone} title={adminMinimal ? 'Position & Size' : 'Bounds'} />
      <TextColorsEditor zone={zone} />
      {zone.type === 'text' && zone.text && (
        <TextSpecEditor
          zone={zone}
          minimal={adminMinimal && !showAdvanced}
          variant={variant}
        />
      )}
      {zone.type === 'video' && zone.media && <MediaSpecEditor zone={zone} />}
      {zone.type === 'image' && (
        <ImageUploadEditor
          zone={zone}
          renderPreviewRequest={renderPreviewRequest}
          minimal={adminMinimal}
          variant={variant}
        />
      )}

      {adminMinimal && (
        <div className="inspector__section inspector__section--compact">
          <button
            type="button"
            className="inspector__toggle-btn"
            onClick={() => setShowAdvanced(value => !value)}
          >
            <span>Position & Timing</span>
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      )}

      {(!adminMinimal || showAdvanced) && (
        <>
          <div className="inspector__section">
            <div className="inspector__section-title">Identity</div>
            <div className="inspector__field">
              <span className="inspector__label">ID</span>
              <input
                type="text"
                className="inspector__input"
                value={zone.id}
                onChange={e => updateZone(zone.id, { id: e.target.value })}
              />
            </div>
            <div className="inspector__field">
              <span className="inspector__label">Z-Index</span>
              <DraftNumberInput
                className="inspector__input inspector__input--small"
                value={zone.z}
                ariaLabel="Z-Index"
                onCommit={value => reorderZone(zone.id, Math.round(value ?? zone.z))}
              />
            </div>
            {zone.content_ref !== undefined && (
              <div className="inspector__field">
                <span className="inspector__label">Content Ref</span>
                <input
                  type="text"
                  className="inspector__input"
                  value={zone.content_ref || ''}
                  onChange={e => updateZone(zone.id, { content_ref: e.target.value })}
                />
              </div>
            )}
            {zone.style_ref !== undefined && (
              <div className="inspector__field">
                <span className="inspector__label">Style Ref</span>
                <select
                  className="inspector__select"
                  value={zone.style_ref || ''}
                  onChange={e =>
                    updateZone(zone.id, { style_ref: e.target.value || undefined })
                  }
                >
                  <option value="">None</option>
                  {Object.keys(template.styles).map(key => (
                    <option key={key} value={key}>
                      {key}
                    </option>
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
                  onChange={e => updateZone(zone.id, { asset_ref: e.target.value })}
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
                  onChange={e =>
                    updateZone(zone.id, { role: e.target.value || undefined })
                  }
                />
              </div>
            )}
          </div>

          <div className="inspector__actions">
            <button
              className="inspector__action-btn"
              onClick={() => duplicateZone(zone.id)}
            >
              <Copy size={14} /> Duplicate
            </button>
            <button className="inspector__action-btn" onClick={() => toggleLock(zone.id)}>
              {locked ? <Unlock size={14} /> : <Lock size={14} />}
              {locked ? 'Unlock' : 'Lock'}
            </button>
            <button
              className="inspector__action-btn inspector__action-btn--danger"
              onClick={() => removeZone(zone.id)}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function ClipZoneInspector({
  zone,
  renderPreviewRequest = null,
  embedded = false,
  studioEditorState = null,
}: {
  zone: ZoneSpec;
  renderPreviewRequest?: RenderPreviewRequest | null;
  embedded?: boolean;
  studioEditorState?: StudioEditorState | null;
}) {
  const { activeManifest, previewTexts, updateManifestRenderPayload } =
    useTemplateStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <aside className={`inspector ${embedded ? 'inspector--embedded' : ''}`}>
      <div className="inspector__header inspector__header--compact">
        <div className="inspector__heading">
          <span className="inspector__title">{getClipZoneTitle(zone, previewTexts)}</span>
        </div>
      </div>

      <NeedsAttentionCard blockers={studioEditorState?.blockers || []} zoneId={zone.id} />

      {zone.type === 'text' && <TextColorsEditor zone={zone} />}
      {zone.type === 'text' && zone.text && (
        <TextSpecEditor
          zone={zone}
          minimal
          renderPreviewRequest={renderPreviewRequest}
          variant="default"
        />
      )}
      {zone.type === 'video' && zone.media && <MediaSpecEditor zone={zone} />}
      {zone.type === 'image' && (
        <ImageUploadEditor
          zone={zone}
          renderPreviewRequest={renderPreviewRequest}
          minimal
          variant="default"
        />
      )}

      {zone.type === 'video' && (
        <div className="inspector__section">
          <div className="inspector__section-title">Position & Timing</div>
          <div className="inspector__row">
            <div className="inspector__field" style={{ flex: 1 }}>
              <span className="inspector__label">Source In</span>
              <DraftNumberInput
                className="inspector__input inspector__input--small"
                value={activeManifest?.render_payload?.time_window?.start ?? 0}
                ariaLabel="Source In"
                mode="float"
                onCommit={value => {
                  const nextStart = Math.max(0, value ?? 0);
                  const currentEnd =
                    activeManifest?.render_payload?.time_window?.end ??
                    Math.max(nextStart + 0.1, 0.1);
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
              <DraftNumberInput
                className="inspector__input inspector__input--small"
                value={activeManifest?.render_payload?.time_window?.end ?? 0}
                ariaLabel="Source Out"
                mode="float"
                onCommit={value => {
                  const currentStart =
                    activeManifest?.render_payload?.time_window?.start ?? 0;
                  const nextEnd = Math.max(currentStart + 0.1, value ?? 0.1);
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
          onClick={() => setShowAdvanced(value => !value)}
        >
          <span>Position & Timing</span>
          {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {showAdvanced && <BoundsEditor zone={zone} title="Position & Size" />}
    </aside>
  );
}

function ClipCanvasInspector({
  embedded = false,
  studioEditorState = null,
}: {
  embedded?: boolean;
  studioEditorState?: StudioEditorState | null;
}) {
  return (
    <aside className={`inspector ${embedded ? 'inspector--embedded' : ''}`}>
      <div className="inspector__header">
        <div className="inspector__heading">
          <span className="inspector__eyebrow">Inspector</span>
          <span className="inspector__title">Properties</span>
        </div>
      </div>

      <NeedsAttentionCard blockers={studioEditorState?.blockers || []} />

      <div className="inspector__section">
        <div className="inspector__section-title">Content</div>
        <div className="inspector__empty inspector__empty--inline">
          <span>Select a layer to edit its content, typography, color, and layout.</span>
        </div>
      </div>
    </aside>
  );
}

function InspectorHeader({
  title,
  zone,
  hideZoneType = false,
}: {
  title: string;
  zone: ZoneSpec;
  hideZoneType?: boolean;
}) {
  return (
    <div className="inspector__header">
      <div className="inspector__heading">
        <span className="inspector__eyebrow">Inspector</span>
        <span className="inspector__title">{title}</span>
      </div>
      {!hideZoneType && (
        <span className={`inspector__zone-type inspector__zone-type--${zone.type}`}>
          {getZoneTypeLabel(zone)}
        </span>
      )}
    </div>
  );
}

function BoundsEditor({ zone, title }: { zone: ZoneSpec; title: string }) {
  const { updateZoneBoundsExact, updateZone } = useTemplateStore();
  const forcedAutoHeight = hasForcedAutoHeight(zone);

  return (
    <div className="inspector__section">
      <div className="inspector__section-title">{title}</div>
      <div className="inspector__row">
        <div className="inspector__field" style={{ flex: 1 }}>
          <span className="inspector__label">X</span>
          <DraftNumberInput
            className="inspector__input inspector__input--small"
            value={Number(zone.bounds.x)}
            ariaLabel="Bounds X"
            onCommit={value =>
              updateZoneBoundsExact(zone.id, { x: Math.round(value ?? 0) })
            }
          />
        </div>
        <div className="inspector__field" style={{ flex: 1 }}>
          <span className="inspector__label">Y</span>
          <DraftNumberInput
            className="inspector__input inspector__input--small"
            value={Number(zone.bounds.y)}
            ariaLabel="Bounds Y"
            onCommit={value =>
              updateZoneBoundsExact(zone.id, { y: Math.round(value ?? 0) })
            }
          />
        </div>
      </div>
      <div className="inspector__row">
        <div className="inspector__field" style={{ flex: 1 }}>
          <span className="inspector__label">W</span>
          <DraftNumberInput
            className="inspector__input inspector__input--small"
            value={Number(zone.bounds.width)}
            ariaLabel="Bounds Width"
            onCommit={value =>
              updateZoneBoundsExact(zone.id, {
                width: Math.max(10, Math.round(value ?? 10)),
              })
            }
          />
        </div>
        {!forcedAutoHeight && (
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">H</span>
            <DraftNumberInput
              className="inspector__input inspector__input--small"
              value={
                zone.bounds.height !== undefined ? Number(zone.bounds.height) : undefined
              }
              placeholder="auto"
              ariaLabel="Bounds Height"
              allowEmpty
              onCommit={value => {
                if (value === null) {
                  updateZone(zone.id, {
                    bounds: {
                      x: zone.bounds.x,
                      y: zone.bounds.y,
                      width: zone.bounds.width,
                    },
                  });
                  return;
                }
                updateZoneBoundsExact(zone.id, {
                  height: Math.max(10, Math.round(value)),
                });
              }}
            />
          </div>
        )}
      </div>
      {forcedAutoHeight && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 2,
            fontStyle: 'italic',
          }}
        >
          Height follows the image aspect ratio
        </div>
      )}
      {!forcedAutoHeight && zone.bounds.height === undefined && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 2,
            fontStyle: 'italic',
          }}
        >
          Height auto-calculated from image aspect ratio
        </div>
      )}
    </div>
  );
}

function TextColorsEditor({ zone }: { zone: ZoneSpec }) {
  const { template, setStyle, activeManifest } = useTemplateStore();
  if (!zone.style_ref || !template.styles[zone.style_ref]) return null;
  const backgroundZone = activeManifest
    ? template.zones.find(
        entry => entry.id === `${zone.id}__bg` && entry.type === 'shape'
      )
    : null;
  const backgroundStyle = backgroundZone?.style_ref
    ? template.styles[backgroundZone.style_ref]
    : null;

  return (
    <div className="inspector__section">
      <div className="inspector__section-title">Color</div>
      <div className="inspector__row">
        <div className="inspector__field" style={{ flex: 1 }}>
          <span className="inspector__label">Text color</span>
          <div className="inspector__color-row">
            <input
              type="color"
              className="inspector__input inspector__input--color"
              value={template.styles[zone.style_ref].fill || '#000000'}
              onChange={e =>
                setStyle(zone.style_ref!, {
                  ...template.styles[zone.style_ref!],
                  fill: e.target.value,
                })
              }
            />
            <input
              type="text"
              className="inspector__input"
              value={template.styles[zone.style_ref].fill || '#000000'}
              onChange={e =>
                setStyle(zone.style_ref!, {
                  ...template.styles[zone.style_ref!],
                  fill: e.target.value,
                })
              }
              style={{ maxWidth: 72, fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
          </div>
        </div>
      </div>
      <div className="inspector__row">
        <div className="inspector__field" style={{ flex: 1 }}>
          <span className="inspector__label">Background color</span>
          <div className="inspector__color-row">
            <input
              type="color"
              className="inspector__input inspector__input--color"
              value={
                backgroundStyle?.fill ||
                template.styles[zone.style_ref].bg_fill ||
                '#FFFFFF'
              }
              onChange={e =>
                backgroundZone?.style_ref
                  ? setStyle(backgroundZone.style_ref, {
                      ...(backgroundStyle || {}),
                      fill: e.target.value,
                    })
                  : setStyle(zone.style_ref!, {
                      ...template.styles[zone.style_ref!],
                      bg_fill: e.target.value,
                    })
              }
            />
            <input
              type="text"
              className="inspector__input"
              value={
                backgroundStyle?.fill ||
                template.styles[zone.style_ref].bg_fill ||
                '#FFFFFF'
              }
              onChange={e =>
                backgroundZone?.style_ref
                  ? setStyle(backgroundZone.style_ref, {
                      ...(backgroundStyle || {}),
                      fill: e.target.value,
                    })
                  : setStyle(zone.style_ref!, {
                      ...template.styles[zone.style_ref!],
                      bg_fill: e.target.value,
                    })
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
  variant = 'default',
}: {
  zone: ZoneSpec;
  minimal?: boolean;
  renderPreviewRequest?: RenderPreviewRequest | null;
  variant?: 'default' | 'admin';
}) {
  const fontUploadInputRef = useRef<HTMLInputElement>(null);
  const {
    template,
    activeManifest,
    updateZone,
    previewTexts,
    setPreviewText,
    aiCopySessions,
    updateAICopySession,
    setAsset,
    hydrateAssetMetadata,
    removeAsset,
    pendingFiles,
    fontAnalysis,
    setFontAnalysis,
    setPendingFile,
    removePendingFile,
  } = useTemplateStore();
  const { fonts: builtinFonts, isLoading: fontsLoading } = useFontCatalog();
  const text = zone.text!;
  const contentRef = zone.content_ref || '';
  const previewText = contentRef ? previewTexts[contentRef] || '' : '';
  const copyLanguage = activeManifest?.render_payload?.copy_language;
  const activeFontSelection = useMemo(() => {
    const sel = getActiveTextFontSelection(text.font, copyLanguage);
    // Hard-lock to Khand regardless of persisted value
    return { ...sel, family: 'Khand' };
  }, [copyLanguage, text.font]);
  const aiCopyEnabled = Boolean(renderPreviewRequest && contentRef === 'pov_text');
  const uploadedFonts = useMemo(
    () => listUploadedFontEntries(template.assets || {}, fontAnalysis),
    [fontAnalysis, template.assets]
  );
  const pendingFontEntries = useMemo(() => {
    return Object.entries(pendingFiles)
      .filter(([, file]) => isSupportedFontFile(file))
      .map(([assetKey, file]) => ({
        family: inferFontFamily(file.name),
        display: inferFontFamily(file.name),
        weights: [inferFontWeight(file.name, activeFontSelection.weight || 400)],
        scripts: fontAnalysis[assetKey]?.scripts || [],
        source: 'uploaded',
        assetKey,
        analysisState: fontAnalysis[assetKey]?.state ?? 'pending',
      }));
  }, [activeFontSelection.weight, fontAnalysis, pendingFiles]);
  const availableFonts = useMemo(
    () => mergeFontEntries(builtinFonts, uploadedFonts, pendingFontEntries),
    [builtinFonts, uploadedFonts, pendingFontEntries]
  );
  const resolvedRuntimeFont = useMemo(() => {
    if (fontsLoading) return null;
    return resolveRuntimeTextFont({
      font: text.font,
      copyLanguage,
      textContent: previewText,
      fonts: availableFonts,
    });
  }, [availableFonts, copyLanguage, fontsLoading, previewText, text.font]);
  const currentFontMissing =
    !fontsLoading && resolvedRuntimeFont?.fontState === 'MISSING';
  const isClipFontUpload = Boolean(renderPreviewRequest?.jobId && activeManifest);
  const fontUploadDisabled = !isClipFontUpload && !isAzureAssetUploadConfigured();
  const fontUploadHelpText = useMemo(() => {
    const notices: string[] = [];
    if (fontUploadDisabled) {
      notices.push('Font upload is not configured in this environment.');
    }
    if (resolvedRuntimeFont?.repairMessage) {
      notices.push(resolvedRuntimeFont.repairMessage);
    } else if (resolvedRuntimeFont?.blockingReason) {
      notices.push(resolvedRuntimeFont.blockingReason);
    } else if (
      resolvedRuntimeFont &&
      resolvedRuntimeFont.family !== resolvedRuntimeFont.configuredFamily &&
      resolvedRuntimeFont.fallbackApplied
    ) {
      notices.push(
        `Canvas is using ${resolvedRuntimeFont.family} because ${resolvedRuntimeFont.configuredFamily} does not match the current text script.`
      );
    }
    return notices.length > 0 ? notices.join(' ') : null;
  }, [fontUploadDisabled, resolvedRuntimeFont]);
  const aiCopyState = aiCopyEnabled
    ? (aiCopySessions[contentRef] ?? {
        options: [],
        rejected: [],
        loading: false,
        error: null,
        copyLanguage: null,
      })
    : null;

  const patchText = (patch: Partial<TextSpec>) => {
    updateZone(zone.id, { text: { ...text, ...patch } });
  };

  const patchFontSelection = (_family: string, weight: number) => {
    patchText({
      font: applyTextFontSelection(text.font, {
        family: 'Khand',
        weight,
        copyLanguage,
      }),
    });
  };

  const handleFontFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isSupportedFontFile(file)) {
      alert('Only .ttf and .otf font files are supported.');
      event.currentTarget.value = '';
      return;
    }

    if (fontUploadDisabled) {
      alert(fontUploadHelpText || 'Asset upload is not available.');
      event.currentTarget.value = '';
      return;
    }

    const inferredStyle = inferFontStyle(file.name);
    const inferredWeight = inferFontWeight(file.name, activeFontSelection.weight || 400);
    const inferredFamily = inferFontFamily(file.name);
    const format = file.name.toLowerCase().endsWith('.otf') ? 'otf' : 'ttf';
    const assetKey = buildFontAssetKey(inferredFamily, inferredWeight, inferredStyle);
    const previousAsset = template.assets[assetKey];
    const previousFont = {
      family: activeFontSelection.family || text.font.family,
      weight: activeFontSelection.weight || text.font.weight,
    };
    const nextFontAsset = {
      type: 'font' as const,
      path: file.name,
      family: inferredFamily,
      weight: inferredWeight,
      style: inferredStyle,
      format,
    };
    let analyzedScripts: string[] = [];

    setPendingFile(assetKey, file);
    setFontAnalysis(assetKey, { scripts: [], state: 'pending' });
    patchFontSelection(inferredFamily, inferredWeight);

    try {
      analyzedScripts = await analyzeFontFile(file);
      setFontAnalysis(assetKey, { scripts: analyzedScripts, state: 'ready' });
      hydrateAssetMetadata(assetKey, { scripts: analyzedScripts });
    } catch (error) {
      setFontAnalysis(assetKey, {
        scripts: [],
        state: 'failed',
        error: error instanceof Error ? error.message : 'Font analysis failed',
      });
    }

    if (isClipFontUpload && renderPreviewRequest) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('asset_type', 'font');

        const response = await authFetch(
          endpoints.jobs.uploadAsset(renderPreviewRequest.jobId),
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        const result = await response.json();
        setAsset(assetKey, {
          ...nextFontAsset,
          path: result.storage_key || file.name,
          source_uri: getMediaUrl(result.url),
          ...(analyzedScripts.length > 0 ? { scripts: analyzedScripts } : {}),
        });
        removePendingFile(assetKey);
      } catch (error) {
        removePendingFile(assetKey);
        if (previousAsset) {
          setAsset(assetKey, previousAsset);
        } else {
          removeAsset(assetKey);
        }
        patchFontSelection(previousFont.family, previousFont.weight);
        alert(
          `Font upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } else {
      setAsset(assetKey, {
        ...nextFontAsset,
        ...(analyzedScripts.length > 0 ? { scripts: analyzedScripts } : {}),
      });
    }

    event.currentTarget.value = '';
  };

  const handleGenerateSuggestions = async (mode: 'generate' | 'regenerate') => {
    if (!renderPreviewRequest || !contentRef) return;

    const rejectedOptions =
      mode === 'regenerate'
        ? Array.from(
            new Set([...(aiCopyState?.rejected || []), ...(aiCopyState?.options || [])])
          )
        : aiCopyState?.rejected || [];

    updateAICopySession(contentRef, {
      loading: true,
      error: null,
      rejected: rejectedOptions,
    });

    try {
      const response = await authFetch(
        endpoints.jobs.copySuggestions(
          renderPreviewRequest.jobId,
          renderPreviewRequest.clipIndex
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_text: previewText,
            rejected_options: rejectedOptions,
          }),
        }
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
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate AI POV suggestions',
        rejected: rejectedOptions,
      });
    }
  };

  return (
    <>
      {contentRef && (
        <div className="inspector__section">
          <div className="inspector__section-title">Content</div>
          <div className="inspector__field inspector__field--stacked">
            <span className="inspector__label">Headline text</span>
            <textarea
              className="inspector__input inspector__input--multiline"
              value={previewText}
              onChange={e => setPreviewText(contentRef, e.target.value)}
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
        </div>
      )}

      <div className="inspector__section">
        <div className="inspector__section-title">Typography</div>
        <div className="inspector__font-card">
          <div className="inspector__font-card-header">
            <span className="inspector__font-card-title">Applied Font</span>
            <span className="inspector__font-card-pill">
              {formatFontSourceLabel(
                resolvedRuntimeFont?.selectedFont.source || 'unknown'
              )}
            </span>
          </div>
          <div className="inspector__font-card-meta">
            <div>
              <span className="inspector__font-card-label">Selected</span>
              <strong>Khand</strong>
            </div>
            <div>
              <span className="inspector__font-card-label">Effective in canvas</span>
              <strong>Khand</strong>
            </div>
            <div>
              <span className="inspector__font-card-label">Compatibility</span>
              <strong>
                {resolvedRuntimeFont?.compatibilityStatus || 'Checking font…'}
              </strong>
            </div>
          </div>
          <div className="inspector__field inspector__field--stacked">
            <span className="inspector__label">Font family</span>
            <FontPicker
              fonts={availableFonts}
              value={activeFontSelection.family}
              weight={activeFontSelection.weight}
              locked={true}
              missing={currentFontMissing}
              onChange={family => patchFontSelection(family, activeFontSelection.weight)}
              onWeightChange={weight =>
                patchFontSelection(activeFontSelection.family, weight)
              }
              onUpload={() => fontUploadInputRef.current?.click()}
              uploadLabel={
                isClipFontUpload ? 'Upload custom font' : 'Upload template font'
              }
              uploadDisabled={fontUploadDisabled}
              uploadHelpText={fontUploadHelpText}
            />
            <input
              ref={fontUploadInputRef}
              type="file"
              accept=".ttf,.otf"
              style={{ display: 'none' }}
              onChange={handleFontFileSelect}
            />
          </div>
          {resolvedRuntimeFont?.repairMessage && (
            <div className="inspector__font-card-note">
              {resolvedRuntimeFont.repairMessage}
            </div>
          )}
          {!resolvedRuntimeFont?.repairMessage && resolvedRuntimeFont?.blockingReason && (
            <div className="inspector__font-card-error">
              {resolvedRuntimeFont.blockingReason}
            </div>
          )}
        </div>

        <div className="inspector__row">
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">Font size</span>
            <DraftNumberInput
              className="inspector__input inspector__input--small"
              value={text.font.size ?? undefined}
              ariaLabel="Font Size"
              allowEmpty
              onCommit={value =>
                patchText({
                  font: {
                    ...text.font,
                    size: value === null ? null : Math.max(1, Math.round(value)),
                  },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="inspector__section">
        <div className="inspector__section-title">Layout</div>
        <div className="inspector__row">
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">Horizontal align</span>
            <select
              className="inspector__select"
              value={text.horizontal_align}
              onChange={e =>
                patchText({
                  horizontal_align: e.target.value as TextSpec['horizontal_align'],
                })
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="inspector__field" style={{ flex: 1 }}>
            <span className="inspector__label">Vertical align</span>
            <select
              className="inspector__select"
              value={text.vertical_align}
              onChange={e =>
                patchText({
                  vertical_align: e.target.value as TextSpec['vertical_align'],
                })
              }
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
                <span className="inspector__label">Max lines</span>
                <DraftNumberInput
                  className="inspector__input inspector__input--small"
                  value={text.max_lines}
                  ariaLabel="Max Lines"
                  onCommit={value =>
                    patchText({
                      max_lines: Math.max(1, Math.round(value ?? text.max_lines)),
                    })
                  }
                />
              </div>
              <div className="inspector__field" style={{ flex: 1 }}>
                <span className="inspector__label">Overflow</span>
                <select
                  className="inspector__select"
                  value={text.overflow}
                  onChange={e =>
                    patchText({ overflow: e.target.value as TextSpec['overflow'] })
                  }
                >
                  <option value="wrap">Wrap</option>
                  <option value="shrink">Shrink</option>
                </select>
              </div>
            </div>
            <div className="inspector__row">
              <div className="inspector__field" style={{ flex: 1 }}>
                <span className="inspector__label">Width percent</span>
                <DraftNumberInput
                  className="inspector__input inspector__input--small"
                  value={text.width_percent ?? undefined}
                  ariaLabel="Width Percent"
                  allowEmpty
                  onCommit={value =>
                    patchText({
                      width_percent:
                        value === null ? null : Math.max(1, Math.round(value)),
                    })
                  }
                />
              </div>
              <div className="inspector__field" style={{ flex: 1 }}>
                <span className="inspector__label">Minimum size</span>
                <DraftNumberInput
                  className="inspector__input inspector__input--small"
                  value={text.min_font_size ?? undefined}
                  ariaLabel="Minimum Font Size"
                  allowEmpty
                  onCommit={value =>
                    patchText({
                      min_font_size:
                        value === null ? null : Math.max(1, Math.round(value)),
                    })
                  }
                />
              </div>
            </div>
            <div className="inspector__field">
              <span className="inspector__label">Line spacing</span>
              <DraftNumberInput
                className="inspector__input inspector__input--small"
                value={text.line_spacing_px}
                ariaLabel="Line Spacing"
                onCommit={value =>
                  patchText({ line_spacing_px: Math.max(0, Math.round(value ?? 0)) })
                }
              />
            </div>
          </>
        )}
      </div>

      {aiCopyEnabled && aiCopyState && (
        <div className="inspector__section">
          <div className="inspector__ai-copy-header">
            <span className="inspector__section-title" style={{ marginBottom: 0 }}>
              Suggestions
            </span>
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
            {aiCopyState.loading
              ? 'Generating suggestions…'
              : 'Suggest 3 headline options'}
          </button>

          {aiCopyState.options.length > 0 && (
            <div className="inspector__ai-copy-list">
              {aiCopyState.options.map((option, index) => (
                <div key={`${option}-${index}`} className="inspector__ai-copy-card">
                  <div className="inspector__ai-copy-text">{option}</div>
                  <div className="inspector__ai-copy-actions inspector__ai-copy-actions--card">
                    <button
                      type="button"
                      className="inspector__action-btn inspector__ai-copy-use"
                      onClick={() => setPreviewText(contentRef, option)}
                    >
                      Replace current text
                    </button>
                  </div>
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
                Try again
              </button>
            </div>
          )}

          {aiCopyState.error && (
            <div className="inspector__ai-copy-error">{aiCopyState.error}</div>
          )}
        </div>
      )}
    </>
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
          onChange={e => patchMedia({ fit: e.target.value as MediaSpec['fit'] })}
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
          onChange={e =>
            patchMedia({ crop_anchor: e.target.value as MediaSpec['crop_anchor'] })
          }
        >
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>
      {media.fit === 'cover' && (
        <>
          <div className="inspector__row">
            <div className="inspector__field" style={{ flex: 1 }}>
              <span className="inspector__label">Crop X</span>
              <DraftNumberInput
                className="inspector__input inspector__input--small"
                value={cropFocus.x}
                ariaLabel="Crop Focus X"
                mode="float"
                onCommit={value =>
                  patchMedia({
                    crop_focus: {
                      x: Math.min(1, Math.max(0, value ?? cropFocus.x)),
                      y: cropFocus.y,
                    },
                  })
                }
              />
            </div>
            <div className="inspector__field" style={{ flex: 1 }}>
              <span className="inspector__label">Crop Y</span>
              <DraftNumberInput
                className="inspector__input inspector__input--small"
                value={cropFocus.y}
                ariaLabel="Crop Focus Y"
                mode="float"
                onCommit={value =>
                  patchMedia({
                    crop_focus: {
                      x: cropFocus.x,
                      y: Math.min(1, Math.max(0, value ?? cropFocus.y)),
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="inspector__field">
            <span className="inspector__label">Crop Focus X</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              className="inspector__input"
              aria-label="Crop Focus X Slider"
              value={cropFocus.x}
              onChange={e =>
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
              aria-label="Crop Focus Y Slider"
              value={cropFocus.y}
              onChange={e =>
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
  variant = 'default',
}: {
  zone: ZoneSpec;
  renderPreviewRequest?: RenderPreviewRequest | null;
  minimal?: boolean;
  variant?: 'default' | 'admin';
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    template,
    setAsset,
    setUploadedImage,
    uploadedImages,
    updateZone,
    setPendingFile,
    setAssetPreviewError,
    activeManifest,
  } = useTemplateStore();
  const assetKey = zone.asset_ref || zone.id;
  const templateAsset = template.assets[assetKey];
  const templateAssetProxyUrl =
    !activeManifest && templateAsset
      ? getTemplateAssetProxyUrl(template.id, assetKey)
      : null;
  const { resolvedUrl: hydratedTemplateAssetUrl, error: protectedAssetError } =
    useProtectedAssetUrl(templateAssetProxyUrl);
  const currentPreview =
    uploadedImages[zone.id] ||
    hydratedTemplateAssetUrl ||
    getAssetPreviewUrl(templateAsset, activeManifest?.assets?.[assetKey]) ||
    null;
  const isClipUpload = Boolean(renderPreviewRequest?.jobId && activeManifest);
  const uploadConfigured = isClipUpload || isAzureAssetUploadConfigured();
  const uploadDisabled = variant === 'admin' && !uploadConfigured;
  const uploadHelpText =
    uploadDisabled && zone.role === 'logo'
      ? 'Logo upload is not configured in this environment.'
      : uploadDisabled
        ? 'Image upload is not configured in this environment.'
        : null;

  useEffect(() => {
    if (!templateAssetProxyUrl) return;
    if (protectedAssetError?.code === 'unauthorized') {
      setAssetPreviewError(PROTECTED_ASSET_AUTH_MESSAGE);
      return;
    }
    if (protectedAssetError) {
      setAssetPreviewError(PROTECTED_ASSET_LOAD_MESSAGE);
      return;
    }
    if (hydratedTemplateAssetUrl) {
      setAssetPreviewError(null);
    }
  }, [
    hydratedTemplateAssetUrl,
    protectedAssetError,
    setAssetPreviewError,
    templateAssetProxyUrl,
  ]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadDisabled) {
      alert(uploadHelpText || 'Asset upload is not available.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    setUploadedImage(zone.id, blobUrl);
    setPendingFile(assetKey, file);
    setAsset(assetKey, { type: 'image', path: file.name });
    updateZone(zone.id, { asset_ref: assetKey });

    if (isClipUpload && renderPreviewRequest) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await authFetch(
          endpoints.jobs.uploadAsset(renderPreviewRequest.jobId),
          {
            method: 'POST',
            body: formData,
          }
        );

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
        alert(
          `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
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
      <div className="inspector__section-title">
        {zone.role === 'logo' ? 'Logo' : 'Image'}
      </div>
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
            style={{
              width: '100%',
              display: 'block',
              maxHeight: 120,
              objectFit: 'contain',
              background: 'var(--bg-elevated)',
            }}
          />
        </div>
      )}
      {!currentPreview && minimal && activeManifest && zone.role === 'logo' && (
        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          Logo preview unavailable. Replace the logo or retry after asset access is fixed.
        </div>
      )}
      {uploadHelpText && (
        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          {uploadHelpText}
        </div>
      )}
      <button
        className="inspector__action-btn"
        onClick={() => fileRef.current?.click()}
        disabled={uploadDisabled}
        style={{
          width: '100%',
          justifyContent: 'center',
          border: '1px dashed var(--border-medium)',
          borderRadius: 'var(--radius-sm)',
          opacity: uploadDisabled ? 0.6 : 1,
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
            onChange={e => updateZone(zone.id, { asset_ref: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
