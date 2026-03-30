import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClipStudioWorkspace from '@/features/editor/components/Studio/ClipStudioWorkspace';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const authFetchMock = vi.fn();

vi.mock('@/services/auth', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

vi.mock('@/features/editor/components/Canvas/ZoneRenderer', () => ({
  default: ({
    zone,
    assetResolving,
  }: {
    zone: { id: string };
    assetResolving?: boolean;
  }) => (
    <div data-testid={assetResolving ? `zone-loading-${zone.id}` : `zone-${zone.id}`}>
      {zone.id}
    </div>
  ),
}));

vi.mock('@/features/editor/components/Studio/ClipStudioTimeline', () => ({
  default: () => <div data-testid="clip-studio-timeline" />,
}));

const initialStoreState = useTemplateStore.getState();

function makeTemplate() {
  return {
    template_version: '1.0',
    id: 'chaturnath/v1',
    canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'overlay' as const,
    zones: [
      {
        id: 'video_main',
        type: 'video' as const,
        bounds: { x: 0, y: 170, width: 1080, height: 910 },
        z: 1,
        media: { fit: 'cover', crop_anchor: 'center' as const },
      },
      {
        id: 'logo_mark',
        type: 'image' as const,
        asset_ref: 'logo_mark',
        bounds: { x: 18, y: 18, width: 72, height: 72 },
        z: 4,
        media: { fit: 'contain', crop_anchor: 'center' as const },
      },
    ],
    styles: {},
    assets: {
      logo_mark: {
        type: 'image' as const,
        path: 'logo.png',
        gcs_path: 'templates/chaturnath/assets/logo.png',
      },
    },
  };
}

function makeManifest() {
  return {
    manifest_version: '1.0',
    template_ir: makeTemplate(),
    render_payload: {
      template_ref: 'chaturnath/v1',
      source_video_url: '/data/users/user-123/library/videos/source.mp4',
      time_window: { start: 0, end: 5 },
    },
    resolved_zones: [
      {
        id: 'video_main',
        type: 'video',
        rect: { x: 0, y: 170, w: 1080, h: 910 },
        z: 1,
        time: { start: 0, end: 5 },
        resolved: {},
      },
      {
        id: 'logo_mark',
        type: 'image',
        rect: { x: 18, y: 18, w: 72, h: 72 },
        z: 4,
        time: { start: 0, end: 5 },
        resolved: {},
      },
    ],
    canvas: { w: 1080, h: 1080 },
    compositing_mode: 'overlay',
    assets: {
      logo_mark: '/api/v1/jobs/job-123/clips/1/assets/logo_mark',
    },
  };
}

describe('ClipStudioWorkspace loading', () => {
  beforeEach(() => {
    useTemplateStore.setState(initialStoreState, true);
    authFetchMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:logo-preview');
    globalThis.URL.revokeObjectURL = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    HTMLMediaElement.prototype.pause = vi.fn();

    useTemplateStore.setState({
      template: makeTemplate(),
      activeManifest: makeManifest() as any,
      uploadedImages: {},
      previewTexts: {},
      selectedZoneId: null,
      interactionMode: 'idle',
      editingTextZoneId: null,
      zoom: 1,
      sourceVideoAspectRatio: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useTemplateStore.setState(initialStoreState, true);
  });

  it('prefers authenticated clip asset URLs before Firebase logo resolution', async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['logo'], { type: 'image/png' }),
    });

    await act(async () => {
      render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);
    });

    await waitFor(() =>
      expect(useTemplateStore.getState().uploadedImages.logo_mark).toBe('blob:logo-preview'),
    );

    expect(authFetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/jobs/job-123/clips/1/assets/logo_mark',
    );
  });

  it('shows stage and logo skeletons while media is still loading', async () => {
    authFetchMock.mockImplementation(
      () =>
        new Promise(() => {
          // Keep pending to preserve the loading state.
        }),
    );

    await act(async () => {
      render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);
    });

    expect(await screen.findByTestId('clip-studio-video-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('zone-loading-logo_mark')).toBeInTheDocument();
  });

  it('uses the manifest preview URL only when no clip asset proxy context exists', async () => {
    useTemplateStore.setState({
      activeManifest: {
        ...makeManifest(),
        assets: {
          logo_mark: 'http://localhost:8000/data/templates/kapil_kappu_v1/assets/logo.png',
        },
      } as any,
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['logo'], { type: 'image/png' }),
    } as unknown as Response);

    await act(async () => {
      render(<ClipStudioWorkspace />);
    });

    await waitFor(() =>
      expect(useTemplateStore.getState().uploadedImages.logo_mark).toBe('blob:logo-preview'),
    );

    expect(authFetchMock).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/data/templates/kapil_kappu_v1/assets/logo.png',
      { cache: 'no-store' },
    );
  });

  it('marks the asset as failed when the proxy fetch cannot resolve it', async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      blob: async () => new Blob(),
    });

    await act(async () => {
      render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);
    });

    await waitFor(() => {
      expect(useTemplateStore.getState().uploadedImages.logo_mark).toBeUndefined();
    });

    expect(authFetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/jobs/job-123/clips/1/assets/logo_mark',
    );
  });
});
