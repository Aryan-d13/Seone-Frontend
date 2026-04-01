import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClipStudioWorkspace from '@/features/editor/components/Studio/ClipStudioWorkspace';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const initialStoreState = useTemplateStore.getState();

async function flushUi() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderWorkspace(
  props: React.ComponentProps<typeof ClipStudioWorkspace> = {}
) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<ClipStudioWorkspace {...props} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

function installPointerCapturePolyfill() {
  const capturedPointers = new WeakMap<Element, Set<number>>();

  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = function setPointerCapture(pointerId: number) {
      const current = capturedPointers.get(this) ?? new Set<number>();
      current.add(pointerId);
      capturedPointers.set(this, current);
    };
  }

  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(
      pointerId: number
    ) {
      capturedPointers.get(this)?.delete(pointerId);
    };
  }

  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = function hasPointerCapture(pointerId: number) {
      return capturedPointers.get(this)?.has(pointerId) ?? false;
    };
  }
}

function makeTemplate() {
  return {
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
          font: { family: 'NotoSansDevanagari', weight: 700, size: 60, fallbacks: [] },
          width_percent: 85,
          min_font_size: 24,
          horizontal_align: 'center' as const,
          vertical_align: 'middle' as const,
          line_spacing_px: 6,
        },
        style_ref: 'title_style',
      },
      {
        id: 'logo_mark',
        type: 'image' as const,
        asset_ref: 'logo_mark',
        role: 'logo' as const,
        bounds: { x: 18, y: 18, width: 72, height: 72 },
        z: 5,
        media: { fit: 'contain', crop_anchor: 'center' as const },
      },
      {
        id: 'video_main',
        type: 'video' as const,
        bounds: { x: 0, y: 170, width: 1080, height: 910 },
        z: 1,
        media: { fit: 'cover', crop_anchor: 'center' as const },
      },
    ],
    styles: {
      title_style: {
        fill: '#24c85c',
        bg_fill: '#d0d0d0',
      },
    },
    assets: {
      logo_mark: {
        type: 'image' as const,
        path: 'logo.png',
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
      inputs: {
        pov_text: 'उसने अपने सपनों के लिए लड़ा',
      },
    },
    resolved_zones: [
      {
        id: 'title_band',
        type: 'text',
        rect: { x: 0, y: 0, w: 1080, h: 170 },
        z: 4,
        time: { start: 0, end: 2 },
        resolved: {
          text_layout: {
            source_text: 'उसने अपने सपनों के लिए लड़ा',
            lines: ['उसने अपने सपनों के लिए लड़ा'],
            line_count: 1,
            font_family_used: 'NotoSansDevanagari',
            font_size_used: 60,
            line_height_px: 79,
            line_advance_px: 79,
            line_spacing_px: 6,
            horizontal_align: 'center',
            vertical_align: 'middle',
            block_width_px: 704,
            block_height_px: 79,
            font_ascent_px: 54,
            font_descent_px: 25,
            content_box_px: { x: 188, y: 45, width: 704, height: 79 },
            ink_box_px: { width: 704, height: 67 },
            max_text_width_px: 918,
            fits_width: true,
            fits_height: true,
            font_path: 'src/core/fonts/NotoSansDevanagari-Bold.ttf',
            font_weight: 700,
          },
          fills: {
            text: '#24c85c',
            bg: '#d0d0d0',
          },
        },
      },
      {
        id: 'logo_mark',
        type: 'image',
        rect: { x: 18, y: 18, w: 72, h: 72 },
        z: 5,
        time: { start: 0, end: 2 },
        resolved: {},
        role: 'logo',
      },
      {
        id: 'video_main',
        type: 'video',
        rect: { x: 0, y: 170, w: 1080, h: 910 },
        z: 1,
        time: { start: 0, end: 5 },
        resolved: {},
      },
    ],
    canvas: { w: 1080, h: 1080 },
    compositing_mode: 'overlay',
    assets: {
      logo_mark: '/data/users/user-123/jobs/job-123/clips/assets/logo_mark.png',
    },
  };
}

