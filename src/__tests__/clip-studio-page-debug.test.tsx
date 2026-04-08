import { Suspense } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClipStudioPage from '@/app/(editor)/studio/jobs/[id]/clips/[clipIndex]/page';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const authFetchMock = vi.fn();
const fontCatalogState: {
  fonts: Array<Record<string, unknown>>;
  isLoading: boolean;
} = {
  fonts: [],
  isLoading: false,
};

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/services/auth', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

vi.mock('@/features/editor', () => ({
  TemplateBuilderFeature: ({ mode }: { mode: string }) => (
    <div data-testid="clip-studio-feature">{mode}</div>
  ),
}));

vi.mock('@/hooks/useFontCatalog', () => ({
  useFontCatalog: () => fontCatalogState,
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [],
    isLoading: false,
  }),
}));

vi.mock('@/features/editor/lib/firestoreService', () => ({
  getPublicTemplateDocument: vi.fn(),
}));

function makeManifest(overrides?: {
  copyLanguage?: 'en' | 'hi';
  povText?: string;
  fontFamily?: string;
}) {
  return {
    manifest_version: '1.0',
    template_ir: {
      template_version: '1.0',
      id: 'chaturnath/v1',
      canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
      compositing_mode: 'overlay' as const,
      zones: [
        {
          id: 'title_band',
          type: 'text' as const,
          content_ref: 'pov_text',
          bounds: { x: 0, y: 0, width: 1080, height: 170 },
          z: 4,
          text: {
            max_lines: 2,
            overflow: 'shrink' as const,
            font: {
              family: overrides?.fontFamily || 'NotoSansDevanagari',
              weight: 700,
              size: 60,
              fallbacks: [],
            },
            width_percent: 85,
            min_font_size: 24,
            horizontal_align: 'center' as const,
            vertical_align: 'middle' as const,
            line_spacing_px: 6,
          },
          style_ref: 'title_style',
        },
      ],
      styles: {
        title_style: {
          fill: '#24c85c',
          bg_fill: '#d0d0d0',
        },
      },
      assets: {},
    },
    render_payload: {
      template_ref: 'chaturnath/v1',
      source_video_url: '/data/users/user-123/library/videos/source.mp4',
      copy_language: overrides?.copyLanguage || 'hi',
      time_window: { start: 0, end: 5 },
      inputs: {
        pov_text: overrides?.povText || 'उसने अपने सपनों के लिए लड़ा',
      },
    },
    resolved_zones: [
      {
        id: 'title_band',
        type: 'text',
        rect: { x: 0, y: 0, w: 1080, h: 170 },
        z: 4,
        time: { start: 0, end: 5 },
        resolved: {
          text_layout: {
            content_box_px: { x: 40, y: 20, width: 1000, height: 120 },
          },
        },
      },
    ],
    canvas: { w: 1080, h: 1080 },
    compositing_mode: 'overlay',
    assets: {},
  };
}

describe('ClipStudioPage diagnostics', () => {
  const initialStoreState = useTemplateStore.getState();

  beforeEach(() => {
    window.history.replaceState({}, '', '/studio/jobs/job-123/clips/1?clipDebug=1');
    window.localStorage.removeItem('seone:clip-debug');
    delete window.__SEONE_CLIP_DEBUG__;
    delete window.__SEONE_CLIP_DEBUG_BUFFER__;
    delete window.__SEONE_CLIP_DEBUG_SNAPSHOT__;
    delete window.__SEONE_CLIP_DEBUG_EXPORT__;
    delete window.__SEONE_CLIP_DEBUG_PROVIDERS__;
    fontCatalogState.fonts = [];
    fontCatalogState.isLoading = false;
    useTemplateStore.setState(initialStoreState, true);
    authFetchMock.mockReset();
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        manifest: makeManifest(),
        source: 'draft',
        layout_rebuilt: true,
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/studio/jobs/job-123/clips/1');
    delete window.__SEONE_CLIP_DEBUG__;
    delete window.__SEONE_CLIP_DEBUG_BUFFER__;
    delete window.__SEONE_CLIP_DEBUG_SNAPSHOT__;
    delete window.__SEONE_CLIP_DEBUG_EXPORT__;
    delete window.__SEONE_CLIP_DEBUG_PROVIDERS__;
    fontCatalogState.fonts = [];
    fontCatalogState.isLoading = false;
    useTemplateStore.setState(initialStoreState, true);
    vi.restoreAllMocks();
  });

  it('logs manifest fetch and exposes page state through the debug export', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await act(async () => {
      render(
        <Suspense fallback={<div>loading...</div>}>
          <ClipStudioPage params={Promise.resolve({ id: 'job-123', clipIndex: '1' })} />
        </Suspense>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByTestId('clip-studio-feature')).toBeInTheDocument();
    expect(screen.getByText('clip')).toBeInTheDocument();

    const exported = window.__SEONE_CLIP_DEBUG_EXPORT__?.() as {
      buffer?: Array<{ event: string }>;
      snapshot?: Record<string, any>;
    };

    expect(exported?.buffer?.some(entry => entry.event === 'manifest:fetch:start')).toBe(true);
    expect(exported?.buffer?.some(entry => entry.event === 'manifest:fetch:success')).toBe(true);
    expect(exported?.buffer?.some(entry => entry.event === 'page:state')).toBe(true);
    expect(exported?.snapshot?.page).toMatchObject({
      jobId: 'job-123',
      clipIndex: 1,
      status: 'ready',
      studioSource: 'draft',
      layoutRebuiltOnLoad: true,
    });
    expect(['exact', 'stale_exact', 'unavailable']).toContain(exported?.snapshot?.page?.layoutAuthority);

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled();
    });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('shows backend normalization as a passive notice without client-side repair autosave', async () => {
    fontCatalogState.fonts = [
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
    ];

    const normalizedManifest = makeManifest({
      copyLanguage: 'en',
      povText: 'James Bond almost filmed in India',
      fontFamily: 'NotoSans',
    });

    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        manifest: normalizedManifest,
        source: 'draft',
        layout_rebuilt: true,
        font_normalized: true,
        font_normalization_message: 'Adjusted font to NotoSans for English compatibility.',
      }),
    });

    await act(async () => {
      render(
        <Suspense fallback={<div>loading...</div>}>
          <ClipStudioPage params={Promise.resolve({ id: 'job-123', clipIndex: '1' })} />
        </Suspense>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      await screen.findByText('Adjusted font to NotoSans for English compatibility.')
    ).toBeInTheDocument();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(
      authFetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')
    ).toBe(false);
  });
});
