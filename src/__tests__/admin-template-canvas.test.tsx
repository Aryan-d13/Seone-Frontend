import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateAdminPanel from '@/features/editor/admin/TemplateAdminPanel';
import CanvasWorkspace from '@/features/editor/components/Canvas/CanvasWorkspace';
import PropertyInspector from '@/features/editor/components/Inspector/PropertyInspector';
import { useTemplateStore } from '@/features/editor/store/templateStore';
import type { TemplateJSON } from '@/features/editor/types/template';

const listTemplatesMock = vi.fn();
const getTemplateMock = vi.fn();
const saveTemplateMock = vi.fn();
const deleteTemplateMock = vi.fn();
const uploadAssetToAzureMock = vi.fn();
const isAzureAssetUploadConfiguredMock = vi.fn();

vi.mock('@/features/editor/lib/firestoreService', () => ({
  listTemplates: () => listTemplatesMock(),
  getTemplate: (...args: unknown[]) => getTemplateMock(...args),
  saveTemplate: (...args: unknown[]) => saveTemplateMock(...args),
  deleteTemplate: (...args: unknown[]) => deleteTemplateMock(...args),
  toDocId: (templateId: string) => templateId.replace(/\//g, '_'),
}));

vi.mock('@/features/editor/lib/storageService', () => ({
  uploadAssetToAzure: (...args: unknown[]) => uploadAssetToAzureMock(...args),
  isAzureAssetUploadConfigured: () => isAzureAssetUploadConfiguredMock(),
  AZURE_UPLOAD_NOT_CONFIGURED_MESSAGE: 'Logo upload is not configured in this environment.',
}));

const initialStoreState = useTemplateStore.getState();
const OriginalResizeObserver = globalThis.ResizeObserver;
const OriginalImage = globalThis.Image;
const setPointerCapture = HTMLElement.prototype.setPointerCapture;
const releasePointerCapture = HTMLElement.prototype.releasePointerCapture;

function makeTemplate(id = 'chaturnath/v1'): TemplateJSON {
  return {
    template_version: '1.0',
    id,
    canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'stack',
    zones: [
      {
        id: 'title_band',
        type: 'text',
        content_ref: 'pov_text',
        bounds: { x: 0, y: 0, width: 1080, height: 270 },
        z: 10,
        text: {
          max_lines: 3,
          overflow: 'shrink',
          font: { family: 'NotoSansDevanagari', weight: 700, fallbacks: [], size: 60 },
          width_percent: 75,
          min_font_size: 24,
          horizontal_align: 'center',
          vertical_align: 'middle',
          line_spacing_px: 6,
        },
        style_ref: 'title_style',
      },
      {
        id: 'logo_mark',
        type: 'image',
        role: 'logo',
        asset_ref: 'logo_mark',
        bounds: { x: 15, y: 15, width: 50 },
        z: 20,
      },
      {
        id: 'video_main',
        type: 'video',
        bounds: { x: 0, y: 270, width: 1080, height: 810 },
        z: 0,
        media: { fit: 'cover', crop_anchor: 'center' },
      },
    ],
    styles: {
      title_style: { fill: '#000000', bg_fill: '#FFFFFF' },
    },
    assets: {},
  };
}

function installImageMock(width: number, height: number) {
  class MockImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      window.setTimeout(() => {
        this.onload?.();
      }, 0);
    }
  }

  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: MockImage,
  });
}

function renderCanvasHarness() {
  return render(
    <div style={{ width: 1600, height: 1200 }}>
      <CanvasWorkspace />
      <PropertyInspector variant="admin" />
    </div>,
  );
}

beforeAll(() => {
  class ResizeObserverMock {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      Object.defineProperty(target, 'clientWidth', {
        configurable: true,
        value: 1600,
      });
      Object.defineProperty(target, 'clientHeight', {
        configurable: true,
        value: 1200,
      });
      this.callback(
        [
          {
            target,
            contentRect: {
              width: 1600,
              height: 1200,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: 1200,
              right: 1600,
              toJSON: () => ({}),
            } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    unobserve() {}

    disconnect() {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  });

  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  vi.spyOn(window, 'confirm').mockImplementation(() => true);
});

afterAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: OriginalResizeObserver,
  });
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: OriginalImage,
  });
  HTMLElement.prototype.setPointerCapture = setPointerCapture;
  HTMLElement.prototype.releasePointerCapture = releasePointerCapture;
  vi.restoreAllMocks();
});

beforeEach(() => {
  listTemplatesMock.mockReset();
  getTemplateMock.mockReset();
  saveTemplateMock.mockReset();
  deleteTemplateMock.mockReset();
  uploadAssetToAzureMock.mockReset();
  isAzureAssetUploadConfiguredMock.mockReset();
  isAzureAssetUploadConfiguredMock.mockReturnValue(true);
  uploadAssetToAzureMock.mockResolvedValue({
    azureBlobPath: 'templates/chaturnath_v1/assets/logo.png',
    sourceUri: 'azure://seone-data/templates/chaturnath_v1/assets/logo.png',
    downloadUrl: 'https://example.com/logo.png',
  });
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    writable: true,
    value: OriginalImage,
  });

  act(() => {
    useTemplateStore.setState(initialStoreState, true);
    useTemplateStore.getState().setTemplate(makeTemplate());
    useTemplateStore.getState().selectZone(null);
  });
});

afterEach(() => {
  act(() => {
    useTemplateStore.setState(initialStoreState, true);
  });
});

