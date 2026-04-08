import type {
  DraftState,
  LayoutAuthority,
  PreviewState,
  StudioEditorState,
  StudioRenderBlocker,
} from '../types/studioUi';

interface BuildStudioEditorStateArgs {
  currentDraftSignature: string | null;
  savedDraftSignature: string | null;
  previewSignature: string | null;
  layoutAuthority?: LayoutAuthority;
  layoutAuthorityReason?: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string | null;
  previewLoading?: boolean;
  previewError?: string | null;
  previewUrl?: string | null;
  blockers?: StudioRenderBlocker[];
  fontNormalizationMessage?: string | null;
  assetPreviewError?: string | null;
}

export function deriveDraftState({
  currentDraftSignature,
  savedDraftSignature,
  saveStatus,
}: {
  currentDraftSignature: string | null;
  savedDraftSignature: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}): DraftState {
  if (saveStatus === 'saving') return 'SAVING';
  if (saveStatus === 'error') return 'SAVE_FAILED';
  if (!currentDraftSignature || currentDraftSignature === savedDraftSignature) {
    return 'CLEAN';
  }
  return 'DIRTY';
}

export function derivePreviewState({
  currentDraftSignature,
  previewSignature,
  previewLoading = false,
  previewError = null,
  previewUrl = null,
}: {
  currentDraftSignature: string | null;
  previewSignature: string | null;
  previewLoading?: boolean;
  previewError?: string | null;
  previewUrl?: string | null;
}): PreviewState {
  if (previewLoading) return 'GENERATING';
  if (previewError) return 'FAILED';
  if (!previewUrl || !previewSignature) return 'NOT_GENERATED';
  if (currentDraftSignature && previewSignature !== currentDraftSignature) return 'STALE';
  return 'FRESH';
}

export function buildStudioEditorState({
  currentDraftSignature,
  savedDraftSignature,
  previewSignature,
  layoutAuthority = 'exact',
  layoutAuthorityReason = null,
  saveStatus,
  saveError = null,
  previewLoading = false,
  previewError = null,
  previewUrl = null,
  blockers = [],
  fontNormalizationMessage = null,
  assetPreviewError = null,
}: BuildStudioEditorStateArgs): StudioEditorState {
  const derivedBlockers: StudioRenderBlocker[] = [];

  if (saveStatus === 'error' && saveError) {
    derivedBlockers.push({
      code: 'save_failed',
      message: `${saveError} Save must succeed before preview or export can continue.`,
    });
  }

  derivedBlockers.push(...blockers);

  if (assetPreviewError) {
    derivedBlockers.push({
      code: 'asset_preview_error',
      message: `${assetPreviewError} Preview and export are blocked until the asset loads correctly.`,
    });
  }

  if (layoutAuthority === 'stale_exact') {
    derivedBlockers.push({
      code: 'layout_stale',
      message:
        layoutAuthorityReason ||
        'Studio is showing the last exact layout. Save must complete before preview or export can continue.',
    });
  }

  if (layoutAuthority === 'unavailable') {
    derivedBlockers.push({
      code: 'layout_unavailable',
      message:
        layoutAuthorityReason ||
        'Exact layout is unavailable. Save must complete before preview or export can continue.',
    });
  }

  return {
    draftState: deriveDraftState({
      currentDraftSignature,
      savedDraftSignature,
      saveStatus,
    }),
    previewState: derivePreviewState({
      currentDraftSignature,
      previewSignature,
      previewLoading,
      previewError,
      previewUrl,
    }),
    renderValidity: derivedBlockers.length > 0 ? 'BLOCKED' : 'VALID',
    layoutAuthority,
    layoutAuthorityReason,
    fontNormalizationMessage,
    currentDraftSignature,
    savedDraftSignature,
    previewSignature,
    blockers: derivedBlockers,
  };
}
