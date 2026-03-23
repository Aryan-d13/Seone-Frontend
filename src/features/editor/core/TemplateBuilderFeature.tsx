import { useEffect, useState } from 'react';
import Sidebar, { type SidebarSessionUser } from '../components/Sidebar/Sidebar';
import type { RenderPreviewRequest } from '../components/RenderPreview/RenderPreview';
import CanvasWorkspace from '../components/Canvas/CanvasWorkspace';
import PropertyInspector from '../components/Inspector/PropertyInspector';
import ClipStudioWorkspace from '../components/Studio/ClipStudioWorkspace';
import Toolbar from '../components/Toolbar/Toolbar';
import PreviewPanel from '../components/Preview/PreviewPanel';
import { LOCAL_PREVIEW_ENABLED } from '../lib/featureFlags';
import { useTemplateStore } from '../store/templateStore';

export type EditorMode = 'template' | 'clip';

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
    clipStudioPreviewOpen?: boolean;
    onClipStudioPreviewClose?: (() => void) | null;
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
    clipStudioPreviewOpen = false,
    onClipStudioPreviewClose = null,
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
            if (mode === 'clip' && e.key === 'Escape' && clipStudioPreviewOpen) {
                onClipStudioPreviewClose?.();
                return;
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
        clipStudioPreviewOpen,
        onClipStudioPreviewClose,
    ]);

    const showInspector = mode !== 'clip' || selectedZoneId !== null;

    return (
        <div className={`app ${mode === 'clip' ? 'app--clip' : ''}`}>
            <div className="app__body">
                {mode !== 'clip' && (
                    <Sidebar
                        onTest={() => setShowPreview(true)}
                        mode={mode}
                        previewEnabled={previewEnabled}
                        sessionUser={sessionUser}
                        onSignOut={onSignOut}
                        renderPreviewRequest={renderPreviewRequest}
                    />
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {mode !== 'clip' && <Toolbar mode={mode} />}
                    {mode === 'clip'
                        ? (
                            <ClipStudioWorkspace
                                renderPreviewRequest={renderPreviewRequest}
                                studioSource={clipStudioSource}
                                saveStatus={clipStudioSaveStatus}
                                saveError={clipStudioSaveError}
                                onDownloadMp4={onClipStudioDownload}
                                exporting={clipStudioExporting}
                                previewOpen={clipStudioPreviewOpen}
                                onPreviewClose={onClipStudioPreviewClose}
                            />
                        )
                        : <CanvasWorkspace />}
                </div>
                {showInspector && <PropertyInspector renderPreviewRequest={renderPreviewRequest} />}
            </div>

            {previewEnabled && showPreview && (
                <PreviewPanel onClose={() => setShowPreview(false)} />
            )}
        </div>
    );
}
