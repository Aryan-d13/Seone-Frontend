import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ClipStudioWorkspace, {
  getCenteredViewportScroll,
  getStageVisibilityRatio,
} from '@/features/editor/components/Studio/ClipStudioWorkspace';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const OriginalResizeObserver = globalThis.ResizeObserver;
const OriginalRequestAnimationFrame = globalThis.requestAnimationFrame;
const OriginalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const resizeObserverCallbacks = new Map<Element, ResizeObserverCallback[]>();
const initialStoreState = useTemplateStore.getState();

vi.mock('@/features/editor/components/Canvas/ZoneRenderer', () => ({
  default: ({ zone }: { zone: { id: string } }) => <div data-testid={`zone-${zone.id}`} />,
}));

vi.mock('@/features/editor/components/Studio/ClipStudioTimeline', () => ({
  default: () => <div data-testid="clip-studio-timeline" />,
}));

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
    assets: {},
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
        time: { start: 0, end: 5 },
        resolved: {},
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
    assets: {},
  };
}

function emitResize(
  target: Element,
  width: number,
  height: number,
  scrollWidth = 4591,
  scrollHeight = 4670
) {
  Object.defineProperty(target, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(target, 'clientHeight', {
    configurable: true,
    value: height,
  });
  Object.defineProperty(target, 'scrollWidth', {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(target, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });

  for (const callback of resizeObserverCallbacks.get(target) ?? []) {
    callback(
      [
        {
          target,
          contentRect: {
            width,
            height,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: height,
            right: width,
            toJSON: () => ({}),
          } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver
    );
  }
}

async function resizeVisibleViewport(
  frame: Element,
  viewport: Element,
  {
    frameWidth,
    frameHeight,
    viewportWidth = frameWidth,
    viewportHeight = frameHeight,
    scrollWidth = 4591,
    scrollHeight = 4670,
  }: {
    frameWidth: number;
    frameHeight: number;
    viewportWidth?: number;
    viewportHeight?: number;
    scrollWidth?: number;
    scrollHeight?: number;
  }
) {
  await act(async () => {
    emitResize(viewport, viewportWidth, viewportHeight, scrollWidth, scrollHeight);
    emitResize(frame, frameWidth, frameHeight, frameWidth, frameHeight);
    await Promise.resolve();
  });
}

async function flushFrames(count = 4) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 0));
    });
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
  });

  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });

  class ResizeObserverMock {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      const callbacks = resizeObserverCallbacks.get(target) ?? [];
      callbacks.push(this.callback);
      resizeObserverCallbacks.set(target, callbacks);
      emitResize(target, 0, 0);
    }

    unobserve(target: Element) {
      const callbacks = resizeObserverCallbacks.get(target) ?? [];
      resizeObserverCallbacks.set(
        target,
        callbacks.filter(callback => callback !== this.callback)
      );
    }

    disconnect() {
      for (const [target, callbacks] of resizeObserverCallbacks.entries()) {
        resizeObserverCallbacks.set(
          target,
          callbacks.filter(callback => callback !== this.callback)
        );
      }
    }
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: OriginalResizeObserver,
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: OriginalRequestAnimationFrame,
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: OriginalCancelAnimationFrame,
  });
});

beforeEach(() => {
  resizeObserverCallbacks.clear();
  window.history.replaceState({}, '', '/studio/jobs/job-123/clips/1');
  window.localStorage.removeItem('seone:clip-debug');
  delete window.__SEONE_CLIP_DEBUG__;
  delete window.__SEONE_CLIP_DEBUG_BUFFER__;
  delete window.__SEONE_CLIP_DEBUG_SNAPSHOT__;
  delete window.__SEONE_CLIP_DEBUG_EXPORT__;
  delete window.__SEONE_CLIP_DEBUG_PROVIDERS__;
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
  window.history.replaceState({}, '', '/studio/jobs/job-123/clips/1');
  window.localStorage.removeItem('seone:clip-debug');
  delete window.__SEONE_CLIP_DEBUG__;
  delete window.__SEONE_CLIP_DEBUG_BUFFER__;
  delete window.__SEONE_CLIP_DEBUG_SNAPSHOT__;
  delete window.__SEONE_CLIP_DEBUG_EXPORT__;
  delete window.__SEONE_CLIP_DEBUG_PROVIDERS__;
  useTemplateStore.setState(initialStoreState, true);
  vi.restoreAllMocks();
});

