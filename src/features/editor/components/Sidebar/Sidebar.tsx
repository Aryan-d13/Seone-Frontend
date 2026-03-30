import { useRef, useState, useEffect } from 'react';
import {
  Type,
  Image,
  Film,
  Upload,
  Download,
  Undo2,
  Redo2,
  FlaskConical,
  Cloud,
  CloudUpload,
  Trash2,
  FolderOpen,
  FilePlus,
  LogOut,
  Loader2,
  FileDown,
} from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';
import { createTextZone, createImageZone, createVideoZone } from '../../utils/defaults';
import { exportTemplate, downloadJSON } from '../../utils/exportTemplate';
import { importTemplate } from '../../utils/importTemplate';
import {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  toDocId,
  type TemplateListItem,
} from '../../lib/firestoreService';
import ManifestLoader from '../ManifestLoader/ManifestLoader';
import RenderPreview, { type RenderPreviewRequest } from '../RenderPreview/RenderPreview';
import { getClipLayerDefinitions, getManifestClipDuration } from '../../utils/clipLayers';
import './Sidebar.css';

export interface SidebarSessionUser {
  email?: string | null;
  photoURL?: string | null;
}

interface SidebarProps {
  onTest: () => void;
  mode?: 'template' | 'clip';
  previewEnabled?: boolean;
  sessionUser?: SidebarSessionUser | null;
  onSignOut?: (() => Promise<void>) | (() => void);
  renderPreviewRequest?: RenderPreviewRequest | null;
}

