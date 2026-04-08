export type DraftState = 'CLEAN' | 'DIRTY' | 'SAVING' | 'SAVE_FAILED';

export type PreviewState = 'NOT_GENERATED' | 'GENERATING' | 'FRESH' | 'STALE' | 'FAILED';

export type RenderValidityState = 'VALID' | 'BLOCKED';
export type LayoutAuthority = 'exact' | 'stale_exact' | 'unavailable';

export type FontState =
  | 'SELECTED_VALID'
  | 'SELECTED_INVALID'
  | 'MISSING'
  | 'FALLBACK_DIAGNOSTIC'
  | 'CHECKING';

export interface StudioFontDescriptor {
  family: string;
  weight: number;
  source: 'builtin' | 'uploaded' | 'fallback' | 'unknown';
}

export interface StudioRenderBlocker {
  code:
    | 'font_missing'
    | 'font_script_unsupported'
    | 'font_checking'
    | 'font_check_failed'
    | 'asset_preview_error'
    | 'save_failed'
    | 'layout_stale'
    | 'layout_unavailable';
  message: string;
  zoneId?: string | null;
  contentRef?: string | null;
}

export interface StudioFontViewModel {
  selectedFont: StudioFontDescriptor;
  effectiveFont: StudioFontDescriptor;
  fontState: FontState;
  compatibilityStatus: string;
  blockingReason: string | null;
}

export interface StudioEditorState {
  draftState: DraftState;
  previewState: PreviewState;
  renderValidity: RenderValidityState;
  layoutAuthority: LayoutAuthority;
  layoutAuthorityReason: string | null;
  fontNormalizationMessage: string | null;
  currentDraftSignature: string | null;
  savedDraftSignature: string | null;
  previewSignature: string | null;
  blockers: StudioRenderBlocker[];
}
