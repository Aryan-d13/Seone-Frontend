import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import RenderPreview from '@/features/editor/components/RenderPreview/RenderPreview';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const authFetchMock = vi.fn();

vi.mock('@/services/auth', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

const initialStoreState = useTemplateStore.getState();

function makeTemplate() {
  return {
    template_version: '1.0',
    id: 'clip/test',
    canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'overlay' as const,
    zones: [],
    styles: {},
    assets: {},
  };
}

function makeManifest() {
  return {
    manifest_version: '1.0',
    template_ir: makeTemplate(),
    render_payload: {
      template_ref: 'chaturnath/v1',
      inputs: { pov_text: 'hello world' },
      time_window: { start: 0, end: 5 },
      render_options: { quality: 'standard' },
      copy_language: 'en',
      source_video_key: 'users/user-123/library/videos/source.mp4',
    },
    resolved_zones: [],
    canvas: { w: 1080, h: 1080 },
    compositing_mode: 'overlay',
    assets: {},
  };
}

describe('RenderPreview', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    useTemplateStore.setState(initialStoreState, true);
    useTemplateStore.setState({
      template: makeTemplate(),
      previewTexts: {},
      activeManifest: makeManifest() as any,
      reRenderState: { loading: false, resultUrl: null, error: null },
    });
  });

  afterEach(() => {
    useTemplateStore.setState(initialStoreState, true);
  });

  it('normalizes local preview URLs returned by the backend', async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        url: '/data/users/user-123/jobs/job-123/clips/preview.mp4',
      }),
    });

    const view = render(
      <RenderPreview renderRequest={{ jobId: 'job-123', clipIndex: 1 }} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /render with changes/i }));
    });

    await waitFor(() =>
      expect(useTemplateStore.getState().reRenderState.resultUrl).toBe(
        'http://localhost:8000/data/users/user-123/jobs/job-123/clips/preview.mp4',
      ),
    );

    const video = view.container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe(
      'http://localhost:8000/data/users/user-123/jobs/job-123/clips/preview.mp4',
    );
  });

  it('shows backend rerender errors verbatim', async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        detail: 'Preview render failed: ffmpeg crashed',
      }),
    });

    render(<RenderPreview renderRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /render with changes/i }));
    });

    expect(
      await screen.findByText('Preview render failed: ffmpeg crashed'),
    ).toBeInTheDocument();
  });

  it('shows an explicit error when the preview video cannot load', async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        url: '/data/users/user-123/jobs/job-123/clips/preview.mp4',
      }),
    });

    render(<RenderPreview renderRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /render with changes/i }));
    });

    const video = await screen.findByTestId('render-preview-video');
    fireEvent.error(video);

    expect(
      await screen.findByText(
        'Preview video failed to load: http://localhost:8000/data/users/user-123/jobs/job-123/clips/preview.mp4',
      ),
    ).toBeInTheDocument();
  });
});
