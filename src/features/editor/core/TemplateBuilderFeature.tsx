'use client';

import { useEffect, useState } from 'react';
import Sidebar, { type SidebarSessionUser } from '../components/Sidebar/Sidebar';
import TemplateFontRegistrar from '../components/Fonts/TemplateFontRegistrar';
import type { RenderPreviewRequest } from '../components/RenderPreview/RenderPreview';
import CanvasWorkspace from '../components/Canvas/CanvasWorkspace';
import PropertyInspector from '../components/Inspector/PropertyInspector';
import ClipStudioWorkspace from '../components/Studio/ClipStudioWorkspace';
import Toolbar from '../components/Toolbar/Toolbar';
import PreviewPanel from '../components/Preview/PreviewPanel';
import { LOCAL_PREVIEW_ENABLED } from '../lib/featureFlags';
import { useTemplateStore } from '../store/templateStore';
import type { StudioEditorState } from '../types/studioUi';
import RenderPreview from '../components/RenderPreview/RenderPreview';

export type EditorMode = 'template' | 'clip';
export type ClipStudioRailTab = 'properties' | 'preview';

export interface TemplateBuilderFeatureProps {
  mode?: EditorMode;
  previewEnabled?: boolean;
  sessionUser?: SidebarSessionUser | null;
  onSignOut?: (() => Promise<void>) | (() => void);
  renderPreviewRequest?: RenderPreviewRequest | null;
  clipStudioSource?: 'draft' | 'original';
  clipStudioSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  clipStudioSaveError?: string | null;
  onClipStudioDownload?: (() => void) | null;
  clipStudioExporting?: boolean;
  clipStudioRailTab?: ClipStudioRailTab;
  onClipStudioRailTabChange?: ((tab: ClipStudioRailTab) => void) | null;
  clipStudioEditorState?: StudioEditorState | null;
  clipStudioLayoutAuthority?: 'exact' | 'stale_exact' | 'unavailable';
  clipStudioLayoutAuthorityReason?: string | null;
  onClipStudioGeneratePreview?: (() => Promise<void> | void) | null;
}

/**
 * Embed-ready editor workspace.
 *
 * App boot, auth, and routing should wrap this component rather than
 * being baked into the editor layout itself.
 */
export default function TemplateBuilderFeature({
  mode = 'template',
  previewEnabled = LOCAL_PREVIEW_ENABLED,
  sessionUser = null,
  onSignOut,
  renderPreviewRequest = null,
  clipStudioSource = 'original',
  clipStudioSaveStatus = 'idle',
  clipStudioSaveError = null,
  onClipStudioDownload = null,
  clipStudioExporting = false,
  clipStudioRailTab = 'properties',
  onClipStudioRailTabChange = null,
  clipStudioEditorState = null,
  clipStudioLayoutAuthority = 'exact',
  clipStudioLayoutAuthorityReason = null,
  onClipStudioGeneratePreview = null,
}: TemplateBuilderFeatureProps) {
  const {
    undo,
    redo,
    selectedZoneId,
    interactionMode,
    removeZone,
    duplicateZone,
    endTextEditing,
  } = useTemplateStore();
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditableTarget =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        Boolean(target?.isContentEditable);

      if (e.key === 'Escape' && interactionMode === 'editing_text') {
        e.preventDefault();
        endTextEditing(true);
        return;
      }

      if (ctrl && e.key === 'z' && !e.shiftKey) {
        if (isEditableTarget) return;
        e.preventDefault();
        undo();
      }
      if ((ctrl && e.key === 'z' && e.shiftKey) || (ctrl && e.key === 'y')) {
        if (isEditableTarget) return;
        e.preventDefault();
        redo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedZoneId) {
        if (isEditableTarget) return;
        e.preventDefault();
        removeZone(selectedZoneId);
      }
      if (ctrl && e.key === 'd' && selectedZoneId) {
        if (isEditableTarget) return;
        e.preventDefault();
        duplicateZone(selectedZoneId);
      }
      if (e.key === 'Escape' && showPreview) {
        setShowPreview(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    undo,
    redo,
    selectedZoneId,
    interactionMode,
    removeZone,
    duplicateZone,
    showPreview,
    endTextEditing,
    mode,
  ]);

  const showInspector = mode !== 'clip' || selectedZoneId !== null;

  return (
    <div className={`app ${mode === 'clip' ? 'app--clip' : 'app--template'}`}>
      <TemplateFontRegistrar />
      {mode === 'clip' ? (
        <div className="app__body app__body--clip">
          <div className="app__clip-main">
            <ClipStudioWorkspace
              renderPreviewRequest={renderPreviewRequest}
              layoutAuthority={clipStudioLayoutAuthority}
              layoutAuthorityReason={clipStudioLayoutAuthorityReason}
            />
          </div>
          <aside className="app__clip-side-panel">
            <div
              className="app__clip-side-tabs"
              role="tablist"
              aria-label="Clip Studio Panel"
            >
              <button
                type="button"
                role="tab"
                aria-selected={clipStudioRailTab === 'properties'}
                className={`app__clip-side-tab ${
                  clipStudioRailTab === 'properties' ? 'app__clip-side-tab--active' : ''
                }`}
                onClick={() => onClipStudioRailTabChange?.('properties')}
              >
                Properties
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={clipStudioRailTab === 'preview'}
                className={`app__clip-side-tab ${
                  clipStudioRailTab === 'preview' ? 'app__clip-side-tab--active' : ''
                }`}
                onClick={() => onClipStudioRailTabChange?.('preview')}
              >
                Render Preview
              </button>
            </div>
            <div className="app__clip-side-content">
              {clipStudioRailTab === 'preview' ? (
                <RenderPreview
                  renderRequest={renderPreviewRequest}
                  editorState={clipStudioEditorState}
                  onGeneratePreview={onClipStudioGeneratePreview}
                />
              ) : (
                <PropertyInspector
                  renderPreviewRequest={renderPreviewRequest}
                  embedded
                  studioEditorState={clipStudioEditorState}
                />
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="app__body">
          <Sidebar
            onTest={() => setShowPreview(true)}
            mode={mode}
            previewEnabled={previewEnabled}
            sessionUser={sessionUser}
            onSignOut={onSignOut}
            renderPreviewRequest={renderPreviewRequest}
          />
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Toolbar mode={mode} />
            <CanvasWorkspace />
          </div>
          {showInspector && (
            <PropertyInspector renderPreviewRequest={renderPreviewRequest} />
          )}
        </div>
      )}

      {previewEnabled && showPreview && (
        <PreviewPanel onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
