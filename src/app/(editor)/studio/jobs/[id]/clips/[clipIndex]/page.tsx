'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Eye, LoaderCircle, Download } from 'lucide-react';
import { TemplateBuilderFeature } from '@/features/editor';
import {
  listUploadedFontEntries,
  mergeFontEntries,
} from '@/features/editor/lib/fontAssets';
import { getPublicTemplateDocument } from '@/features/editor/lib/firestoreService';
import { collectRuntimeFontIssues } from '@/features/editor/lib/runtimeFontResolver';
import type {
  RenderManifest,
  StudioExportResponse,
  StudioManifestResponse,
  StudioPersistedManifest,
  StudioSaveResponse,
} from '@/features/editor/types/manifest';
import type { TemplateJSON } from '@/features/editor/types/template';
import { useTemplateStore } from '@/features/editor/store/templateStore';
import {
  buildStudioManifest,
  buildStudioManifestFromLoadedManifest,
  stableStudioManifestSignature,
} from '@/features/editor/utils/studioManifest';
import { useFontCatalog } from '@/hooks/useFontCatalog';
import { mergeTemplateForStudioSwitch } from '@/features/editor/utils/templateSwitch';
import { useTemplates } from '@/hooks/useTemplates';
import { endpoints, getMediaUrl } from '@/lib/config';
import { authFetch } from '@/services/auth';
import { buildStudioEditorState } from '@/features/editor/lib/studioState';
import {
  clipDebugLog,
  registerClipDebugSnapshotProvider,
} from '@/features/editor/lib/clipStudioDebug';
import type { StudioRenderBlocker } from '@/features/editor/types/studioUi';

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

const statusRailStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '14px',
  padding: '10px 16px',
  borderBottom: '1px solid rgba(72, 72, 71, 0.18)',
  background: 'rgba(13, 13, 13, 0.92)',
};

const statusRailPrimaryStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 700,
};

const statusRailSecondaryStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '12px',
  lineHeight: 1.45,
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

const templateSelectStyle: React.CSSProperties = {
  height: '32px',
  minWidth: '220px',
  padding: '0 12px',
  borderRadius: '999px',
  border: '1px solid rgba(72, 72, 71, 0.18)',
  background: 'rgba(255, 255, 255, 0.04)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontWeight: 600,
};

const topbarButtonActiveStyle: React.CSSProperties = {
  ...topbarButtonStyle,
  background: 'rgba(182, 160, 255, 0.14)',
  border: '1px solid rgba(182, 160, 255, 0.26)',
  color: 'var(--text-primary)',
};

type ClipStudioSaveReason = 'autosave' | 'preview' | 'export' | 'retry' | 'unknown';

function summarizeTemplateZones(template: TemplateJSON | null | undefined) {
  if (!template) return [];
  return template.zones.map(zone => ({
    id: zone.id,
    type: zone.type,
    z: zone.z,
    bounds: zone.bounds,
  }));
}

function summarizeManifest(manifest: RenderManifest | null | undefined) {
  if (!manifest) return null;
  return {
    templateId: manifest.template_ir.id,
    canvas: manifest.template_ir.canvas,
    zoneCount: manifest.template_ir.zones.length,
    zones: summarizeTemplateZones(manifest.template_ir),
    sourceVideoUrl: manifest.render_payload?.source_video_url || null,
    copyLanguage: manifest.render_payload?.copy_language || null,
    timeWindow: manifest.render_payload?.time_window || null,
    inputKeys: Object.keys(manifest.render_payload?.inputs || {}),
  };
}

function hasResolvedRect(value: unknown): value is { x: number; y: number; w: number; h: number } {
  if (!value || typeof value !== 'object') return false;
  const rect = value as Record<string, unknown>;
  return ['x', 'y', 'w', 'h'].every(
    key => typeof rect[key] === 'number' && Number.isFinite(rect[key] as number)
  );
}

function hasResolvedTextContentBox(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  const textLayout =
    payload.text_layout && typeof payload.text_layout === 'object'
      ? (payload.text_layout as Record<string, unknown>)
      : null;
  const contentBox =
    textLayout?.content_box_px && typeof textLayout.content_box_px === 'object'
      ? (textLayout.content_box_px as Record<string, unknown>)
      : null;
  return Boolean(
    contentBox &&
      ['x', 'y', 'width', 'height'].every(
        key => typeof contentBox[key] === 'number' && Number.isFinite(contentBox[key] as number)
      )
  );
}

