import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

import TemplateFontRegistrar from '@/features/editor/components/Fonts/TemplateFontRegistrar';
import { useTemplateStore } from '@/features/editor/store/templateStore';

vi.mock('@/hooks/useFontCatalog', () => ({
  useFontCatalog: () => ({
    fonts: [
      {
        family: 'NotoSans',
        display: 'Noto Sans',
        weights: [700],
        scripts: ['latin'],
        source: 'builtin',
        files: [
          {
            style: 'normal',
            weights: [700],
            filename: 'NotoSans-Bold.ttf',
            preview_url: 'http://localhost:8000/api/v1/pages/fonts/NotoSans/NotoSans-Bold.ttf',
          },
        ],
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

const initialStoreState = useTemplateStore.getState();

describe('TemplateFontRegistrar', () => {
  beforeEach(() => {
    useTemplateStore.setState(initialStoreState, true);
    useTemplateStore.setState({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [],
        styles: {},
        assets: {},
      } as any,
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'overlay',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: { template_ref: 'clip/test', inputs: {} },
        resolved_zones: [],
        canvas: { w: 1080, h: 1080 },
        compositing_mode: 'overlay',
        assets: {},
      } as any,
      pendingFiles: {},
    });

    const add = vi.fn();
    const remove = vi.fn();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        add,
        delete: remove,
      },
    });

    class MockFontFace {
      family: string;
      source: string;
      descriptors?: Record<string, string>;

      constructor(
        family: string,
        source: string,
        descriptors?: Record<string, string>
      ) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
      }

      load() {
        return Promise.resolve(this as unknown as FontFace);
      }
    }

    vi.stubGlobal('FontFace', MockFontFace as unknown as typeof FontFace);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useTemplateStore.setState(initialStoreState, true);
  });

  it('registers builtin runtime fonts from the backend catalog', async () => {
    await act(async () => {
      render(<TemplateFontRegistrar />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.fonts.add).toHaveBeenCalledTimes(1);
    const [registeredFace] = vi.mocked(document.fonts.add).mock.calls[0];
    expect((registeredFace as any).family).toBe('NotoSans');
    expect((registeredFace as any).source).toContain('NotoSans-Bold.ttf');
  });
});
