'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CopyPlus,
  Download,
  Film,
  Grid3x3,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  ZoomIn,
  ZoomOut,
  Lock,
} from 'lucide-react';
import CanvasWorkspace from '../components/Canvas/CanvasWorkspace';
import PropertyInspector from '../components/Inspector/PropertyInspector';
import {
  deleteTemplate,
  getTemplate,
  listTemplates,
  saveTemplate,
  toDocId,
  type TemplateListItem,
} from '../lib/firestoreService';
import {
  isAzureAssetUploadConfigured,
  uploadAssetToAzure,
} from '../lib/storageService';
import { useTemplateStore } from '../store/templateStore';
import type { TemplateJSON, ZoneSpec } from '../types/template';
import { createImageZone, createTextZone, createVideoZone } from '../utils/defaults';
import { downloadJSON, exportTemplate } from '../utils/exportTemplate';
import { importTemplate } from '../utils/importTemplate';
import styles from './TemplateAdminPanel.module.css';

interface TemplateAdminPanelProps {
  userEmail?: string | null;
}

type AdminView = 'library' | 'editor';
type CanvasPresetKey = '1080x1080' | '1080x1350' | '1920x1080';

interface NamingModalState {
  mode: 'create' | 'duplicate' | 'saveAs';
  name: string;
  version: string;
  preset: CanvasPresetKey;
  sourceTemplate: TemplateJSON | null;
  allowCanvasPresetChange: boolean;
  showTagsInput: string;
}

const CANVAS_PRESETS: Array<{
  key: CanvasPresetKey;
  label: string;
  width: number;
  height: number;
}> = [
    { key: '1080x1080', label: 'Square 1080×1080', width: 1080, height: 1080 },
    { key: '1080x1350', label: 'Portrait 1080×1350', width: 1080, height: 1350 },
    { key: '1920x1080', label: 'Landscape 1920×1080', width: 1920, height: 1080 },
  ];

function cloneTemplate(template: TemplateJSON): TemplateJSON {
  return JSON.parse(JSON.stringify(template));
}

function slugifyTemplateName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'untitled'
  );
}

function buildTemplateId(name: string, version: string): string {
  const safeVersion = version.trim() || 'v1';
  return `${slugifyTemplateName(name)}/${safeVersion}`;
}