describe('Template admin canvas interactions', () => {
  it('selects and drags the logo while keeping inspector bounds in sync', async () => {
    renderCanvasHarness();

    const zone = await screen.findByTestId('zone-logo_mark');

    fireEvent.pointerDown(zone, { button: 0, pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 80, clientY: 70 });

    await waitFor(() => {
      const logoZone = useTemplateStore.getState().template.zones.find((entry) => entry.id === 'logo_mark');
      expect(logoZone?.bounds.x).toBe(60);
      expect(logoZone?.bounds.y).toBe(50);
    });

    expect(useTemplateStore.getState().selectedZoneId).toBe('logo_mark');
    expect(screen.getByLabelText('Bounds X')).toHaveValue('60');
    expect(screen.getByLabelText('Bounds Y')).toHaveValue('50');
  });

  it('prevents dragging a locked logo zone', async () => {
    act(() => {
      useTemplateStore.getState().toggleLock('logo_mark');
    });

    renderCanvasHarness();

    const zone = await screen.findByTestId('zone-logo_mark');

    fireEvent.pointerDown(zone, { button: 0, pointerId: 2, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 90, clientY: 80 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 90, clientY: 80 });

    await waitFor(() => {
      const logoZone = useTemplateStore.getState().template.zones.find((entry) => entry.id === 'logo_mark');
      expect(logoZone?.bounds.x).toBe(15);
      expect(logoZone?.bounds.y).toBe(15);
    });
  });

  it('resizes the logo with auto-height preserved from the image aspect ratio', async () => {
    installImageMock(200, 100);

    act(() => {
      useTemplateStore.getState().setUploadedImage('logo_mark', 'mock://logo.png');
      useTemplateStore.getState().setAsset('logo_mark', { type: 'image', path: 'logo.png' });
      useTemplateStore.getState().selectZone('logo_mark');
    });

    renderCanvasHarness();

    const zone = await screen.findByTestId('zone-logo_mark');
    await waitFor(() => {
      const width = Number.parseFloat(zone.style.width);
      const height = Number.parseFloat(zone.style.height);
      expect(height).toBeCloseTo(width / 2, 2);
    });

    const handle = await screen.findByTestId('zone-handle-logo_mark-bottomRight');
    act(() => {
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 3,
        clientX: 65,
        clientY: 40,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        button: 0,
        pointerId: 3,
        clientX: 105,
        clientY: 80,
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        pointerId: 3,
        clientX: 105,
        clientY: 80,
      }));
    });

    await waitFor(() => {
      const logoZone = useTemplateStore.getState().template.zones.find((entry) => entry.id === 'logo_mark');
      expect(logoZone?.bounds.width).toBeGreaterThan(50);
      const width = Number.parseFloat(zone.style.width);
      const height = Number.parseFloat(zone.style.height);
      expect(height).toBeCloseTo(width / 2, 2);
    });
  });

  it('keeps text editing interactive without turning it into a drag', async () => {
    renderCanvasHarness();

    const zone = await screen.findByTestId('zone-title_band');
    fireEvent.doubleClick(zone);

    const textarea = await waitFor(() => {
      const editor = document.querySelector('.zone-renderer__text-editor');
      expect(editor).toBeInstanceOf(HTMLTextAreaElement);
      return editor as HTMLTextAreaElement;
    });

    fireEvent.pointerDown(textarea, { button: 0, pointerId: 4, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 320, clientY: 180 });
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 320, clientY: 180 });
    fireEvent.change(textarea, { target: { value: 'Fresh copy' } });

    const titleZone = useTemplateStore.getState().template.zones.find((entry) => entry.id === 'title_band');
    expect(titleZone?.bounds.x).toBe(0);
    expect(titleZone?.bounds.y).toBe(0);
    expect(useTemplateStore.getState().previewTexts.pov_text).toBe('Fresh copy');
  });

  it('persists a dragged logo after save and reopen in the embedded admin panel', async () => {
    let savedTemplate: TemplateJSON | null = null;

    listTemplatesMock.mockImplementation(async () => (
      savedTemplate
        ? [{
            docId: 'kapil_kappu_v2',
            templateId: savedTemplate.id,
            name: 'Kapil Kappu',
            canvasWidth: savedTemplate.canvas.width,
            canvasHeight: savedTemplate.canvas.height,
            zoneCount: savedTemplate.zones.length,
            updatedAt: '2026-03-29T10:00:00.000Z',
          }]
        : []
    ));
    getTemplateMock.mockImplementation(async () => (savedTemplate ? JSON.parse(JSON.stringify(savedTemplate)) : null));
    saveTemplateMock.mockImplementation(async (template: TemplateJSON) => {
      savedTemplate = JSON.parse(JSON.stringify(template));
      return 'kapil_kappu_v2';
    });

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Kapil Kappu' } });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement);

    const logoZone = await screen.findByTestId('zone-logo_mark');
    fireEvent.pointerDown(logoZone, { button: 0, pointerId: 5, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(window, { pointerId: 5, clientX: 80, clientY: 70 });

    await waitFor(() => {
      expect(screen.getByLabelText('Bounds X')).toHaveValue('60');
      expect(screen.getByLabelText('Bounds Y')).toHaveValue('50');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back to library/i }));
    const openButton = await screen.findByRole('button', { name: /^open$/i });
    fireEvent.click(openButton);

    const reopenedZone = await screen.findByTestId('zone-logo_mark');
    fireEvent.click(reopenedZone);

    await waitFor(() => {
      expect(screen.getByLabelText('Bounds X')).toHaveValue('60');
      expect(screen.getByLabelText('Bounds Y')).toHaveValue('50');
    });
  });
});
