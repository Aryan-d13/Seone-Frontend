import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import PropertyInspector from '@/features/editor/components/Inspector/PropertyInspector';
import { useTemplateStore } from '@/features/editor/store/templateStore';

vi.mock('@/services/auth', () => ({
  authFetch: vi.fn(),
}));

vi.mock('@/hooks/useFontCatalog', () => ({
  useFontCatalog: () => ({
    fonts: [
      {
        family: 'NotoSans',
        display: 'Noto Sans',
        weights: [400, 700],
        scripts: ['latin'],
        source: 'builtin',
      },
      {
        family: 'Mukta',
        display: 'Mukta',
        weights: [400, 700],
        scripts: ['latin', 'devanagari'],
        source: 'builtin',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/features/editor/components/Inspector/FontPicker', () => ({
  default: ({
    value,
    weight,
    onChange,
    onWeightChange,
  }: {
    value: string;
    weight: number;
    onChange: (family: string) => void;
    onWeightChange?: (weight: number) => void;
  }) => (
    <div>
      <div data-testid="font-picker-value">{`${value}:${weight}`}</div>
      <button type="button" onClick={() => onChange('Mukta')}>
        choose-mukta
      </button>
      <button type="button" onClick={() => onWeightChange?.(700)}>
        choose-700
      </button>
    </div>
  ),
}));

const initialStoreState = useTemplateStore.getState();

function makeTemplate() {
  return {
    template_version: '1.0',
    id: 'clip/test',
    canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'overlay' as const,
    zones: [
      {
        id: 'title_band',
        type: 'text' as const,
        content_ref: 'pov_text',
        bounds: { x: 0, y: 0, width: 1080, height: 170 },
        z: 1,
        text: {
          max_lines: 2,
          overflow: 'wrap' as const,
          font: {
            family: 'NotoSans',
            weight: 400,
            fallbacks: [],
            size: 60,
            language_overrides: {
              en: {
                family: 'NotoSans',
                weight: 700,
              },
            },
          },
          width_percent: 100,
          min_font_size: 24,
          horizontal_align: 'center' as const,
          vertical_align: 'middle' as const,
          line_spacing_px: 4,
        },
      },
    ],
    styles: {},
    assets: {},
  };
}

describe('PropertyInspector font editing', () => {
  beforeEach(() => {
    act(() => {
      useTemplateStore.setState(initialStoreState, true);
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: {
          manifest_version: '1.0',
          template_ir: makeTemplate(),
          render_payload: {
            template_ref: 'clip/test',
            inputs: { pov_text: 'नमस्ते दुनिया' },
            copy_language: 'hi',
          },
          resolved_zones: [],
          canvas: { w: 1080, h: 1080 },
          compositing_mode: 'overlay',
          assets: {},
        } as any,
        previewTexts: { pov_text: 'नमस्ते दुनिया' },
        selectedZoneId: 'title_band',
      });
    });
  });

  afterEach(() => {
    act(() => {
      useTemplateStore.setState(initialStoreState, true);
    });
  });

  it('edits the active clip language slot and keeps legacy font fields synchronized', () => {
    render(<PropertyInspector />);

    expect(screen.getByTestId('font-picker-value')).toHaveTextContent('NotoSans:400');

    fireEvent.click(screen.getByRole('button', { name: 'choose-mukta' }));

    let zone = useTemplateStore.getState().template.zones[0] as any;
    expect(zone.text.font.family).toBe('Mukta');
    expect(zone.text.font.weight).toBe(400);
    expect(zone.text.font.language_overrides.en).toEqual({
      family: 'NotoSans',
      weight: 700,
    });
    expect(zone.text.font.language_overrides.hi).toEqual({
      family: 'Mukta',
      weight: 400,
    });

    fireEvent.click(screen.getByRole('button', { name: 'choose-700' }));

    zone = useTemplateStore.getState().template.zones[0] as any;
    expect(zone.text.font.family).toBe('Mukta');
    expect(zone.text.font.weight).toBe(700);
    expect(zone.text.font.language_overrides.hi).toEqual({
      family: 'Mukta',
      weight: 700,
    });
  });
});
