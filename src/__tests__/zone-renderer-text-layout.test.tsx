import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ZoneRenderer from '@/features/editor/components/Canvas/ZoneRenderer';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const initialStoreState = useTemplateStore.getState();

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
          font: { family: 'NotoSansDevanagari', weight: 700, size: 60 },
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
  };
}

function makeResolvedZone() {
  return {
    id: 'title_band',
    type: 'text' as const,
    rect: { x: 0, y: 0, w: 1080, h: 170 },
    z: 4,
    time: { start: 0, end: 5 },
    resolved: {
      text_layout: {
        backend: 'pillow',
        source_text: 'उसने अपने सपनों के लिए लड़ा',
        lines: ['उसने अपने सपनों के लिए लड़ा'],
        line_count: 1,
        font_family_used: 'NotoSansDevanagari',
        font_size_used: 60,
        line_height_px: 79,
        line_advance_px: 79,
        line_spacing_px: 6,
        horizontal_align: 'center' as const,
        vertical_align: 'middle' as const,
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
  };
}

describe('ZoneRenderer text layout contract', () => {
  beforeEach(() => {
    useTemplateStore.setState(initialStoreState, true);
    useTemplateStore.setState({
      template: makeTemplate() as any,
      uploadedImages: {},
      previewTexts: {},
      selectedZoneId: 'title_band',
      interactionMode: 'idle',
      editingTextZoneId: null,
      activeManifest: null,
      sourceVideoAspectRatio: null,
      assetPreviewError: null,
      pendingFiles: {},
      reRenderState: { loading: false, resultUrl: null, error: null },
      aiCopySessions: {},
    });
  });

  afterEach(() => {
    useTemplateStore.setState(initialStoreState, true);
  });

  it('positions non-editing text from backend content_box_px instead of heuristic padding', () => {
    const zone = makeTemplate().zones[0] as any;
    const resolvedZone = makeResolvedZone() as any;

    const { container } = render(
      <ZoneRenderer zone={zone} scale={1} resolvedZone={resolvedZone} renderMode="clip" />
    );

    const textBlock = container.querySelector(
      '.zone-renderer__text-block'
    ) as HTMLElement;
    const textLine = container.querySelector('.zone-renderer__text-line') as HTMLElement;
    expect(textBlock).toBeTruthy();
    expect(textLine).toBeTruthy();
    const zoneElement = container.querySelector(
      '[data-testid="zone-title_band"]'
    ) as HTMLElement;
    expect(zoneElement.style.left).toBe('188px');
    expect(zoneElement.style.top).toBe('45px');
    expect(zoneElement.style.width).toBe('704px');
    expect(zoneElement.style.height).toBe('79px');
    expect(textBlock.style.left).toBe('0px');
    expect(textBlock.style.top).toBe('0px');
    expect(textBlock.style.width).toBe('704px');
    expect(textBlock.style.minHeight).toBe('79px');
  });

  it('keeps the editing textarea at least as tall as the backend safe content box', async () => {
    const zone = makeTemplate().zones[0] as any;
    const resolvedZone = makeResolvedZone() as any;
    useTemplateStore.setState({
      interactionMode: 'editing_text',
      editingTextZoneId: 'title_band',
      previewTexts: {
        pov_text: 'उसने अपने सपनों के लिए लड़ा',
      },
    });

    const { container } = render(
      <ZoneRenderer zone={zone} scale={1} resolvedZone={resolvedZone} renderMode="clip" />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const textarea = container.querySelector(
      '.zone-renderer__text-editor'
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.style.left).toBe('0px');
    expect(textarea.style.top).toBe('0px');
    expect(textarea.style.width).toBe('704px');
    expect(textarea.style.minHeight).toBe('79px');
  });

  it('renders untouched clip zones from resolved geometry and switches to draft geometry only after edit', () => {
    const template = makeTemplate() as any;
    template.zones[0].bounds = { x: 220, y: 42, width: 680, height: 82 };
    const zone = template.zones[0];
    const resolvedZone = makeResolvedZone() as any;

    const { container, rerender } = render(
      <ZoneRenderer zone={zone} scale={1} resolvedZone={resolvedZone} renderMode="clip" />
    );

    const untouchedZone = container.querySelector(
      '[data-testid="zone-title_band"]'
    ) as HTMLElement;
    expect(untouchedZone.style.left).toBe('188px');
    expect(untouchedZone.style.top).toBe('45px');
    expect(untouchedZone.style.width).toBe('704px');
    expect(untouchedZone.style.height).toBe('79px');

    useTemplateStore.setState({
      draftGeometryZoneIds: new Set(['title_band']),
    });

    rerender(
      <ZoneRenderer zone={zone} scale={1} resolvedZone={resolvedZone} renderMode="clip" />
    );

    const editedZone = container.querySelector(
      '[data-testid="zone-title_band"]'
    ) as HTMLElement;
    expect(editedZone.style.left).toBe('220px');
    expect(editedZone.style.top).toBe('42px');
    expect(editedZone.style.width).toBe('680px');
    expect(editedZone.style.height).toBe('82px');
  });

  it('renders legacy text background helpers from the paired resolved text rect', () => {
    const backgroundZone = {
      id: 'title_band__bg',
      type: 'shape' as const,
      role: 'text_background',
      bounds: { x: 172, y: 41, width: 736, height: 88 },
      z: 3,
      style_ref: 'title_style__background',
      shape: { kind: 'rect' as const },
    };
    const template = makeTemplate() as any;
    template.zones.unshift(backgroundZone);
    template.styles.title_style__background = { fill: '#d0d0d0' };
    useTemplateStore.setState({
      template,
    });

    const { container } = render(
      <ZoneRenderer
        zone={backgroundZone as any}
        scale={1}
        resolvedZone={makeResolvedZone() as any}
        renderMode="clip"
      />
    );

    const zoneElement = container.querySelector(
      '[data-testid="zone-title_band__bg"]'
    ) as HTMLElement;
    expect(zoneElement.style.left).toBe('0px');
    expect(zoneElement.style.top).toBe('0px');
    expect(zoneElement.style.width).toBe('1080px');
    expect(zoneElement.style.height).toBe('170px');
  });

  it('keeps exact resolved lines on one line without clipping the safe render width', () => {
    const zone = makeTemplate().zones[0] as any;
    const resolvedZone = makeResolvedZone() as any;

    const { container } = render(
      <ZoneRenderer zone={zone} scale={1} resolvedZone={resolvedZone} renderMode="clip" />
    );

    const zoneElement = container.querySelector(
      '[data-testid="zone-title_band"]'
    ) as HTMLElement;
    const fill = container.querySelector('.zone-renderer__fill') as HTMLElement;
    const textBlock = container.querySelector(
      '.zone-renderer__text-block'
    ) as HTMLElement;
    const lines = Array.from(container.querySelectorAll('.zone-renderer__text-line'));

    expect(zoneElement.style.width).toBe('704px');
    expect(fill.style.overflow).toBe('visible');
    expect(textBlock.style.left).toBe('0px');
    expect(textBlock.style.width).toBe('704px');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.textContent).toBe('उसने अपने सपनों के लिए लड़ा');
  });
});