function formatTime(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '00:00.0';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

function buildUniqueId(prefix: string, existingValues: Iterable<string>): string {
  const existing = new Set(existingValues);
  let counter = 1;
  let candidate = `${prefix}_${counter}`;
  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${prefix}_${counter}`;
  }
  return candidate;
}

export default function Sidebar({
  onTest,
  mode = 'template',
  previewEnabled = false,
  sessionUser = null,
  onSignOut,
  renderPreviewRequest = null,
}: SidebarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    template,
    addZone,
    selectZone,
    selectedZoneId,
    undo,
    redo,
    canUndo,
    canRedo,
    setTemplate,
    activeManifest,
    previewTexts,
    setPreviewText,
    setZoneClipTiming,
  } = useTemplateStore();

  const { canvas, zones } = template;
  const cloudEnabled = Boolean(sessionUser?.email);
  const isClipMode = mode === 'clip';
  const sourceVideoKey =
    typeof activeManifest?.render_payload?.source_video_key === 'string'
      ? activeManifest.render_payload.source_video_key
      : null;
  const timeWindow = activeManifest?.render_payload?.time_window;
  const overlayCount = zones.filter(zone => zone.type !== 'video').length;
  const sourceLayerId = template.zones.find(zone => zone.type === 'video')?.id ?? null;
  const sourceVideoName = sourceVideoKey
    ? sourceVideoKey.split('/').at(-1) || sourceVideoKey
    : 'Attached source';

  // ── Cloud templates state ────────────────────
  const [cloudTemplates, setCloudTemplates] = useState<TemplateListItem[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [manifestOpen, setManifestOpen] = useState(false);

  const fetchCloudTemplates = async () => {
    if (!cloudEnabled || isClipMode) {
      setCloudTemplates([]);
      setCloudError(null);
      setCloudLoading(false);
      return;
    }
    setCloudLoading(true);
    setCloudError(null);
    try {
      const list = await listTemplates();
      setCloudTemplates(list);
    } catch (err) {
      setCloudError((err as Error).message);
    } finally {
      setCloudLoading(false);
    }
  };

  // Fetch on mount
  useEffect(() => {
    if (!cloudEnabled || isClipMode) {
      setCloudTemplates([]);
      setCloudError(null);
      return;
    }
    void fetchCloudTemplates();
  }, [cloudEnabled, isClipMode, sessionUser?.email]);

  // ── Element handlers ─────────────────────────
  const handleAddText = () => {
    const zoneId = buildUniqueId(
      'text_overlay',
      zones.map(zone => zone.id)
    );
    const contentRef = buildUniqueId(
      'text_content',
      zones
        .map(zone => zone.content_ref)
        .filter((value): value is string => Boolean(value))
    );
    const firstStyleKey = Object.keys(template.styles)[0];
    const zone = {
      ...createTextZone(canvas.width, canvas.height),
      id: zoneId,
      content_ref: contentRef,
      z: Math.max(10, ...zones.map(entry => entry.z + 1)),
      style_ref: template.styles.title_style ? 'title_style' : firstStyleKey || undefined,
    };
    addZone(zone);
    setPreviewText(contentRef, 'Add your headline');

    if (isClipMode) {
      const clipDuration = getManifestClipDuration(activeManifest, 5);
      setZoneClipTiming(zoneId, 0, Math.max(clipDuration, 0.1));
    }
  };
  const handleAddImage = () => {
    const zoneId = buildUniqueId(
      'graphic_layer',
      zones.map(zone => zone.id)
    );
    const zone = {
      ...createImageZone(),
      id: zoneId,
      asset_ref: zoneId,
      role: 'graphic',
      bounds: {
        x: Math.max(24, canvas.width - 264),
        y: Math.max(24, canvas.height - 264),
        width: 240,
        height: 240,
      },
      z: Math.max(20, ...zones.map(entry => entry.z + 1)),
    };
    addZone(zone);

    if (isClipMode) {
      const clipDuration = getManifestClipDuration(activeManifest, 5);
      setZoneClipTiming(zoneId, 0, Math.max(clipDuration, 0.1));
    }
  };
  const handleAddVideo = () => {
    addZone(createVideoZone(canvas.width, canvas.height));
  };

  // ── File import/export ───────────────────────
  const handleExport = () => {
    const json = exportTemplate(template);
    downloadJSON(json, `${template.id.replace(/\//g, '_')}.json`);
  };
  const handleImport = () => {
    fileRef.current?.click();
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = importTemplate(reader.result as string);
        setTemplate(parsed);
      } catch (err) {
        alert(`Import failed: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── Cloud CRUD ───────────────────────────────
  const handleSaveToCloud = async () => {
    if (!sessionUser?.email) return;
    setSaving(true);
    try {
      const docId = toDocId(template.id);
      const pendingFiles = useTemplateStore.getState().getPendingFiles();

      // Upload any pending files to Azure (with resize to 200px width)
      if (Object.keys(pendingFiles).length > 0) {
        const { uploadAssetToAzure } = await import('../../lib/storageService');
        for (const [assetKey, file] of Object.entries(pendingFiles)) {
          const existing = template.assets[assetKey] || {
            type: 'image',
            path: file.name,
          };
          const { sourceUri } = await uploadAssetToAzure(docId, file.name, file, {
            assetType: existing.type === 'font' ? 'font' : 'image',
            assetKey,
          });
          const { gcs_path: _legacyGcsPath, ...restAsset } = existing;
          useTemplateStore.getState().setAsset(assetKey, {
            ...restAsset,
            source_uri: sourceUri,
          });
        }
        useTemplateStore.getState().clearPendingFiles();
      }

      // Save updated template (with gcs_paths) to Firestore
      const updatedTemplate = useTemplateStore.getState().template;
      await saveTemplate(updatedTemplate, sessionUser.email);
      await fetchCloudTemplates();
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadFromCloud = async (docId: string) => {
    setCloudLoading(true);
    try {
      const data = await getTemplate(docId);
      if (data) {
        // Ensure compositing_mode defaults
        if (!data.compositing_mode) {
          data.compositing_mode = 'stack';
        }
        setTemplate(data);
      }
    } catch (err) {
      alert(`Load failed: ${(err as Error).message}`);
    } finally {
      setCloudLoading(false);
    }
  };

  const handleDeleteFromCloud = async (docId: string) => {
    try {
      await deleteTemplate(docId);
      setDeleteConfirm(null);
      await fetchCloudTemplates();
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  };

  const handleNewTemplate = () => {
    setTemplate({
      template_version: '1.0',
      id: 'untitled/v1',
      canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
      compositing_mode: 'stack',
      zones: [
        {
          id: 'title_band',
          type: 'text',
          content_ref: 'pov_text',
          bounds: { x: 0, y: 0, width: 1080, height: 270 },
          z: 10,
          text: {
            max_lines: 3,
            overflow: 'shrink',
            font: { family: 'NotoSansDevanagari', weight: 700, fallbacks: [], size: 60 },
            width_percent: 75,
            min_font_size: 24,
            horizontal_align: 'center',
            vertical_align: 'middle',
            line_spacing_px: 6,
          },
          style_ref: 'title_style',
        },
        {
          id: 'logo_mark',
          type: 'image',
          role: 'logo',
          asset_ref: 'logo_mark',
          bounds: { x: 15, y: 15, width: 50 },
          z: 20,
        },
        {
          id: 'video_main',
          type: 'video',
          bounds: { x: 0, y: 270, width: 1080, height: 810 },
          z: 0,
          media: { fit: 'cover', crop_anchor: 'center' },
        },
      ],
      styles: { title_style: { fill: '#000000', bg_fill: '#FFFFFF' } },
      assets: {},
    });
  };

  if (isClipMode) {
    const clipLayersById = new Map(
      getClipLayerDefinitions(zones, activeManifest).map(layer => [layer.zone.id, layer])
    );
    const orderedLayerZones = [
      ...zones.filter(zone => zone.id === sourceLayerId),
      ...zones
        .filter(zone => zone.id !== sourceLayerId)
        .sort((left, right) => right.z - left.z),
    ];

    return (
      <aside className="sidebar sidebar--clip">
        <div className="sidebar__header sidebar__header--clip">
          <div className="sidebar__clip-header-row">
            <div>
              <div className="sidebar__section-title">Layers</div>
              <div className="sidebar__clip-heading">
                <FolderOpen size={15} />
                <span>Source + Overlays</span>
              </div>
            </div>
            <span className="sidebar__mode-pill sidebar__mode-pill--clip">clip</span>
          </div>
          <div className="sidebar__clip-meta">
            <span>{sourceVideoName}</span>
            <span>
              {formatTime(timeWindow?.start)} - {formatTime(timeWindow?.end)}
            </span>
          </div>
        </div>

        <div className="sidebar__clip-actions">
          <button
            className="sidebar__element-btn sidebar__element-btn--clip"
            onClick={handleAddText}
          >
            <span className="sidebar__element-icon sidebar__element-icon--text">
              <Type size={15} />
            </span>
            Text overlay
          </button>
          <button
            className="sidebar__element-btn sidebar__element-btn--clip"
            onClick={handleAddImage}
          >
            <span className="sidebar__element-icon sidebar__element-icon--image">
              <Image size={15} />
            </span>
            Graphic layer
          </button>
        </div>

        <div className="sidebar__clip-bin">
          {orderedLayerZones.map(zone => {
            const clipLayer = clipLayersById.get(zone.id);
            const isSource = zone.id === sourceLayerId;
            const previewValue =
              zone.type === 'text' && zone.content_ref
                ? previewTexts[zone.content_ref]
                : null;
            const secondaryLabel = isSource
              ? `${formatTime(timeWindow?.start)} - ${formatTime(timeWindow?.end)}`
              : clipLayer
                ? `${formatTime(clipLayer.time.start)} - ${formatTime(clipLayer.time.end)}`
                : zone.type === 'image'
                  ? zone.asset_ref || zone.role || 'Image layer'
                  : zone.type === 'text'
                    ? previewValue || 'Text overlay'
                    : 'Layer';

            return (
              <button
                key={zone.id}
                type="button"
                className={`sidebar__asset-item ${selectedZoneId === zone.id ? 'sidebar__asset-item--selected' : ''}`}
                onClick={() => selectZone(zone.id)}
              >
                <span
                  className={`sidebar__asset-thumb sidebar__asset-thumb--${zone.type}`}
                >
                  {zone.type === 'video' && <Film size={15} />}
                  {zone.type === 'text' && <Type size={15} />}
                  {zone.type === 'image' && <Image size={15} />}
                </span>
                <span className="sidebar__asset-copy">
                  <strong>{zone.id}</strong>
                  <span>{secondaryLabel}</span>
                </span>
                {isSource ? (
                  <span className="sidebar__layer-pill">source</span>
                ) : (
                  <span className={`sidebar__zone-dot sidebar__zone-dot--${zone.type}`} />
                )}
              </button>
            );
          })}
        </div>

        <div className="sidebar__clip-footer">
          <div className="sidebar__section-title">Edit Actions</div>
          <div className="sidebar__actions">
            <button
              className="sidebar__action-btn sidebar__action-btn--primary"
              onClick={handleExport}
            >
              <Download size={15} /> Export Layout JSON
            </button>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="sidebar__action-btn sidebar__action-btn--compact"
                onClick={undo}
                disabled={!canUndo()}
                style={{ opacity: canUndo() ? 1 : 0.3, flex: 1 }}
              >
                <Undo2 size={14} /> Undo
              </button>
              <button
                className="sidebar__action-btn sidebar__action-btn--compact"
                onClick={redo}
                disabled={!canRedo()}
                style={{ opacity: canRedo() ? 1 : 0.3, flex: 1 }}
              >
                <Redo2 size={14} /> Redo
              </button>
            </div>
          </div>
        </div>

        <RenderPreview renderRequest={renderPreviewRequest} />
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sidebar__brand">
          <span className="sidebar__brand-dot" />
          <div className="sidebar__brand-copy">
            <span>{isClipMode ? 'Seone Studio' : 'Studio Canvas'}</span>
            <small>
              {isClipMode ? 'Clip layers and timing' : 'Template layouts and overlays'}
            </small>
          </div>
          <span className={`sidebar__mode-pill sidebar__mode-pill--${mode}`}>{mode}</span>
        </div>
      </div>

      {/* Elements */}
      <div className="sidebar__section">
        <div className="sidebar__section-title">
          {isClipMode ? 'Add Overlays' : 'Elements'}
        </div>
        <div className="sidebar__elements">
          <button className="sidebar__element-btn" onClick={handleAddText}>
            <span className="sidebar__element-icon sidebar__element-icon--text">
              <Type size={16} />
            </span>
            {isClipMode ? 'Text Overlay' : 'Text Zone'}
          </button>
          <button className="sidebar__element-btn" onClick={handleAddImage}>
            <span className="sidebar__element-icon sidebar__element-icon--image">
              <Image size={16} />
            </span>
            {isClipMode ? 'Image Layer' : 'Image Zone'}
          </button>
          {!isClipMode && (
            <button className="sidebar__element-btn" onClick={handleAddVideo}>
              <span className="sidebar__element-icon sidebar__element-icon--video">
                <Film size={16} />
              </span>
              Video Zone
            </button>
          )}
        </div>
      </div>

      {isClipMode && activeManifest && (
        <div className="sidebar__section">
          <div className="sidebar__section-title">Clip Context</div>
          <div className="sidebar__summary">
            <div className="sidebar__summary-item">
              <span className="sidebar__summary-label">Source</span>
              <strong
                className="sidebar__summary-value"
                title={sourceVideoKey || 'Attached source video'}
              >
                {sourceVideoName}
              </strong>
            </div>
            <div className="sidebar__summary-item">
              <span className="sidebar__summary-label">Window</span>
              <strong className="sidebar__summary-value">
                {formatTime(timeWindow?.start)} - {formatTime(timeWindow?.end)}
              </strong>
            </div>
            <div className="sidebar__summary-item">
              <span className="sidebar__summary-label">Overlays</span>
              <strong className="sidebar__summary-value">{overlayCount}</strong>
            </div>
            <div className="sidebar__summary-item">
              <span className="sidebar__summary-label">Canvas</span>
              <strong className="sidebar__summary-value">
                {canvas.width}×{canvas.height}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Zone list */}
      {zones.length > 0 && (
        <div className="sidebar__section">
          <div className="sidebar__section-title">
            {isClipMode ? 'Clip Layers' : `Layers (${zones.length})`}
          </div>
          <div className="sidebar__zone-list">
            {[...zones]
              .sort((a, b) => b.z - a.z)
              .map(zone => (
                <div
                  key={zone.id}
                  className={`sidebar__zone-item ${selectedZoneId === zone.id ? 'sidebar__zone-item--selected' : ''}`}
                  onClick={() => selectZone(zone.id)}
                >
                  <span className={`sidebar__zone-dot sidebar__zone-dot--${zone.type}`} />
                  <span className="sidebar__zone-name">{zone.id}</span>
                  {isClipMode && zone.id === sourceLayerId && (
                    <span className="sidebar__layer-pill">source</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Cloud Templates */}
      {!isClipMode && cloudEnabled && (
        <div className="sidebar__section">
          <div
            className="sidebar__section-title"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Cloud size={12} /> Cloud Templates
            <button
              className="sidebar__refresh-btn"
              onClick={fetchCloudTemplates}
              disabled={cloudLoading}
              title="Refresh"
            >
              {cloudLoading ? <Loader2 size={11} className="sidebar__spinner" /> : '↻'}
            </button>
          </div>

          {cloudError && <div className="sidebar__cloud-error">{cloudError}</div>}

          <div className="sidebar__cloud-list">
            {cloudTemplates.map(t => (
              <div
                key={t.docId}
                className={`sidebar__cloud-item ${toDocId(template.id) === t.docId ? 'sidebar__cloud-item--active' : ''}`}
              >
                <div
                  className="sidebar__cloud-item-info"
                  onClick={() => handleLoadFromCloud(t.docId)}
                >
                  <span className="sidebar__cloud-item-name">{t.name}</span>
                  <span className="sidebar__cloud-item-meta">
                    {t.canvasWidth}×{t.canvasHeight} · {t.zoneCount}z
                  </span>
                </div>
                {deleteConfirm === t.docId ? (
                  <div className="sidebar__cloud-item-confirm">
                    <button
                      onClick={() => handleDeleteFromCloud(t.docId)}
                      className="sidebar__cloud-delete-yes"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="sidebar__cloud-delete-no"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className="sidebar__cloud-delete-btn"
                    onClick={() => setDeleteConfirm(t.docId)}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {!cloudLoading && cloudTemplates.length === 0 && !cloudError && (
              <div className="sidebar__cloud-empty">No templates in cloud</div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="sidebar__section" style={{ marginTop: 'auto' }}>
        <div className="sidebar__section-title">
          {isClipMode ? 'Edit Actions' : 'Actions'}
        </div>
        <div className="sidebar__actions">
          {!isClipMode && cloudEnabled && (
            <button
              className="sidebar__action-btn sidebar__action-btn--primary"
              onClick={handleSaveToCloud}
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={15} className="sidebar__spinner" />
              ) : (
                <CloudUpload size={15} />
              )}
              {saving ? 'Saving…' : 'Save to Cloud'}
            </button>
          )}
          {!isClipMode && (
            <button className="sidebar__action-btn" onClick={handleNewTemplate}>
              <FilePlus size={15} /> New Template
            </button>
          )}
          {!isClipMode && (
            <button className="sidebar__action-btn" onClick={handleImport}>
              <Upload size={15} /> Import JSON
            </button>
          )}
          <button className="sidebar__action-btn" onClick={handleExport}>
            <Download size={15} /> {isClipMode ? 'Export Layout JSON' : 'Export JSON'}
          </button>
          {!isClipMode && previewEnabled && (
            <button
              className="sidebar__action-btn sidebar__action-btn--accent"
              onClick={onTest}
            >
              <FlaskConical size={15} /> Test Template
            </button>
          )}
          {!isClipMode && (
            <button className="sidebar__action-btn" onClick={() => setManifestOpen(true)}>
              <FileDown size={15} /> Load Manifest
            </button>
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="sidebar__action-btn"
              onClick={undo}
              disabled={!canUndo()}
              style={{ opacity: canUndo() ? 1 : 0.3, flex: 1 }}
            >
              <Undo2 size={15} /> Undo
            </button>
            <button
              className="sidebar__action-btn"
              onClick={redo}
              disabled={!canRedo()}
              style={{ opacity: canRedo() ? 1 : 0.3, flex: 1 }}
            >
              <Redo2 size={15} /> Redo
            </button>
          </div>
        </div>
      </div>

      {/* User bar */}
      {sessionUser && (
        <div className="sidebar__user-bar">
          {sessionUser.photoURL ? (
            <img
              src={sessionUser.photoURL}
              alt={`${sessionUser.email || 'User'} avatar`}
              className="sidebar__user-avatar"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="sidebar__user-avatar sidebar__user-avatar--fallback"
              aria-hidden="true"
            >
              {(sessionUser.email || 'S').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="sidebar__user-email">{sessionUser.email}</span>
          <button
            className="sidebar__signout-btn"
            onClick={() => {
              void onSignOut?.();
            }}
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="sidebar__file-input"
        onChange={handleFileChange}
      />

      {/* Manifest loader modal */}
      {!isClipMode && manifestOpen && (
        <ManifestLoader onClose={() => setManifestOpen(false)} />
      )}

      {/* Re-render preview */}
      <RenderPreview renderRequest={renderPreviewRequest} />
    </aside>
  );
}
