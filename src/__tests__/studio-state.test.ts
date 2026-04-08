import { buildStudioEditorState } from '@/features/editor/lib/studioState';

describe('studioState', () => {
  it('marks the draft dirty and preview stale when signatures diverge', () => {
    const state = buildStudioEditorState({
      currentDraftSignature: 'draft-v2',
      savedDraftSignature: 'draft-v1',
      previewSignature: 'draft-v1',
      saveStatus: 'idle',
      previewUrl: 'https://example.com/preview.mp4',
      blockers: [],
    });

    expect(state.draftState).toBe('DIRTY');
    expect(state.previewState).toBe('STALE');
    expect(state.renderValidity).toBe('VALID');
  });

  it('promotes save failures ahead of other blockers', () => {
    const state = buildStudioEditorState({
      currentDraftSignature: 'draft-v2',
      savedDraftSignature: 'draft-v1',
      previewSignature: null,
      saveStatus: 'error',
      saveError: 'Network timeout',
      blockers: [
        {
          code: 'font_script_unsupported',
          message: 'Selected font cannot render Hindi text.',
          zoneId: 'title_band',
          contentRef: 'pov_text',
        },
      ],
    });

    expect(state.draftState).toBe('SAVE_FAILED');
    expect(state.previewState).toBe('NOT_GENERATED');
    expect(state.renderValidity).toBe('BLOCKED');
    expect(state.blockers).toHaveLength(2);
    expect(state.blockers[0]).toEqual({
      code: 'save_failed',
      message: 'Network timeout Save must succeed before preview or export can continue.',
    });
  });

  it('uses a stale_exact layout blocker without hiding an exact canvas', () => {
    const state = buildStudioEditorState({
      currentDraftSignature: 'draft-v2',
      savedDraftSignature: 'draft-v1',
      previewSignature: null,
      saveStatus: 'saving',
      layoutAuthority: 'stale_exact',
      layoutAuthorityReason:
        'Saving the latest draft. Preview and export stay blocked until the save response returns exact geometry.',
      blockers: [],
      fontNormalizationMessage: 'Adjusted font to NotoSans for English compatibility.',
    });

    expect(state.layoutAuthority).toBe('stale_exact');
    expect(state.fontNormalizationMessage).toBe(
      'Adjusted font to NotoSans for English compatibility.'
    );
    expect(state.renderValidity).toBe('BLOCKED');
    expect(state.blockers).toEqual([
      {
        code: 'layout_stale',
        message:
          'Saving the latest draft. Preview and export stay blocked until the save response returns exact geometry.',
      },
    ]);
  });

  it('blocks preview and export when exact layout is unavailable', () => {
    const state = buildStudioEditorState({
      currentDraftSignature: 'draft-v2',
      savedDraftSignature: 'draft-v1',
      previewSignature: null,
      saveStatus: 'saving',
      layoutAuthority: 'unavailable',
      layoutAuthorityReason:
        'Exact layout is unavailable. Studio is waiting for resolver-generated geometry before preview or export can continue.',
      blockers: [],
    });

    expect(state.layoutAuthority).toBe('unavailable');
    expect(state.renderValidity).toBe('BLOCKED');
    expect(state.blockers[0]).toEqual({
      code: 'layout_unavailable',
      message:
        'Exact layout is unavailable. Studio is waiting for resolver-generated geometry before preview or export can continue.',
    });
  });
});
