import {
  applyTextFontSelection,
  collectRuntimeFontIssues,
  resolveRuntimeTextFont,
} from '@/features/editor/lib/runtimeFontResolver';

const fonts = [
  {
    family: 'NotoSans',
    display: 'Noto Sans',
    weights: [700],
    scripts: ['latin'],
    source: 'builtin',
  },
  {
    family: 'NotoSansDevanagari',
    display: 'Noto Sans Devanagari',
    weights: [700],
    scripts: ['devanagari'],
    source: 'builtin',
  },
  {
    family: 'Mukta',
    display: 'Mukta',
    weights: [400, 700],
    scripts: ['latin', 'devanagari'],
    source: 'builtin',
  },
];

describe('runtimeFontResolver', () => {
  it('uses the active language override when present', () => {
    const resolved = resolveRuntimeTextFont({
      font: {
        family: 'NotoSans',
        weight: 700,
        fallbacks: [],
        size: 60,
        language_overrides: {
          hi: {
            family: 'Mukta',
            weight: 700,
          },
        },
      },
      copyLanguage: 'hi',
      textContent: 'नमस्ते दुनिया',
      fonts,
    });

    expect(resolved.family).toBe('Mukta');
    expect(resolved.weight).toBe(700);
    expect(resolved.issue).toBeNull();
  });

  it('falls back to a Latin-safe runtime font when English text is typed in a Hindi clip', () => {
    const resolved = resolveRuntimeTextFont({
      font: {
        family: 'NotoSansDevanagari',
        weight: 700,
        fallbacks: [],
        size: 60,
      },
      copyLanguage: 'hi',
      textContent: 'hello humans',
      fonts,
    });

    expect(resolved.configuredFamily).toBe('NotoSansDevanagari');
    expect(resolved.family).toBe('NotoSans');
    expect(resolved.fallbackApplied).toBe(true);
    expect(resolved.issue).toBe('script_unsupported');
    expect(resolved.fontState).toBe('FALLBACK_DIAGNOSTIC');
    expect(resolved.repairable).toBe(false);
    expect(resolved.repairFamily).toBeNull();
    expect(resolved.repairWeight).toBeNull();
    expect(resolved.repairMessage).toBeNull();
    expect(resolved.blockingReason).toContain('Preview and export are blocked');
  });

  it('keeps explicit active language overrides strict even when the script is incompatible', () => {
    const resolved = resolveRuntimeTextFont({
      font: {
        family: 'NotoSans',
        weight: 700,
        fallbacks: [],
        size: 60,
        language_overrides: {
          en: {
            family: 'NotoSansDevanagari',
            weight: 700,
          },
        },
      },
      copyLanguage: 'en',
      textContent: 'hello humans',
      fonts,
    });

    expect(resolved.issue).toBe('script_unsupported');
    expect(resolved.repairable).toBe(false);
    expect(resolved.repairFamily).toBeNull();
    expect(resolved.repairMessage).toBeNull();
    expect(resolved.blockingReason).toContain('Preview and export are blocked');
  });

  it('flags families that are not in the runtime catalog', () => {
    const resolved = resolveRuntimeTextFont({
      font: {
        family: 'Missing Font',
        weight: 500,
        fallbacks: [],
        size: 60,
      },
      copyLanguage: 'en',
      textContent: 'hello humans',
      fonts,
    });

    expect(resolved.issue).toBe('missing_family');
    expect(resolved.family).toBe('NotoSans');
  });

  it('updates the active language override while keeping legacy fields synchronized', () => {
    const nextFont = applyTextFontSelection(
      {
        family: 'NotoSans',
        weight: 700,
        fallbacks: [],
        size: 60,
        language_overrides: {
          en: {
            family: 'NotoSans',
            weight: 700,
          },
        },
      },
      {
        family: 'Mukta',
        weight: 400,
        copyLanguage: 'hi',
      }
    );

    expect(nextFont.family).toBe('Mukta');
    expect(nextFont.weight).toBe(400);
    expect(nextFont.language_overrides?.en).toEqual({
      family: 'NotoSans',
      weight: 700,
    });
    expect(nextFont.language_overrides?.hi).toEqual({
      family: 'Mukta',
      weight: 400,
    });
  });

  it('reports active font issues for clip validation', () => {
    const issues = collectRuntimeFontIssues({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'title_band',
            type: 'text',
            content_ref: 'pov_text',
            bounds: { x: 0, y: 0, width: 1080, height: 170 },
            z: 1,
            text: {
              max_lines: 2,
              overflow: 'wrap',
              font: {
                family: 'Missing Font',
                weight: 400,
                fallbacks: [],
                size: 60,
              },
              width_percent: 100,
              min_font_size: 24,
              horizontal_align: 'center',
              vertical_align: 'middle',
              line_spacing_px: 4,
            },
          },
        ],
        styles: {},
        assets: {},
      },
      previewTexts: {
        pov_text: 'hello humans',
      },
      copyLanguage: 'en',
      fonts,
    });

    expect(issues).toEqual([
      {
        zoneId: 'title_band',
        contentRef: 'pov_text',
        family: 'Missing Font',
        language: 'en',
        issue: 'missing_family',
        effectiveFamily: 'NotoSans',
        repairable: false,
        repairFamily: null,
        repairWeight: null,
        message:
          'Missing Font is not available in the runtime font catalog. Preview and export are blocked until you choose an available font.',
      },
    ]);
  });
});