async function primeSourceVideo(video: HTMLVideoElement, currentTime = 0, duration = 12) {
  Object.defineProperty(video, 'duration', {
    configurable: true,
    value: duration,
  });
  Object.defineProperty(video, 'videoWidth', {
    configurable: true,
    value: 1080,
  });
  Object.defineProperty(video, 'videoHeight', {
    configurable: true,
    value: 1920,
  });

  await act(async () => {
    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);
    await Promise.resolve();
  });

  await act(async () => {
    video.currentTime = currentTime;
    fireEvent.timeUpdate(video);
    await Promise.resolve();
  });
}

function mockTrackGeometry(
  trackSurface: HTMLElement,
  sourceTrack: HTMLElement,
  width = 400,
  trackLeft = 160
) {
  Object.defineProperty(trackSurface, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: trackLeft + width + 20,
      height: 42,
      top: 0,
      left: 0,
      right: trackLeft + width + 20,
      bottom: 42,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  Object.defineProperty(sourceTrack, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height: 42,
      top: 0,
      left: trackLeft,
      right: trackLeft + width,
      bottom: 42,
      x: trackLeft,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

describe('ClipStudioWorkspace interactions', () => {
  beforeEach(() => {
    installPointerCapturePolyfill();
    useTemplateStore.setState(initialStoreState, true);
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
    useTemplateStore.setState(initialStoreState, true);
    vi.restoreAllMocks();
  });

  it('uses exactly one source video element in clip mode', async () => {
    const { container } = await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    expect(container.querySelectorAll('video')).toHaveLength(1);
    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    expect(sourceVideo).toBeInTheDocument();
    expect(sourceVideo.muted).toBe(false);
  });

  it('starts playback from the transport button without triggering viewport pan capture', async () => {
    await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    await primeSourceVideo(sourceVideo, 2, 12);

    const transport = screen.getByTestId('clip-studio-transport');
    await act(async () => {
      fireEvent.click(transport);
      await Promise.resolve();
    });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.queryByTestId('clip-studio-video-loading')).not.toBeInTheDocument();
  });

  it('does not reset the playhead or loading state on manifest-only updates', async () => {
    await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    await primeSourceVideo(sourceVideo, 3, 12);

    expect(screen.getByText(/Clip 00:03\.0 \/ 00:05\.0/)).toBeInTheDocument();
    expect(screen.queryByTestId('clip-studio-video-loading')).not.toBeInTheDocument();

    act(() => {
      useTemplateStore.getState().updateManifestRenderPayload({
        inputs: { pov_text: 'Updated copy' },
      });
    });
    await flushUi();

    expect(screen.getByText(/Clip 00:03\.0 \/ 00:05\.0/)).toBeInTheDocument();
    expect(screen.queryByTestId('clip-studio-video-loading')).not.toBeInTheDocument();
  });

  it('keeps trim edits draft-only until pointer release, then commits once', async () => {
    await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    await primeSourceVideo(sourceVideo, 4, 12);

    const trackSurface = screen.getByTestId('clip-studio-track-surface');
    const sourceTrack = screen.getByTestId('clip-studio-source-track');
    const leftHandle = screen.getByTestId('clip-studio-trim-handle-left');
    mockTrackGeometry(trackSurface, sourceTrack);

    expect(useTemplateStore.getState().activeManifest?.render_payload.time_window?.start).toBe(0);

    act(() => {
      fireEvent.pointerDown(leftHandle, { pointerId: 1, clientX: 160, button: 0 });
      fireEvent.pointerMove(sourceTrack, { pointerId: 1, clientX: 260 });
    });
    await flushUi();

    expect(screen.getByText(/Source In 00:03\.0/)).toBeInTheDocument();
    expect(useTemplateStore.getState().activeManifest?.render_payload.time_window?.start).toBe(0);

    act(() => {
      fireEvent.pointerUp(sourceTrack, { pointerId: 1, clientX: 260 });
    });
    await flushUi();

    expect(useTemplateStore.getState().activeManifest?.render_payload.time_window?.start).toBeCloseTo(
      3,
      1
    );
  });

  it('commits the right trim handle using the final pointer position', async () => {
    await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    await primeSourceVideo(sourceVideo, 4, 12);

    const trackSurface = screen.getByTestId('clip-studio-track-surface');
    const sourceTrack = screen.getByTestId('clip-studio-source-track');
    const rightHandle = screen.getByTestId('clip-studio-trim-handle-right');
    mockTrackGeometry(trackSurface, sourceTrack);

    act(() => {
      fireEvent.pointerDown(rightHandle, { pointerId: 6, clientX: 326.6666667, button: 0 });
      fireEvent.pointerMove(sourceTrack, { pointerId: 6, clientX: 460 });
    });
    await flushUi();

    expect(screen.getByText(/Source Out 00:09\.0/)).toBeInTheDocument();
    expect(useTemplateStore.getState().activeManifest?.render_payload.time_window?.end).toBe(5);

    act(() => {
      fireEvent.pointerUp(sourceTrack, { pointerId: 6, clientX: 460 });
    });
    await flushUi();

    expect(useTemplateStore.getState().activeManifest?.render_payload.time_window?.end).toBeCloseTo(
      9,
      1
    );
  });

  it('scrubbing moves only the playhead and leaves committed trim untouched', async () => {
    await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    await primeSourceVideo(sourceVideo, 1, 12);

    const trackSurface = screen.getByTestId('clip-studio-track-surface');
    const sourceTrack = screen.getByTestId('clip-studio-source-track');
    mockTrackGeometry(trackSurface, sourceTrack);

    act(() => {
      fireEvent.pointerDown(sourceTrack, { pointerId: 7, clientX: 360, button: 0 });
      fireEvent.pointerUp(sourceTrack, { pointerId: 7, clientX: 360 });
    });
    await flushUi();

    expect(useTemplateStore.getState().activeManifest?.render_payload.time_window).toEqual({
      start: 0,
      end: 5,
    });
    expect(screen.getByTestId('clip-studio-playhead')).toHaveStyle({ left: '360px' });
  });

  it('keeps title, background, and logo visible while scrubbing beyond stored overlay timing', async () => {
    await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    await primeSourceVideo(sourceVideo, 4, 12);

    const trackSurface = screen.getByTestId('clip-studio-track-surface');
    const sourceTrack = screen.getByTestId('clip-studio-source-track');
    mockTrackGeometry(trackSurface, sourceTrack);

    await act(async () => {
      fireEvent.pointerDown(sourceTrack, { pointerId: 9, clientX: 493, button: 0 });
      fireEvent.pointerMove(sourceTrack, { pointerId: 9, clientX: 493 });
      fireEvent.pointerUp(sourceTrack, { pointerId: 9, clientX: 493 });
      await Promise.resolve();
    });

    expect(screen.getByTestId('zone-title_band')).toBeInTheDocument();
    expect(screen.getByTestId('zone-title_band__bg')).toBeInTheDocument();
    expect(screen.getByTestId('zone-logo_mark')).toBeInTheDocument();
  });

  it('does not scrub when an overlay row is clicked', async () => {
    await renderWorkspace({
      renderPreviewRequest: { jobId: 'job-123', clipIndex: 1 },
    });

    const sourceVideo = screen.getByTestId(
      'clip-studio-source-video'
    ) as HTMLVideoElement;
    await primeSourceVideo(sourceVideo, 1, 12);

    const trackSurface = screen.getByTestId('clip-studio-track-surface');
    const sourceTrack = screen.getByTestId('clip-studio-source-track');
    mockTrackGeometry(trackSurface, sourceTrack);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /show overlay tracks/i }));
      await Promise.resolve();
    });

    const overlayTrack = screen.getByTestId('clip-studio-overlay-track-title_band');
    act(() => {
      fireEvent.pointerDown(overlayTrack, { pointerId: 12, clientX: 360, button: 0 });
      fireEvent.pointerUp(overlayTrack, { pointerId: 12, clientX: 360 });
    });
    await flushUi();

    expect(screen.getByText(/Clip 00:01\.0 \/ 00:05\.0/)).toBeInTheDocument();
  });
});