describe('clip studio viewport fitting', () => {
  it('returns centered scroll coordinates only when the viewport is ready', () => {
    expect(
      getCenteredViewportScroll({
        viewportWidth: 0,
        viewportHeight: 900,
        workspacePadding: 1620,
        scaledWidth: 620,
        scaledHeight: 620,
      })
    ).toBeNull();

    expect(
      getCenteredViewportScroll({
        viewportWidth: 1400,
        viewportHeight: 900,
        workspacePadding: 1620,
        scaledWidth: 620,
        scaledHeight: 620,
      })
    ).toEqual({
      left: 1230,
      top: 1480,
    });
  });

  it('reports low stage visibility when the viewport is parked away from the stage', () => {
    expect(
      getStageVisibilityRatio({
        viewportWidth: 1400,
        viewportHeight: 900,
        scrollLeft: 0,
        scrollTop: 0,
        workspacePadding: 1620,
        scaledWidth: 620,
        scaledHeight: 620,
      })
    ).toBe(0);
  });

  it('auto-fits the stage after the viewport becomes measurable', async () => {
    render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    const frame = screen.getByTestId('clip-studio-viewport-frame');
    const viewport = screen.getByTestId('clip-studio-viewport');
    await resizeVisibleViewport(frame, viewport, { frameWidth: 1400, frameHeight: 900 });
    await flushFrames();

    expect(viewport.scrollLeft).toBe(1230);
    expect(viewport.scrollTop).toBe(1480);
    expect(screen.getByTestId('zone-title_band')).toBeInTheDocument();
  });

  it('fits using the clipped frame width when the internal viewport expands to content width', async () => {
    render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    const frame = screen.getByTestId('clip-studio-viewport-frame');
    const viewport = screen.getByTestId('clip-studio-viewport');
    await resizeVisibleViewport(frame, viewport, {
      frameWidth: 1400,
      frameHeight: 900,
      viewportWidth: 4592,
      viewportHeight: 900,
      scrollWidth: 4592,
      scrollHeight: 4670,
    });
    await flushFrames(6);

    expect(viewport.scrollLeft).toBe(1230);
    expect(viewport.scrollTop).toBe(1480);
  });

  it('fits vertically when only the vertical axis needs scrolling', async () => {
    render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    const frame = screen.getByTestId('clip-studio-viewport-frame');
    const viewport = screen.getByTestId('clip-studio-viewport');
    await resizeVisibleViewport(frame, viewport, {
      frameWidth: 3860,
      frameHeight: 900,
      viewportWidth: 3860,
      viewportHeight: 900,
      scrollWidth: 3860,
      scrollHeight: 3860,
    });
    await flushFrames(6);

    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(1480);
  });

  it('re-fits on layout resize before the user pans, but preserves manual navigation afterward', async () => {
    render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    const frame = screen.getByTestId('clip-studio-viewport-frame');
    const viewport = screen.getByTestId('clip-studio-viewport');
    await resizeVisibleViewport(frame, viewport, { frameWidth: 1400, frameHeight: 900 });
    await flushFrames();

    await resizeVisibleViewport(frame, viewport, { frameWidth: 1200, frameHeight: 900 });
    await flushFrames();
    await flushFrames(2);

    expect(viewport.scrollLeft).toBe(1330);
    expect(viewport.scrollTop).toBe(1480);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+' }));
      await Promise.resolve();
    });
    await flushFrames(2);

    await act(async () => {
      viewport.scrollLeft = 40;
      viewport.scrollTop = 60;
      fireEvent.scroll(viewport);
      await Promise.resolve();
    });

    await resizeVisibleViewport(frame, viewport, { frameWidth: 1000, frameHeight: 900 });
    await flushFrames();

    expect(viewport.scrollLeft).toBe(40);
    expect(viewport.scrollTop).toBe(60);
  });

  it('restores the stage into view when Fit is pressed after the user scrolls away', async () => {
    render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    const frame = screen.getByTestId('clip-studio-viewport-frame');
    const viewport = screen.getByTestId('clip-studio-viewport');
    await resizeVisibleViewport(frame, viewport, { frameWidth: 1400, frameHeight: 900 });
    await flushFrames();

    await act(async () => {
      viewport.scrollLeft = 5;
      viewport.scrollTop = 15;
      fireEvent.scroll(viewport);
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fit' }));
      await Promise.resolve();
    });
    await flushFrames();

    expect(viewport.scrollLeft).toBe(1230);
    expect(viewport.scrollTop).toBe(1480);
  });

  it('emits workspace diagnostics and exposes snapshot/export helpers when debug mode is enabled', async () => {
    window.history.replaceState(
      {},
      '',
      '/studio/jobs/job-123/clips/1?clipDebug=1'
    );
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    render(<ClipStudioWorkspace renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />);

    const frame = screen.getByTestId('clip-studio-viewport-frame');
    const viewport = screen.getByTestId('clip-studio-viewport');
    await resizeVisibleViewport(frame, viewport, {
      frameWidth: 1280,
      frameHeight: 900,
      viewportWidth: 4510,
      viewportHeight: 900,
      scrollWidth: 4510,
      scrollHeight: 4590,
    });
    await flushFrames(6);

    expect(screen.getByTestId('clip-studio-debug-overlay')).toBeInTheDocument();

    const snapshot = window.__SEONE_CLIP_DEBUG_SNAPSHOT__?.() as Record<string, any>;
    expect(snapshot?.workspace?.frame?.clientWidth).toBe(1280);
    expect(snapshot?.workspace?.frame?.clientHeight).toBe(900);
    expect(snapshot?.workspace?.viewport?.clientWidth).toBe(4510);
    expect(snapshot?.workspace?.viewportWidthMismatch).toBe(true);
    expect(snapshot?.workspace?.fit?.lastRequestedReason).toBeTruthy();
    expect(snapshot?.workspace?.geometry?.stageRect).not.toBeUndefined();

    const exported = window.__SEONE_CLIP_DEBUG_EXPORT__?.() as {
      buffer?: Array<{ event: string }>;
    };
    expect(exported?.buffer?.some(entry => entry.event === 'workspace:viewport:resize')).toBe(
      true
    );
    expect(exported?.buffer?.some(entry => entry.event === 'workspace:fit:apply')).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('surfaces an exact-layout blocker overlay when layout authority is unavailable', async () => {
    render(
      <ClipStudioWorkspace
        renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }}
        layoutAuthority="unavailable"
        layoutAuthorityReason="Preparing exact layout from the latest draft."
      />
    );

    const frame = screen.getByTestId('clip-studio-viewport-frame');
    const viewport = screen.getByTestId('clip-studio-viewport');
    await resizeVisibleViewport(frame, viewport, { frameWidth: 1400, frameHeight: 900 });
    await flushFrames();

    expect(screen.getByTestId('clip-studio-layout-unavailable')).toBeInTheDocument();
    expect(screen.getByText('Preparing exact layout')).toBeInTheDocument();
  });
});
