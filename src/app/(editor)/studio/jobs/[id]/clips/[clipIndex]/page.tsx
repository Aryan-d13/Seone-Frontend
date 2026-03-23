'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Eye, LoaderCircle, Download } from 'lucide-react';
import { TemplateBuilderFeature } from '@/features/editor';
import type {
  RenderManifest,
  StudioExportResponse,
  StudioManifestResponse,
  StudioSaveResponse,
} from '@/features/editor/types/manifest';
import { useTemplateStore } from '@/features/editor/store/templateStore';
import { buildStudioManifest } from '@/features/editor/utils/studioManifest';
import { endpoints, getMediaUrl } from '@/lib/config';
import { authFetch } from '@/services/auth';

interface ClipStudioPageProps {
  params: Promise<{
    id: string;
    clipIndex: string;
  }>;
}

const shellStyle: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-primary)',
};

const topbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '0 16px',
  height: '52px',
  borderBottom: '1px solid rgba(72, 72, 71, 0.18)',
  background: 'rgba(10, 10, 10, 0.96)',
  backdropFilter: 'blur(20px)',
};

const titleRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
};

const titleStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--text-primary)',
  fontSize: '16px',
  fontWeight: 800,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.04em',
};

const cardEyebrowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--text-primary)',
  fontSize: '17px',
  fontWeight: 800,
  fontFamily: 'var(--font-display)',
  letterSpacing: '-0.04em',
};

const cardSubtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

const centerStateStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px',
};

const cardStyle: React.CSSProperties = {
  maxWidth: '520px',
  padding: '24px',
  borderRadius: '18px',
  border: '1px solid rgba(72, 72, 71, 0.18)',
  background: 'rgba(19, 19, 19, 0.92)',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontWeight: 700,
  padding: '0 12px',
  height: '32px',
  borderRadius: '999px',
  background: 'rgba(255, 255, 255, 0.03)',
};

const actionsStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const topbarButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: '32px',
  padding: '0 12px',
  borderRadius: '999px',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid transparent',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 700,
};

const topbarButtonActiveStyle: React.CSSProperties = {
  ...topbarButtonStyle,
  background: 'rgba(182, 160, 255, 0.14)',
  border: '1px solid rgba(182, 160, 255, 0.26)',
  color: 'var(--text-primary)',
};

const statusChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '28px',
  padding: '0 10px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700,
};