function parseTemplateId(templateId: string): { name: string; version: string } {
  const [rawName = 'untitled', rawVersion = 'v1'] = templateId.split('/');
  const name =
    rawName
      .split(/[_-]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Untitled';
  return { name, version: rawVersion };
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

/**
 * Normalize raw comma-separated tag input into a canonical list:
 * trim, drop empties, lowercase for consistency, dedupe.
 */
function normalizeShowTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(',')) {
    const tag = part.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function createBaseTemplate(
  name: string,
  version: string,
  width: number,
  height: number,
  showTags: string[] = []
): TemplateJSON {
  return {
    template_version: '1.0',
    id: buildTemplateId(name, version),
    canvas: { width, height, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'stack',
    zones: [
      createTextZone(width, height),
      createImageZone(),
      createVideoZone(width, height),
    ],
    styles: {
      title_style: { fill: '#000000', bg_fill: '#FFFFFF' },
    },
    assets: {},
    show_tags: showTags,
  };
}

function formatUpdatedAt(value?: string): string {
  if (!value) return 'Recently updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function mapAdminError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;

  if (message.includes('401')) {
    return 'Your session is missing or expired. Sign in again to manage templates.';
  }

  if (message.includes('503') || /template storage is unavailable/i.test(message)) {
    return 'Template storage is unavailable right now. Check Firestore and template-storage configuration.';
  }

  if (
    message.includes('NEXT_PUBLIC_AZURE_SAS_URL') ||
    message.includes('upload is not available')
  ) {
    return 'Asset upload is not available.';
  }

  return message || fallback;
}

export default function TemplateAdminPanel({
  userEmail = null,
}: TemplateAdminPanelProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const {
    template: storeTemplate,
    selectedZoneId,
    zoom,
    setZoom,
    addZone,
    selectZone,
    duplicateZone,
    removeZone,
    toggleLock,
    isLocked,
    undo,
    redo,
    canUndo,
    canRedo,
    setTemplate,
    setPreviewText,
    toggleGrid,
    gridSnap,
    assetPreviewError,
  } = useTemplateStore();
  const template = storeTemplate ?? createBaseTemplate('Untitled', 'v1', 1080, 1080);
  const { zones, canvas } = template;

  const [view, setView] = useState<AdminView>('library');
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showLibraryAdvanced, setShowLibraryAdvanced] = useState(false);
  const [showEditorAdvanced, setShowEditorAdvanced] = useState(false);
  const [namingModal, setNamingModal] = useState<NamingModalState | null>(null);
  const [baselineTemplate, setBaselineTemplate] = useState<TemplateJSON | null>(null);
  const [isUnsavedTemplate, setIsUnsavedTemplate] = useState(false);

  const selectedZone = zones.find(zone => zone.id === selectedZoneId) ?? null;
  const selectedZoneLocked = selectedZoneId ? isLocked(selectedZoneId) : false;

  const baselineSerialized = useMemo(
    () => (baselineTemplate ? JSON.stringify(baselineTemplate) : ''),
    [baselineTemplate]
  );
  const currentSerialized = useMemo(() => JSON.stringify(template), [template]);
  const isDirty =
    view === 'editor' && baselineTemplate
      ? baselineSerialized !== currentSerialized
      : false;
  const currentTemplateMeta = parseTemplateId(template.id);
  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter(
      item =>
        item.name.toLowerCase().includes(query) ||
        item.templateId.toLowerCase().includes(query)
    );
  }, [search, templates]);

  const refreshTemplates = async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const result = await listTemplates();
      setTemplates(result);
    } catch (error) {
      setLibraryError(mapAdminError(error, 'Failed to load templates'));
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    void refreshTemplates();
  }, []);

  useEffect(() => {
    if (view !== 'editor') return undefined;

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
      if (!selectedZoneId) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      removeZone(selectedZoneId);
      selectZone(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeZone, selectZone, selectedZoneId, view]);

  const openEditor = (nextTemplate: TemplateJSON, options?: { unsaved?: boolean }) => {
    setTemplate(cloneTemplate(nextTemplate));
    setBaselineTemplate(cloneTemplate(nextTemplate));
    setIsUnsavedTemplate(Boolean(options?.unsaved));
    setView('editor');
    setSaveState('idle');
    setSaveError(null);
    setShowEditorAdvanced(false);
    selectZone(null);
  };

  const handleOpenTemplate = async (docId: string) => {
    setEditorLoading(true);
    setSaveError(null);
    try {
      const nextTemplate = await getTemplate(docId);
      if (!nextTemplate) {
        throw new Error('Template not found');
      }
      openEditor(nextTemplate, { unsaved: false });
    } catch (error) {
      setLibraryError(mapAdminError(error, 'Failed to open template'));
    } finally {
      setEditorLoading(false);
    }
  };

  const handleDeleteTemplate = async (docId: string) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      await deleteTemplate(docId);
      await refreshTemplates();
    } catch (error) {
      setLibraryError(mapAdminError(error, 'Failed to delete template'));
    }
  };

  const handleImportTemplate = () => {
    importInputRef.current?.click();
  };

  const handleImportedFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = importTemplate(reader.result as string);
        openEditor(parsed, { unsaved: true });
      } catch (error) {
        setLibraryError(mapAdminError(error, 'Failed to import template'));
      }
    };
    reader.readAsText(file);
    event.currentTarget.value = '';
  };

  const openCreateModal = () => {
    setNamingModal({
      mode: 'create',
      name: '',
      version: 'v1',
      preset: '1080x1080',
      sourceTemplate: null,
      allowCanvasPresetChange: true,
      showTagsInput: '',
    });
  };

  const openDuplicateModal = async (docId: string) => {
    setEditorLoading(true);
    try {
      const sourceTemplate = await getTemplate(docId);
      if (!sourceTemplate) throw new Error('Template not found');
      const meta = parseTemplateId(sourceTemplate.id);
      const preset =
        CANVAS_PRESETS.find(
          option =>
            option.width === sourceTemplate.canvas.width &&
            option.height === sourceTemplate.canvas.height
        )?.key ?? '1080x1080';
      setNamingModal({
        mode: 'duplicate',
        name: `${meta.name} Copy`,
        version: meta.version,
        preset,
        sourceTemplate,
        allowCanvasPresetChange: false,
        showTagsInput: (sourceTemplate.show_tags ?? []).join(', '),
      });
    } catch (error) {
      setLibraryError(mapAdminError(error, 'Failed to duplicate template'));
    } finally {
      setEditorLoading(false);
    }
  };

  const openSaveAsModal = () => {
    const preset =
      CANVAS_PRESETS.find(
        option =>
          option.width === template.canvas.width &&
          option.height === template.canvas.height
      )?.key ?? '1080x1080';
    setNamingModal({
      mode: 'saveAs',
      name: `${currentTemplateMeta.name} Copy`,
      version: currentTemplateMeta.version,
      preset,
      sourceTemplate: cloneTemplate(template),
      allowCanvasPresetChange: false,
      showTagsInput: (template.show_tags ?? []).join(', '),
    });
  };

  const uploadPendingAssets = async (
    templateToSave: TemplateJSON,
    docId: string
  ): Promise<TemplateJSON> => {
    const pendingFiles = useTemplateStore.getState().getPendingFiles();
    if (Object.keys(pendingFiles).length === 0) {
      return cloneTemplate(templateToSave);
    }
    if (!isAzureAssetUploadConfigured()) {
      throw new Error('Asset upload is not available.');
    }

    const nextTemplate = cloneTemplate(templateToSave);
    for (const [assetKey, file] of Object.entries(pendingFiles)) {
      const existingAsset = nextTemplate.assets[assetKey] || {
        type: 'image',
        path: file.name,
      };
      const assetType = existingAsset.type === 'font' ? 'font' : 'image';
      const { sourceUri } = await uploadAssetToAzure(docId, file.name, file, {
        assetType,
        assetKey,
      });
      const { gcs_path: _legacyGcsPath, ...restAsset } = existingAsset;
      nextTemplate.assets[assetKey] = {
        ...restAsset,
        source_uri: sourceUri,
      };
    }

    useTemplateStore.getState().clearPendingFiles();
    return nextTemplate;
  };

  const persistTemplate = async (templateToSave: TemplateJSON) => {
    setSaveState('saving');
    setSaveError(null);
    try {
      const docId = toDocId(templateToSave.id);
      const hydratedTemplate = await uploadPendingAssets(templateToSave, docId);
      await saveTemplate(hydratedTemplate, userEmail || 'admin');
      useTemplateStore.setState({ template: hydratedTemplate });
      setBaselineTemplate(cloneTemplate(hydratedTemplate));
      setIsUnsavedTemplate(false);
      setSaveState('saved');
      await refreshTemplates();
      window.setTimeout(() => {
        setSaveState(current => (current === 'saved' ? 'idle' : current));
      }, 1400);
    } catch (error) {
      setSaveState('error');
      setSaveError(mapAdminError(error, 'Failed to save template'));
    }
  };

  const handleNamingSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!namingModal) return;

    const preset =
      CANVAS_PRESETS.find(option => option.key === namingModal.preset) ??
      CANVAS_PRESETS[0];
    if (namingModal.mode === 'create') {
      const nextTemplate = createBaseTemplate(
        namingModal.name || 'Untitled',
        namingModal.version,
        preset.width,
        preset.height,
        normalizeShowTags(namingModal.showTagsInput)
      );
      openEditor(nextTemplate, { unsaved: true });
      setNamingModal(null);
      return;
    }

    const sourceTemplate = namingModal.sourceTemplate
      ? cloneTemplate(namingModal.sourceTemplate)
      : cloneTemplate(template);
    sourceTemplate.id = buildTemplateId(
      namingModal.name || 'Untitled',
      namingModal.version
    );
    sourceTemplate.show_tags = normalizeShowTags(namingModal.showTagsInput);

    if (namingModal.mode === 'duplicate') {
      openEditor(sourceTemplate, { unsaved: true });
      setNamingModal(null);
      return;
    }

    setNamingModal(null);
    await persistTemplate(sourceTemplate);
  };

  const handleSave = async () => {
    await persistTemplate(template);
  };

  const handleDiscard = () => {
    if (!baselineTemplate) return;
    setTemplate(cloneTemplate(baselineTemplate));
    setSaveState('idle');
    setSaveError(null);
    selectZone(null);
  };

  const handleBackToLibrary = () => {
    if (
      (isDirty || isUnsavedTemplate) &&
      !window.confirm('Discard unsaved changes and return to the template library?')
    ) {
      return;
    }
    setView('library');
    setSaveError(null);
    setShowEditorAdvanced(false);
    selectZone(null);
  };

  const handleExportJson = () => {
    const payload = exportTemplate(template);
    downloadJSON(payload, `${template.id.replace(/\//g, '_')}.json`);
  };

  const handleDeleteSelectedLayer = () => {
    if (!selectedZoneId) return;
    removeZone(selectedZoneId);
    selectZone(null);
  };

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
  };

  const handleAddImage = () => {
    const zoneId = buildUniqueId(
      'graphic_layer',
      zones.map(zone => zone.id)
    );
    const zone: ZoneSpec = {
      ...createImageZone(),
      id: zoneId,
      asset_ref: zoneId,
      role: 'graphic',
      z: Math.max(20, ...zones.map(entry => entry.z + 1)),
    };
    addZone(zone);
  };

  const handleAddVideo = () => {
    const zoneId = buildUniqueId(
      'video_layer',
      zones.map(zone => zone.id)
    );
    const zone: ZoneSpec = {
      ...createVideoZone(canvas.width, canvas.height),
      id: zoneId,
      z: Math.max(0, ...zones.map(entry => entry.z + 1)),
    };
    addZone(zone);
  };

  const saveButtonDisabled = saveState === 'saving' || (!isDirty && !isUnsavedTemplate);
  const orderedZones = [...zones].sort((left, right) => right.z - left.z);

  return (
    <div className={styles.admin}>
      <input
        ref={importInputRef}
        type="file"
        accept=".json"
        className={styles.hiddenInput}
        onChange={handleImportedFile}
      />

      {namingModal && (
        <div className={styles.modalBackdrop}>
          <form className={styles.modal} onSubmit={handleNamingSubmit}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalEyebrow}>
                  {namingModal.mode === 'create'
                    ? 'Create template'
                    : namingModal.mode === 'duplicate'
                      ? 'Duplicate template'
                      : 'Save as new'}
                </div>
                <h2 className={styles.modalTitle}>
                  {namingModal.mode === 'create' ? 'New template' : 'Template details'}
                </h2>
              </div>
            </div>
            <label className={styles.modalField}>
              <span>Name</span>
              <input
                type="text"
                value={namingModal.name}
                onChange={event =>
                  setNamingModal({ ...namingModal, name: event.target.value })
                }
                placeholder="Chaturnath"
                required
              />
            </label>
            <label className={styles.modalField}>
              <span>Version</span>
              <input
                type="text"
                value={namingModal.version}
                onChange={event =>
                  setNamingModal({ ...namingModal, version: event.target.value })
                }
                placeholder="v1"
                required
              />
            </label>
            <label className={styles.modalField}>
              <span>Canvas preset</span>
              <select
                value={namingModal.preset}
                disabled={!namingModal.allowCanvasPresetChange}
                onChange={event =>
                  setNamingModal({
                    ...namingModal,
                    preset: event.target.value as CanvasPresetKey,
                  })
                }
              >
                {CANVAS_PRESETS.map(preset => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.modalField}>
              <span>Show tags</span>
              <input
                type="text"
                value={namingModal.showTagsInput}
                onChange={event =>
                  setNamingModal({ ...namingModal, showTagsInput: event.target.value })
                }
                placeholder="e.g. chaturnath, tenali"
              />
              <span className={styles.modalHint}>Comma-separated show names for filtering</span>
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => setNamingModal(null)}
              >
                Cancel
              </button>
              <button type="submit" className={styles.modalPrimary}>
                {namingModal.mode === 'saveAs' ? 'Save copy' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      )}

      {view === 'library' ? (
        <section className={styles.library}>
          <header className={styles.libraryHeader}>
            <div>
              <div className={styles.eyebrow}>Template library</div>
              <h1 className={styles.title}>Templates</h1>
              <p className={styles.subtitle}>
                Create, open, and manage reusable Seone layouts without dropping into a
                raw editor first.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowLibraryAdvanced(value => !value)}
              >
                {showLibraryAdvanced ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
                Advanced
              </button>
              <button className={styles.primaryButton} onClick={openCreateModal}>
                <Plus size={16} />
                Create New
              </button>
            </div>
          </header>

          <div className={styles.searchRow}>
            <label className={styles.searchField}>
              <Search size={16} />
              <input
                type="text"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search templates"
              />
            </label>
            <button
              className={styles.iconButton}
              onClick={() => void refreshTemplates()}
              aria-label="Refresh templates"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {showLibraryAdvanced && (
            <div className={styles.advancedBar}>
              <button className={styles.secondaryButton} onClick={handleImportTemplate}>
                <Upload size={15} />
                Import JSON
              </button>
            </div>
          )}

          {libraryError && (
            <div className={styles.errorBanner} data-testid="admin-library-error">
              {libraryError}
            </div>
          )}

          {libraryLoading ? (
            <div className={styles.emptyState}>
              <Loader2 size={18} className={styles.spinner} />
              <span>Loading templates…</span>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>
                {templates.length === 0 ? 'No templates yet' : 'No matching templates'}
              </h2>
              <p>
                {templates.length === 0
                  ? 'Start with a clean template and save it once you are happy with the layout.'
                  : 'Try a different search or create a new template from scratch.'}
              </p>
              {templates.length === 0 && (
                <button className={styles.primaryButton} onClick={openCreateModal}>
                  <Plus size={16} />
                  Create your first template
                </button>
              )}
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filteredTemplates.map(item => (
                <article key={item.docId} className={styles.templateCard}>
                  <div className={styles.templateCardHeader}>
                    <div>
                      <h2 className={styles.templateCardTitle}>{item.name}</h2>
                      <p className={styles.templateCardMeta}>
                        {item.canvasWidth}×{item.canvasHeight} · {item.zoneCount} zones
                      </p>
                      {item.showTags.length > 0 && (
                        <div className={styles.tagChips}>
                          {item.showTags.map(tag => (
                            <span key={tag} className={styles.tagChip}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className={styles.templateCardStamp}>
                      {formatUpdatedAt(item.updatedAt)}
                    </span>
                  </div>
                  <div className={styles.templateCardFooter}>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => void handleOpenTemplate(item.docId)}
                    >
                      Open
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => void openDuplicateModal(item.docId)}
                    >
                      <CopyPlus size={15} />
                      Duplicate
                    </button>
                    <button
                      className={styles.dangerButton}
                      onClick={() => void handleDeleteTemplate(item.docId)}
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className={styles.editor}>
          <header className={styles.editorTopbar}>
            <div className={styles.editorTopbarLeft}>
              <button className={styles.secondaryButton} onClick={handleBackToLibrary}>
                <ArrowLeft size={16} />
                Back to Library
              </button>
              <div className={styles.editorTitleBlock}>
                <div className={styles.editorTitleRow}>
                  <h1 className={styles.editorTitle}>{currentTemplateMeta.name}</h1>
                  <span className={styles.editorVersion}>
                    {currentTemplateMeta.version}
                  </span>
                  {(isUnsavedTemplate || isDirty) && (
                    <span className={styles.dirtyBadge}>
                      {isUnsavedTemplate ? 'Unsaved' : 'Modified'}
                    </span>
                  )}
                  {saveState === 'saved' && (
                    <span className={styles.savedBadge}>Saved</span>
                  )}
                </div>
                <p className={styles.editorSubtitle}>
                  {canvas.width}×{canvas.height} · {zones.length} layers
                </p>
              </div>
            </div>

            <div className={styles.editorTopbarCenter}>
              <button
                className={styles.iconButton}
                onClick={() => setZoom(zoom - 0.1)}
                aria-label="Zoom out"
              >
                <ZoomOut size={16} />
              </button>
              <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
              <button
                className={styles.iconButton}
                onClick={() => setZoom(zoom + 0.1)}
                aria-label="Zoom in"
              >
                <ZoomIn size={16} />
              </button>
              <button className={styles.secondaryButton} onClick={() => setZoom(1)}>
                <RotateCcw size={15} />
                Fit
              </button>
            </div>

            <div className={styles.editorTopbarRight}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowEditorAdvanced(value => !value)}
              >
                {showEditorAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Advanced
              </button>
              {selectedZone && (
                <button
                  className={styles.dangerButton}
                  onClick={handleDeleteSelectedLayer}
                >
                  <Trash2 size={15} />
                  Delete Layer
                </button>
              )}
              <button className={styles.secondaryButton} onClick={openSaveAsModal}>
                Save as New
              </button>
              <button
                className={styles.secondaryButton}
                onClick={handleDiscard}
                disabled={!isDirty}
              >
                Discard
              </button>
              <button
                className={styles.primaryButton}
                onClick={() => void handleSave()}
                disabled={saveButtonDisabled}
              >
                {saveState === 'saving' ? (
                  <Loader2 size={16} className={styles.spinner} />
                ) : (
                  <Save size={16} />
                )}
                Save
              </button>
            </div>
          </header>

          {saveError && (
            <div className={styles.errorBanner} data-testid="admin-save-error">
              {saveError}
            </div>
          )}
          {assetPreviewError && (
            <div className={styles.errorBanner} data-testid="admin-asset-preview-error">
              {assetPreviewError}
            </div>
          )}

          <div className={styles.editorShell}>
            <aside className={styles.leftRail}>
              <section className={styles.panelSection}>
                <div className={styles.panelSectionTitle}>Add</div>
                <button className={styles.addButton} onClick={handleAddText}>
                  <span className={`${styles.addIcon} ${styles.addIconText}`}>
                    <Type size={16} />
                  </span>
                  <span>Text</span>
                </button>
                <button className={styles.addButton} onClick={handleAddImage}>
                  <span className={`${styles.addIcon} ${styles.addIconImage}`}>
                    <ImageIcon size={16} />
                  </span>
                  <span>Image</span>
                </button>
                <button className={styles.addButton} onClick={handleAddVideo}>
                  <span className={`${styles.addIcon} ${styles.addIconVideo}`}>
                    <Film size={16} />
                  </span>
                  <span>Video</span>
                </button>
              </section>

              <section className={styles.panelSection}>
                <div className={styles.panelSectionTitle}>Layers</div>
                <div className={styles.layerList}>
                  {orderedZones.map(zone => (
                    <button
                      key={zone.id}
                      type="button"
                      className={`${styles.layerItem} ${selectedZoneId === zone.id ? styles.layerItemActive : ''}`}
                      onClick={() => selectZone(zone.id)}
                    >
                      <span
                        className={`${styles.layerDot} ${zone.type === 'text'
                          ? styles.layerDotText
                          : zone.type === 'image'
                            ? styles.layerDotImage
                            : styles.layerDotVideo
                          }`}
                      />
                      <span className={styles.layerName}>{zone.id}</span>
                    </button>
                  ))}
                </div>
                {selectedZone && (
                  <button
                    className={styles.layerDeleteButton}
                    onClick={handleDeleteSelectedLayer}
                  >
                    <Trash2 size={15} />
                    Delete selected layer
                  </button>
                )}
              </section>

              {showEditorAdvanced && (
                <section className={styles.panelSection}>
                  <div className={styles.panelSectionTitle}>Advanced</div>
                  <div className={styles.advancedActions}>
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.secondaryButton}
                        onClick={undo}
                        disabled={!canUndo()}
                      >
                        <Undo2 size={15} />
                        Undo
                      </button>
                      <button
                        className={styles.secondaryButton}
                        onClick={redo}
                        disabled={!canRedo()}
                      >
                        <RotateCcw size={15} />
                        Redo
                      </button>
                    </div>
                    <button className={styles.secondaryButton} onClick={handleExportJson}>
                      <Download size={15} />
                      Export JSON
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={handleImportTemplate}
                    >
                      <Upload size={15} />
                      Import JSON
                    </button>
                    <button className={styles.secondaryButton} onClick={toggleGrid}>
                      <Grid3x3 size={15} />
                      Grid snap {gridSnap ? 'on' : 'off'}
                    </button>
                    {selectedZone && (
                      <>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => duplicateZone(selectedZone.id)}
                        >
                          <CopyPlus size={15} />
                          Duplicate layer
                        </button>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => toggleLock(selectedZone.id)}
                        >
                          {selectedZoneLocked ? <Unlock size={15} /> : <Lock size={15} />}
                          {selectedZoneLocked ? 'Unlock layer' : 'Lock layer'}
                        </button>
                        <button
                          className={styles.dangerButton}
                          onClick={() => removeZone(selectedZone.id)}
                        >
                          <Trash2 size={15} />
                          Delete layer
                        </button>
                      </>
                    )}
                  </div>
                </section>
              )}
            </aside>

            <div className={styles.canvasColumn}>
              <CanvasWorkspace />
              {editorLoading && (
                <div className={styles.editorOverlay}>
                  <Loader2 size={20} className={styles.spinner} />
                  <span>Opening template…</span>
                </div>
              )}
            </div>

            <div className={styles.inspectorColumn}>
              <PropertyInspector variant="admin" />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
