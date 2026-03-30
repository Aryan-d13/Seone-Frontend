import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import PropertyInspector from '@/features/editor/components/Inspector/PropertyInspector';
import { useTemplateStore } from '@/features/editor/store/templateStore';

vi.mock('@/services/auth', () => ({
  authFetch: vi.fn(),
}));

vi.mock('@/features/editor/components/Inspector/FontPicker', () => ({
  default: () => <div data-testid="font-picker" />,
}));

const initialStoreState = useTemplateStore.getState();

function makeTextZone() {
  return {
    id: 'title_band',
    type: 'text' as const,
    content_ref: 'pov_text',
    bounds: { x: 100, y: 40, width: 720, height: 96 },
    z: 10,
    style_ref: 'title_style',
    text: {
      max_lines: 2,
      overflow: 'wrap' as const,
      font: { family: 'Inter', weight: 700, fallbacks: [], size: 56 },
      width_percent: 100,
      min_font_size: 24,
      horizontal_align: 'center' as const,
      vertical_align: 'middle' as const,
      line_spacing_px: 4,
    },
  };
}

function makeVideoZone() {
  return {
    id: 'video_main',
    type: 'video' as const,
    bounds: { x: 0, y: 270, width: 1080, height: 810 },
    z: 0,
    media: {
      fit: 'cover' as const,
      crop_anchor: 'center' as const,
      crop_focus: { x: 0.5, y: 0.5 },
    },
  };
}

function makeTemplate() {
  return {
    template_version: '1.0',
    id: 'chaturnath/v1',
    canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'stack' as const,
    zones: [makeTextZone(), makeVideoZone()],
    styles: {
      title_style: { fill: '#000000', bg_fill: '#FFFFFF' },
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
      inputs: { pov_text: 'Original POV' },
      copy_language: 'en',
      source_video_key: 'users/user-123/library/videos/Dc3d-X6p7Eg.mp4',
      time_window: {
        start: 1.5,
        end: 24.2,
      },
    },
    resolved_zones: [],
    canvas: { w: 1080, h: 1080 },
    compositing_mode: 'stack' as const,
    assets: {},
  };
}

describe('Property inspector numeric inputs', () => {
  beforeEach(() => {
    act(() => {
      useTemplateStore.setState(initialStoreState, true);
    });
  });

  afterEach(() => {
    act(() => {
      useTemplateStore.setState(initialStoreState, true);
    });
  });

  it('keeps draft text while typing and commits exact bounds without grid snap', () => {
    act(() => {
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: null,
        selectedZoneId: 'title_band',
        gridSnap: true,
        gridSize: 10,
      });
    });

    render(<PropertyInspector />);

    const boundsXInput = screen.getByRole('textbox', {
      name: /bounds x/i,
    }) as HTMLInputElement;

    fireEvent.focus(boundsXInput);
    fireEvent.change(boundsXInput, { target: { value: '' } });
    expect(boundsXInput.value).toBe('');
    expect(
      (
        useTemplateStore
          .getState()
          .template.zones.find(zone => zone.id === 'title_band') as any
      ).bounds.x
    ).toBe(100);

    fireEvent.change(boundsXInput, { target: { value: '37' } });
    expect(boundsXInput.value).toBe('37');
    expect(
      (
        useTemplateStore
          .getState()
          .template.zones.find(zone => zone.id === 'title_band') as any
      ).bounds.x
    ).toBe(100);

    fireEvent.blur(boundsXInput);

    expect(
      (
        useTemplateStore
          .getState()
          .template.zones.find(zone => zone.id === 'title_band') as any
      ).bounds.x
    ).toBe(37);
  });

  it('reverts the current draft on Escape without committing', () => {
    act(() => {
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: null,
        selectedZoneId: 'title_band',
      });
    });

    render(<PropertyInspector />);

    const boundsXInput = screen.getByRole('textbox', {
      name: /bounds x/i,
    }) as HTMLInputElement;

    fireEvent.focus(boundsXInput);
    fireEvent.change(boundsXInput, { target: { value: '44' } });
    expect(boundsXInput.value).toBe('44');

    fireEvent.keyDown(boundsXInput, { key: 'Escape' });

    expect(boundsXInput.value).toBe('100');
    expect(
      (
        useTemplateStore
          .getState()
          .template.zones.find(zone => zone.id === 'title_band') as any
      ).bounds.x
    ).toBe(100);
  });

  it('allows decimal trim typing in clip mode and commits on blur', () => {
    act(() => {
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: makeManifest() as any,
        selectedZoneId: 'video_main',
      });
    });

    render(<PropertyInspector />);

    const sourceInInput = screen.getByRole('textbox', {
      name: /source in/i,
    }) as HTMLInputElement;

    fireEvent.focus(sourceInInput);
    fireEvent.change(sourceInInput, { target: { value: '12.' } });

    expect(sourceInInput.value).toBe('12.');
    expect(
      useTemplateStore.getState().activeManifest?.render_payload?.time_window?.start
    ).toBe(1.5);

    fireEvent.blur(sourceInInput);

    expect(
      useTemplateStore.getState().activeManifest?.render_payload?.time_window?.start
    ).toBe(12);
  });
});