export default function ClipStudioPage({ params }: ClipStudioPageProps) {
  const { id, clipIndex } = use(params);
  const clipIndexNumber = Number.parseInt(clipIndex, 10);
  const loadFromManifest = useTemplateStore((state) => state.loadFromManifest);
  const template = useTemplateStore((state) => state.template);
  const previewTexts = useTemplateStore((state) => state.previewTexts);
  const activeManifest = useTemplateStore((state) => state.activeManifest);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [studioSource, setStudioSource] = useState<'draft' | 'original'>('original');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const hasLoadedStudioRef = useRef(false);

  const studioManifest = useMemo(
    () =>
      buildStudioManifest({
        template,
        previewTexts,
        activeManifest,
      }),
    [activeManifest, previewTexts, template],
  );

  const studioManifestSignature = useMemo(
    () => (studioManifest ? JSON.stringify(studioManifest) : null),
    [studioManifest],
  );

  useEffect(() => {
    if (!Number.isInteger(clipIndexNumber) || clipIndexNumber < 0) {
      setError(`Invalid clip index: ${clipIndex}`);
      setStatus('error');
      return;
    }

    let cancelled = false;

    async function fetchManifest() {
      setStatus('loading');
      setError(null);
      setSaveError(null);
      setSaveStatus('idle');
      setStudioSource('original');
      setPreviewOpen(false);
      lastSavedSignatureRef.current = null;
      hasLoadedStudioRef.current = false;

      try {
        const response = await authFetch(endpoints.jobs.studio(id, clipIndexNumber));
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail || `Failed to load clip studio (${response.status})`);
        }

        const payload = (await response.json()) as StudioManifestResponse;
        const manifest = payload.manifest as RenderManifest;
        if (!cancelled) {
          loadFromManifest(manifest);
          lastSavedSignatureRef.current = JSON.stringify(manifest);
          hasLoadedStudioRef.current = true;
          setStudioSource(payload.source || 'original');
          setSaveStatus(payload.source === 'draft' ? 'saved' : 'idle');
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load clip studio');
          setStatus('error');
        }
      }
    }

    void fetchManifest();

    return () => {
      cancelled = true;
    };
  }, [clipIndex, clipIndexNumber, id, loadFromManifest]);

  useEffect(() => {
    if (status !== 'ready' || !studioManifest || !studioManifestSignature || !hasLoadedStudioRef.current) {
      return;
    }
    if (studioManifestSignature === lastSavedSignatureRef.current) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSaveStatus('saving');
      setSaveError(null);

      try {
        const response = await authFetch(endpoints.jobs.studio(id, clipIndexNumber), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manifest: studioManifest }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.detail || `Failed to save Studio draft (${response.status})`);
        }

        const payload = (await response.json()) as StudioSaveResponse;
        if (cancelled) return;

        lastSavedSignatureRef.current = studioManifestSignature;
        setStudioSource(payload.source || 'draft');
        setSaveStatus('saved');
      } catch (err) {
        if (cancelled) return;
        setSaveStatus('error');
        setSaveError(err instanceof Error ? err.message : 'Failed to save Studio draft');
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clipIndexNumber, id, status, studioManifest, studioManifestSignature]);

  const handleDownloadMp4 = async () => {
    if (!studioManifest) return;

    setExporting(true);
    setSaveError(null);

    try {
      const response = await authFetch(endpoints.jobs.exportStudio(id, clipIndexNumber), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest: studioManifest }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || `Failed to export clip (${response.status})`);
      }

      const payload = (await response.json()) as StudioExportResponse;
      const downloadUrl = getMediaUrl(payload.url);
      lastSavedSignatureRef.current = studioManifestSignature;
      setStudioSource('draft');
      setSaveStatus('saved');

      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = payload.filename || `${id.slice(0, 8)}_clip_${clipIndexNumber + 1}_studio.mp4`;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to export clip');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={shellStyle}>
      <header style={topbarStyle}>
        <div style={titleRowStyle}>
          <Link href={`/dashboard/jobs/${id}`} style={backLinkStyle}>
            <ArrowLeft size={14} />
            Back
          </Link>
          <div style={titleStyle}>Clip Studio</div>
        </div>

        <div style={actionsStyle}>
          {saveStatus === 'saving' && (
            <div
              style={{
                ...statusChipStyle,
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
              }}
            >
              <LoaderCircle size={13} className="animate-spin" />
              Saving
            </div>
          )}
          {saveStatus === 'error' && (
            <div
              style={{
                ...statusChipStyle,
                background: 'rgba(255, 110, 132, 0.12)',
                color: 'var(--danger)',
              }}
              title={saveError || 'Failed to save Studio draft'}
            >
              <AlertCircle size={13} />
              Save failed
            </div>
          )}
          <button
            type="button"
            style={previewOpen ? topbarButtonActiveStyle : topbarButtonStyle}
            onClick={() => setPreviewOpen((value) => !value)}
          >
            <Eye size={14} />
            Preview
          </button>
          <button
            type="button"
            style={topbarButtonStyle}
            onClick={handleDownloadMp4}
            disabled={!studioManifest || exporting}
          >
            {exporting ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? 'Rendering MP4...' : 'Download MP4'}
          </button>
        </div>
      </header>

      <div style={contentStyle}>
        {status === 'loading' && (
          <div style={centerStateStyle}>
            <div style={cardStyle}>
              <div style={cardEyebrowStyle}>Loading</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Hydrating clip manifest</div>
              <div style={cardSubtitleStyle}>
                Pulling the original render manifest so the editor opens on the actual clip state.
              </div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={centerStateStyle}>
            <div style={cardStyle}>
              <div style={cardEyebrowStyle}>Error</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Editor could not load</div>
              <div style={cardSubtitleStyle}>{error}</div>
            </div>
          </div>
        )}

        {status === 'ready' && (
          <TemplateBuilderFeature
            mode="clip"
            previewEnabled={false}
            renderPreviewRequest={{ jobId: id, clipIndex: clipIndexNumber }}
            clipStudioSource={studioSource}
            clipStudioSaveStatus={saveStatus}
            clipStudioSaveError={saveError}
            onClipStudioDownload={handleDownloadMp4}
            clipStudioExporting={exporting}
            clipStudioPreviewOpen={previewOpen}
            onClipStudioPreviewClose={() => setPreviewOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
