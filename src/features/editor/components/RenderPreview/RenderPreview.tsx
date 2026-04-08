/**
 * RenderPreview — Side panel showing re-rendered video output.
 *
 * Displays the video result after a re-render, with loading state
 * and error handling. Hidden when no render has been triggered.
 */

import { RefreshCw, X, AlertCircle, Play } from 'lucide-react';
import { authFetch } from '@/services/auth';
import { endpoints, getMediaUrl } from '@/lib/config';
import { useTemplateStore } from '../../store/templateStore';
import { buildStudioManifest } from '../../utils/studioManifest';
import type { StudioEditorState } from '../../types/studioUi';
import './RenderPreview.css';

export interface RenderPreviewRequest {
  jobId: string;
  clipIndex: number;
}

interface RenderPreviewProps {
  renderRequest?: RenderPreviewRequest | null;
  fontIssue?: string | null;
  editorState?: StudioEditorState | null;
  onGeneratePreview?: (() => Promise<void> | void) | null;
}

export default function RenderPreview({
  renderRequest = null,
  fontIssue = null,
  editorState = null,
  onGeneratePreview = null,
}: RenderPreviewProps) {
  const {
    template,
    previewTexts,
    activeManifest,
    draftGeometryZoneIds,
    reRenderState,
    setReRenderLoading,
    setReRenderResult,
  } = useTemplateStore();

  const handleReRender = async () => {
    if (onGeneratePreview) {
      await onGeneratePreview();
      return;
    }
    if (!activeManifest || !renderRequest || fontIssue) return;

    setReRenderLoading(true);

    try {
      const modifiedManifest = buildStudioManifest({
        template,
        previewTexts,
        activeManifest,
        draftGeometryZoneIds,
      });
      if (!modifiedManifest) {
        throw new Error('Studio manifest is not ready for preview');
      }

      const payload = {
        job_id: renderRequest.jobId,
        clip_index: renderRequest.clipIndex,
        manifest: modifiedManifest,
      };

      const res = await authFetch(endpoints.jobs.preview, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}`);
      }

      const result = await res.json();
      const normalizedUrl =
        typeof result?.url === 'string' && result.url.trim()
          ? getMediaUrl(result.url)
          : '';

      if (!normalizedUrl) {
        throw new Error('Preview render returned no playable URL');
      }

      setReRenderResult(normalizedUrl);
    } catch (e) {
      setReRenderResult(null, e instanceof Error ? e.message : 'Re-render failed');
    }
  };

  const handleDismiss = () => {
    setReRenderResult(null);
  };

  const handleVideoLoadError = () => {
    const failedUrl = reRenderState.resultUrl || 'unknown preview URL';
    setReRenderResult(
      reRenderState.resultUrl,
      `Preview video failed to load: ${failedUrl}`
    );
  };

  // Don't render anything if there's no active manifest
  if (!activeManifest || !renderRequest) return null;

  const blockingMessage = editorState?.blockers[0]?.message || fontIssue || null;
  const previewStateLabel =
    editorState?.previewState === 'FRESH'
      ? 'Generated from current draft'
      : editorState?.previewState === 'STALE'
        ? 'Preview is outdated'
        : editorState?.previewState === 'GENERATING'
          ? 'Generating preview'
          : editorState?.previewState === 'FAILED'
            ? 'Preview failed'
            : 'Preview not generated yet';
  const generateDisabled =
    reRenderState.loading ||
    Boolean(blockingMessage) ||
    editorState?.renderValidity === 'BLOCKED';

  return (
    <div className="render-preview">
      <div className="render-preview__header">
        <span className="render-preview__title">
          <Play size={12} />
          Render Preview
        </span>
        {reRenderState.resultUrl && (
          <button
            className="render-preview__dismiss"
            onClick={handleDismiss}
            type="button"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="render-preview__status" data-testid="render-preview-status">
        {previewStateLabel}
      </div>

      <button
        className="render-preview__render-btn"
        onClick={handleReRender}
        disabled={generateDisabled}
        type="button"
      >
        <RefreshCw
          size={14}
          className={reRenderState.loading ? 'render-preview__spin' : ''}
        />
        {reRenderState.loading ? 'Generating Preview…' : 'Generate Preview'}
      </button>

      {blockingMessage && (
        <div className="render-preview__error" data-testid="render-preview-font-issue">
          <AlertCircle size={13} />
          <span>{blockingMessage}</span>
        </div>
      )}

      {reRenderState.resultUrl && (
        <div className="render-preview__video-wrap">
          <video
            data-testid="render-preview-video"
            className="render-preview__video"
            src={reRenderState.resultUrl}
            controls
            autoPlay
            loop
            onError={handleVideoLoadError}
          />
        </div>
      )}

      {reRenderState.error && (
        <div className="render-preview__error" data-testid="render-preview-error">
          <AlertCircle size={13} />
          <span>{reRenderState.error}</span>
        </div>
      )}
    </div>
  );
}