function hasUsableResolvedGeometry(manifest: RenderManifest | null | undefined): boolean {
  if (!manifest?.resolved_zones?.length) return false;
  const resolvedById = new Map(manifest.resolved_zones.map(zone => [zone.id, zone]));

  return manifest.template_ir.zones.every(zone => {
    if (!['text', 'image', 'video'].includes(zone.type)) {
      return true;
    }

    const resolvedZone = resolvedById.get(zone.id);
    if (!resolvedZone || !hasResolvedRect(resolvedZone.rect)) {
      return false;
    }

    if (zone.type === 'text') {
      return hasResolvedTextContentBox(resolvedZone.resolved);
    }

    return true;
  });
}

export default function ClipStudioPage({ params }: ClipStudioPageProps) {
  const { id, clipIndex } = use(params);
  const clipIndexNumber = Number.parseInt(clipIndex, 10);
  const applyStudioResolvedManifest = useTemplateStore(
    state => state.applyStudioResolvedManifest
  );
  const loadFromManifest = useTemplateStore(state => state.loadFromManifest);
  const setTemplate = useTemplateStore(state => state.setTemplate);
  const template = useTemplateStore(state => state.template);
  const previewTexts = useTemplateStore(state => state.previewTexts);
  const activeManifest = useTemplateStore(state => state.activeManifest);
  const draftGeometryZoneIds = useTemplateStore(state => state.draftGeometryZoneIds);
  const fontAnalysis = useTemplateStore(state => state.fontAnalysis);
  const reRenderState = useTemplateStore(state => state.reRenderState);
  const assetPreviewError = useTemplateStore(state => state.assetPreviewError);
  const setReRenderLoading = useTemplateStore(state => state.setReRenderLoading);
  const setReRenderResult = useTemplateStore(state => state.setReRenderResult);
  const { fonts: builtinFonts, isLoading: fontsLoading } = useFontCatalog();
  const { templates, isLoading: templatesLoading } = useTemplates();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [studioSource, setStudioSource] = useState<'draft' | 'original'>('original');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [savedDraftSignature, setSavedDraftSignature] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<'properties' | 'preview'>('properties');
  const [switchingTemplate, setSwitchingTemplate] = useState(false);
  const [layoutRebuiltOnLoad, setLayoutRebuiltOnLoad] = useState(false);
  const [lastSaveLayoutRebuilt, setLastSaveLayoutRebuilt] = useState(false);
  const [fontNormalizationMessage, setFontNormalizationMessage] = useState<string | null>(null);
  const hasLoadedStudioRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const savingSignatureRef = useRef<string | null>(null);
  const currentStudioManifestSignatureRef = useRef<string | null>(null);
  const currentCompatibilityKey =
    template.compatibility_key || activeManifest?.template_ir?.compatibility_key || null;
  const compatibleTemplates = useMemo(() => {
    if (!currentCompatibilityKey) return [];
    return templates.filter(entry => entry.compatibility_key === currentCompatibilityKey);
  }, [currentCompatibilityKey, templates]);

  const studioManifest = useMemo(
    () =>
      buildStudioManifest({
        template,
        previewTexts,
        activeManifest,
        draftGeometryZoneIds,
      }),
    [activeManifest, draftGeometryZoneIds, previewTexts, template]
  );
  const availableFonts = useMemo(
    () =>
      mergeFontEntries(
        builtinFonts,
        listUploadedFontEntries(template.assets || {}, fontAnalysis)
      ),
    [builtinFonts, fontAnalysis, template.assets]
  );
  const fontIssues = useMemo(
    () =>
      fontsLoading
        ? []
        : collectRuntimeFontIssues({
            template,
            previewTexts,
            copyLanguage: activeManifest?.render_payload?.copy_language,
            fonts: availableFonts,
          }),
    [
      activeManifest?.render_payload?.copy_language,
      availableFonts,
      fontsLoading,
      previewTexts,
      template,
    ]
  );
  const studioManifestSignature = useMemo(
    () => (studioManifest ? stableStudioManifestSignature(studioManifest) : null),
    [studioManifest]
  );
  const resolvedManifestSignature = useMemo(
    () =>
      activeManifest
        ? stableStudioManifestSignature(buildStudioManifestFromLoadedManifest(activeManifest))
        : null,
    [activeManifest]
  );
  const fontBlockers = useMemo<StudioRenderBlocker[]>(
    () =>
      fontIssues.map(issue => ({
        code:
          issue.issue === 'missing_family'
            ? 'font_missing'
            : issue.issue === 'analysis_pending'
              ? 'font_checking'
              : issue.issue === 'analysis_failed'
                ? 'font_check_failed'
                : 'font_script_unsupported',
        message: issue.message,
        zoneId: issue.zoneId,
        contentRef: issue.contentRef,
      })),
    [fontIssues]
  );
  const hasExactResolvedGeometry = useMemo(
    () => hasUsableResolvedGeometry(activeManifest),
    [activeManifest]
  );
  const layoutAuthority = useMemo<'exact' | 'stale_exact' | 'unavailable'>(() => {
    if (!hasExactResolvedGeometry) return 'unavailable';
    if (!studioManifestSignature || !resolvedManifestSignature) return 'unavailable';
    return resolvedManifestSignature === studioManifestSignature ? 'exact' : 'stale_exact';
  }, [hasExactResolvedGeometry, resolvedManifestSignature, studioManifestSignature]);
  const layoutAuthorityReason = useMemo(() => {
    if (!hasExactResolvedGeometry) {
      return 'Exact layout is unavailable. Studio is waiting for resolver-generated geometry before preview or export can continue.';
    }
    if (
      studioManifestSignature &&
      resolvedManifestSignature &&
      studioManifestSignature !== resolvedManifestSignature
    ) {
      if (saveStatus === 'saving') {
        return 'Saving the latest draft. Preview and export stay blocked until the save response returns exact geometry.';
      }
      if (saveStatus === 'error') {
        return 'The latest save failed. Studio is showing the last exact layout until save succeeds.';
      }
      return 'Studio is showing the last exact layout. Save must complete before preview or export can continue.';
    }
    return null;
  }, [
    hasExactResolvedGeometry,
    resolvedManifestSignature,
    saveStatus,
    studioManifestSignature,
  ]);
  const editorState = useMemo(
    () =>
      buildStudioEditorState({
        currentDraftSignature: studioManifestSignature,
        savedDraftSignature,
        previewSignature: reRenderState.signature,
        layoutAuthority,
        layoutAuthorityReason,
        saveStatus,
        saveError,
        previewLoading: reRenderState.loading,
        previewError: reRenderState.error,
        previewUrl: reRenderState.resultUrl,
        blockers: fontBlockers,
        fontNormalizationMessage,
        assetPreviewError,
      }),
    [
      assetPreviewError,
      fontBlockers,
      fontNormalizationMessage,
      layoutAuthority,
      layoutAuthorityReason,
      reRenderState.error,
      reRenderState.loading,
      reRenderState.resultUrl,
      reRenderState.signature,
      saveError,
      saveStatus,
      savedDraftSignature,
      studioManifestSignature,
    ]
  );
  useEffect(() => {
    currentStudioManifestSignatureRef.current = studioManifestSignature;
  }, [studioManifestSignature]);
  const debugSnapshot = useMemo(
    () => ({
      jobId: id,
      clipIndex: clipIndexNumber,
      route:
        typeof window === 'undefined'
          ? `/studio/jobs/${id}/clips/${clipIndexNumber}`
          : `${window.location.pathname}${window.location.search}`,
      status,
      studioSource,
      saveStatus,
      saveError,
      exporting,
      switchingTemplate,
      railTab,
      studioManifestSignature,
      resolvedManifestSignature,
      savedDraftSignature,
      layoutAuthority,
      layoutAuthorityReason,
      layoutRebuiltOnLoad,
      lastSaveLayoutRebuilt,
      fontNormalizationMessage,
      previewUrl: reRenderState.resultUrl,
      previewError: reRenderState.error,
      previewSignature: reRenderState.signature,
      editorState,
      blockers: editorState.blockers,
      template: {
        id: template.id,
        canvas: template.canvas,
        zoneCount: template.zones.length,
        zones: summarizeTemplateZones(template),
      },
      activeManifest: summarizeManifest(activeManifest),
      fontIssues: fontIssues.map(issue => ({
        zoneId: issue.zoneId,
        contentRef: issue.contentRef,
        issue: issue.issue,
        family: issue.family,
        message: issue.message,
      })),
      assetPreviewError,
    }),
    [
      activeManifest,
      assetPreviewError,
      clipIndexNumber,
      editorState,
      exporting,
      fontIssues,
      fontNormalizationMessage,
      id,
      railTab,
      layoutAuthority,
      layoutAuthorityReason,
      layoutRebuiltOnLoad,
      lastSaveLayoutRebuilt,
      reRenderState.error,
      reRenderState.resultUrl,
      reRenderState.signature,
      resolvedManifestSignature,
      saveError,
      saveStatus,
      savedDraftSignature,
      status,
      studioManifestSignature,
      studioSource,
      switchingTemplate,
      template,
    ]
  );

  useEffect(() => {
    return registerClipDebugSnapshotProvider('page', () => debugSnapshot);
  }, [debugSnapshot]);

  useEffect(() => {
    clipDebugLog('page:mount', {
      jobId: id,
      clipIndex: clipIndexNumber,
    });

    return () => {
      clipDebugLog('page:unmount', {
        jobId: id,
        clipIndex: clipIndexNumber,
      });
    };
  }, [clipIndexNumber, id]);

  const lastPageStateSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const nextSignature = JSON.stringify({
      status,
      studioSource,
      saveStatus,
      saveError,
      exporting,
      railTab,
      studioManifestSignature,
      resolvedManifestSignature,
      savedDraftSignature,
      layoutAuthority: editorState.layoutAuthority,
      layoutAuthorityReason: editorState.layoutAuthorityReason,
      fontNormalizationMessage: editorState.fontNormalizationMessage,
      draftState: editorState.draftState,
      previewState: editorState.previewState,
      renderValidity: editorState.renderValidity,
      blockerCount: editorState.blockers.length,
      blockers: editorState.blockers,
    });

    if (lastPageStateSignatureRef.current === nextSignature) {
      return;
    }

    lastPageStateSignatureRef.current = nextSignature;
    clipDebugLog('page:state', {
      status,
      studioSource,
      saveStatus,
      saveError,
      exporting,
      railTab,
      studioManifestSignature,
      resolvedManifestSignature,
      savedDraftSignature,
      layoutAuthority: editorState.layoutAuthority,
      layoutAuthorityReason: editorState.layoutAuthorityReason,
      fontNormalizationMessage: editorState.fontNormalizationMessage,
      draftState: editorState.draftState,
      previewState: editorState.previewState,
      renderValidity: editorState.renderValidity,
      blockers: editorState.blockers,
    });
  }, [
    editorState.blockers,
    editorState.draftState,
    editorState.fontNormalizationMessage,
    editorState.previewState,
    editorState.renderValidity,
    exporting,
    railTab,
    resolvedManifestSignature,
    saveError,
    saveStatus,
    savedDraftSignature,
    status,
    studioManifestSignature,
    studioSource,
  ]);

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
      setSavedDraftSignature(null);
      setLayoutRebuiltOnLoad(false);
      setLastSaveLayoutRebuilt(false);
      setFontNormalizationMessage(null);
      setRailTab('properties');
      hasLoadedStudioRef.current = false;
      setReRenderResult(null, null, null);

      clipDebugLog('manifest:fetch:start', {
        jobId: id,
        clipIndex: clipIndexNumber,
        endpoint: endpoints.jobs.studio(id, clipIndexNumber),
      });

      try {
        const response = await authFetch(endpoints.jobs.studio(id, clipIndexNumber));
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.detail || `Failed to load clip studio (${response.status})`
          );
        }

        const payload = (await response.json()) as StudioManifestResponse;
        const manifest = payload.manifest as RenderManifest;
        clipDebugLog('manifest:fetch:success', {
          jobId: id,
          clipIndex: clipIndexNumber,
          source: payload.source || 'original',
          layoutRebuilt: payload.layout_rebuilt || false,
          manifest: summarizeManifest(manifest),
        });
        if (!cancelled) {
          loadFromManifest(manifest);
          setSavedDraftSignature(
            stableStudioManifestSignature(buildStudioManifestFromLoadedManifest(manifest))
          );
          setLayoutRebuiltOnLoad(Boolean(payload.layout_rebuilt));
          setFontNormalizationMessage(payload.font_normalization_message || null);
          hasLoadedStudioRef.current = true;
          setStudioSource(payload.source || 'original');
          setSaveStatus(payload.source === 'draft' ? 'saved' : 'idle');
          setStatus('ready');
        }
      } catch (err) {
        clipDebugLog('manifest:fetch:error', {
          jobId: id,
          clipIndex: clipIndexNumber,
          error: err instanceof Error ? err.message : 'Failed to load clip studio',
        });
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
  }, [clipIndex, clipIndexNumber, id, loadFromManifest, setReRenderResult]);



  const persistStudioDraft = useCallback(

    async (
      manifest: StudioPersistedManifest | null,
      signature: string | null,
      reason: ClipStudioSaveReason = 'unknown'
    ): Promise<StudioPersistedManifest> => {
      if (!manifest || !signature) {
        clipDebugLog('save:rejected', {
          reason,
          manifestReady: Boolean(manifest),
          signatureReady: Boolean(signature),
        });
        throw new Error('Studio draft is not ready to save');
      }
      if (signature === savedDraftSignature) {
        clipDebugLog('save:skip-clean', {
          reason,
          signature,
        });
        return manifest;
      }
      if (
        savePromiseRef.current &&
        savingSignatureRef.current &&
        savingSignatureRef.current === signature
      ) {
        clipDebugLog('save:join-inflight', {
          reason,
          signature,
        });
        await savePromiseRef.current;
        return manifest;
      }

      const saveTask = (async () => {
        setSaveStatus('saving');
        setSaveError(null);
        clipDebugLog('save:start', {
          reason,
          signature,
          endpoint: endpoints.jobs.studio(id, clipIndexNumber),
        });

        const response = await authFetch(endpoints.jobs.studio(id, clipIndexNumber), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manifest }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.detail || `Failed to save Studio draft (${response.status})`
          );
        }

        const payload = (await response.json()) as StudioSaveResponse;
        const resolvedManifest = payload.manifest as RenderManifest | undefined;
        const returnedSignature = resolvedManifest
          ? stableStudioManifestSignature(buildStudioManifestFromLoadedManifest(resolvedManifest))
          : signature;
        setSavedDraftSignature(returnedSignature);
        setStudioSource(payload.source || 'draft');
        setSaveStatus('saved');
        setLastSaveLayoutRebuilt(Boolean(payload.layout_rebuilt));
        setFontNormalizationMessage(payload.font_normalization_message || null);
        if (resolvedManifest && currentStudioManifestSignatureRef.current === signature) {
          applyStudioResolvedManifest(resolvedManifest, {
            clearDraftGeometry: true,
          });
        }
        clipDebugLog('save:success', {
          reason,
          signature,
          returnedSignature,
          source: payload.source || 'draft',
          updatedAt: payload.updated_at || null,
          layoutRebuilt: payload.layout_rebuilt || false,
          manifest: summarizeManifest(resolvedManifest),
        });
      })();

      savePromiseRef.current = saveTask;
      savingSignatureRef.current = signature;

      try {
        await saveTask;
        return manifest;
      } catch (error) {
        setSaveStatus('error');
        setSaveError(error instanceof Error ? error.message : 'Failed to save Studio draft');
        clipDebugLog('save:error', {
          reason,
          signature,
          error: error instanceof Error ? error.message : 'Failed to save Studio draft',
        });
        throw error;
      } finally {
        if (savePromiseRef.current === saveTask) {
          savePromiseRef.current = null;
          savingSignatureRef.current = null;
        }
      }
    },
    [applyStudioResolvedManifest, clipIndexNumber, id, savedDraftSignature]
  );

  useEffect(() => {
    if (
      status !== 'ready' ||
      !studioManifest ||
      !studioManifestSignature ||
      !hasLoadedStudioRef.current ||
      saveStatus === 'error' ||
      studioManifestSignature === savedDraftSignature
    ) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      clipDebugLog('autosave:scheduled', {
        signature: studioManifestSignature,
        delayMs: 800,
      });
      void persistStudioDraft(studioManifest, studioManifestSignature, 'autosave').catch(() => {
        if (cancelled) return;
      });
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      clipDebugLog('autosave:cancelled', {
        signature: studioManifestSignature,
      });
    };
  }, [
    persistStudioDraft,
    savedDraftSignature,
    saveStatus,
    status,
    studioManifest,
    studioManifestSignature,
  ]);

  const handleGeneratePreview = useCallback(async () => {
    setRailTab('preview');
    if (!studioManifest || !studioManifestSignature) return;
    if (editorState.renderValidity === 'BLOCKED') return;

    try {
      clipDebugLog('preview:start', {
        signature: studioManifestSignature,
        jobId: id,
        clipIndex: clipIndexNumber,
      });
      const manifest = await persistStudioDraft(
        studioManifest,
        studioManifestSignature,
        'preview'
      );
      setReRenderLoading(true);

      const res = await authFetch(endpoints.jobs.preview, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: id,
          clip_index: clipIndexNumber,
          manifest,
        }),
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

      setReRenderResult(normalizedUrl, null, studioManifestSignature);
      clipDebugLog('preview:success', {
        signature: studioManifestSignature,
        url: normalizedUrl,
      });
    } catch (error) {
      clipDebugLog('preview:error', {
        signature: studioManifestSignature,
        error: error instanceof Error ? error.message : 'Preview generation failed',
      });
      setReRenderResult(
        null,
        error instanceof Error ? error.message : 'Preview generation failed',
        studioManifestSignature
      );
    }
  }, [
    clipIndexNumber,
    editorState.renderValidity,
    id,
    persistStudioDraft,
    setReRenderLoading,
    setReRenderResult,
    studioManifest,
    studioManifestSignature,
  ]);

  const handleDownloadMp4 = useCallback(async () => {
    if (!studioManifest || !studioManifestSignature) return;
    if (editorState.renderValidity === 'BLOCKED') return;

    setExporting(true);
    setSaveError(null);

    try {
      clipDebugLog('export:start', {
        signature: studioManifestSignature,
        jobId: id,
        clipIndex: clipIndexNumber,
      });
      const manifest = await persistStudioDraft(
        studioManifest,
        studioManifestSignature,
        'export'
      );
      const response = await authFetch(endpoints.jobs.exportStudio(id, clipIndexNumber), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || `Failed to export clip (${response.status})`);
      }

      const payload = (await response.json()) as StudioExportResponse;
      const downloadUrl = getMediaUrl(payload.url);
      setSavedDraftSignature(studioManifestSignature);
      setStudioSource('draft');
      setSaveStatus('saved');

      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download =
        payload.filename || `${id.slice(0, 8)}_clip_${clipIndexNumber + 1}_studio.mp4`;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      clipDebugLog('export:success', {
        signature: studioManifestSignature,
        url: downloadUrl,
        filename: payload.filename,
      });
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to export clip');
      clipDebugLog('export:error', {
        signature: studioManifestSignature,
        error: err instanceof Error ? err.message : 'Failed to export clip',
      });
    } finally {
      setExporting(false);
    }
  }, [
    clipIndexNumber,
    editorState.renderValidity,
    id,
    persistStudioDraft,
    studioManifest,
    studioManifestSignature,
  ]);

  const handleTemplateSwitch = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextTemplateRef = event.target.value;
    if (!nextTemplateRef || nextTemplateRef === template.id) return;

    setSwitchingTemplate(true);
    setSaveError(null);

    try {
      const nextTemplate = await getPublicTemplateDocument(nextTemplateRef);
      if (!nextTemplate) {
        throw new Error('Template not found');
      }
      const mergedTemplate = mergeTemplateForStudioSwitch(
        template as TemplateJSON,
        nextTemplate as TemplateJSON
      );
      setTemplate(mergedTemplate);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to switch template');
    } finally {
      setSwitchingTemplate(false);
    }
  };

  const statusPrimary =
    editorState.draftState === 'SAVE_FAILED'
      ? 'Save failed'
      : editorState.layoutAuthority === 'unavailable'
        ? 'Exact layout unavailable'
        : editorState.draftState === 'SAVING' && editorState.layoutAuthority === 'stale_exact'
          ? 'Saving exact layout…'
          : editorState.renderValidity === 'BLOCKED'
            ? 'Preview and export are blocked'
            : editorState.draftState === 'SAVING'
              ? 'Saving changes…'
              : editorState.draftState === 'DIRTY'
                ? 'Unsaved changes'
                : 'All changes saved';
  const statusSecondary =
    editorState.blockers[0]?.message ||
    editorState.fontNormalizationMessage ||
    (editorState.previewState === 'FRESH'
      ? 'Render preview is generated from the current draft.'
      : editorState.previewState === 'STALE'
        ? 'Render preview is outdated and must be generated again.'
        : editorState.previewState === 'GENERATING'
          ? 'Generating render preview from the latest saved draft.'
          : editorState.previewState === 'FAILED'
            ? reRenderState.error || 'Render preview failed.'
            : 'Render preview has not been generated yet.');

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
          {compatibleTemplates.length > 1 && (
            <select
              style={templateSelectStyle}
              value={template.id}
              onChange={handleTemplateSwitch}
              disabled={switchingTemplate || templatesLoading}
            >
              <option value={template.id}>
                {switchingTemplate ? 'Switching template…' : `Template: ${template.id}`}
              </option>
              {compatibleTemplates
                .filter(entry => entry.template_ref !== template.id)
                .map(entry => (
                  <option key={entry.template_ref} value={entry.template_ref}>
                    {entry.name}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            style={railTab === 'preview' ? topbarButtonActiveStyle : topbarButtonStyle}
            onClick={() => setRailTab('preview')}
          >
            <Eye size={14} />
            Open Render Preview
          </button>
          <button
            type="button"
            style={topbarButtonStyle}
            onClick={handleDownloadMp4}
            disabled={
              !studioManifest ||
              exporting ||
              editorState.renderValidity === 'BLOCKED' ||
              editorState.draftState === 'SAVE_FAILED'
            }
          >
            {exporting ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {exporting ? 'Exporting MP4…' : 'Export MP4'}
          </button>
        </div>
      </header>

      <div style={statusRailStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={statusRailPrimaryStyle}>{statusPrimary}</div>
          <div style={statusRailSecondaryStyle}>{statusSecondary}</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
          {editorState.draftState === 'SAVE_FAILED' && studioManifest && studioManifestSignature && (
            <button
              type="button"
              style={topbarButtonActiveStyle}
              onClick={() => {
                void persistStudioDraft(
                  studioManifest,
                  studioManifestSignature,
                  'retry'
                ).catch(
                  () => undefined
                );
              }}
            >
              Retry save
            </button>
          )}
          {editorState.blockers.length > 0 && (
            <button
              type="button"
              style={topbarButtonActiveStyle}
              onClick={() => setRailTab('properties')}
            >
              <AlertCircle size={14} />
              {editorState.blockers.length} blocker
              {editorState.blockers.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      <div style={contentStyle}>
        {status === 'loading' && (
          <div style={centerStateStyle}>
            <div style={cardStyle}>
              <div style={cardEyebrowStyle}>Loading</div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                Hydrating clip manifest
              </div>
              <div style={cardSubtitleStyle}>
                Pulling the original render manifest so the editor opens on the actual
                clip state.
              </div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={centerStateStyle}>
            <div style={cardStyle}>
              <div style={cardEyebrowStyle}>Error</div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                Editor could not load
              </div>
              <div style={cardSubtitleStyle}>{error}</div>
            </div>
          </div>
        )}

        {status === 'ready' && (
          <TemplateBuilderFeature
            mode="clip"
            previewEnabled={false}
            renderPreviewRequest={{ jobId: id, clipIndex: clipIndexNumber }}
            clipStudioRailTab={railTab}
            onClipStudioRailTabChange={setRailTab}
            clipStudioEditorState={editorState}
            clipStudioLayoutAuthority={layoutAuthority}
            clipStudioLayoutAuthorityReason={layoutAuthorityReason}
            onClipStudioGeneratePreview={handleGeneratePreview}
          />
        )}
      </div>
    </div>
  );
}
