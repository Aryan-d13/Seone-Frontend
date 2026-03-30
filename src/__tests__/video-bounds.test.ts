import { useTemplateStore } from '@/features/editor/store/templateStore';
import { normalizeVideoBounds } from '@/features/editor/utils/videoBounds';

const initialStoreState = useTemplateStore.getState();

beforeEach(() => {
  useTemplateStore.setState(initialStoreState, true);
});

describe('video bounds normalization', () => {
  it('keeps a stretched video region inside the canvas without collapsing it into a canvas-fit box', () => {
    expect(
      normalizeVideoBounds(
        {
          x: -540,
          y: 170,
          width: 1620,
          height: 1450,
        },
        { width: 1080, height: 1080 },
      ),
    ).toEqual({
      x: 0,
      y: 170,
      width: 1080,
      height: 910,
    });
  });

  it('does not mutate saved video bounds when source metadata becomes available', () => {
    useTemplateStore.getState().loadFromManifest({
      manifest_version: '1.0',
      template_ir: {
        template_version: '1.0',
        id: 'chaturnath/v1',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'video_main',
            type: 'video',
            bounds: { x: 0, y: 270, width: 1080, height: 810 },
            z: 0,
            media: { fit: 'cover', crop_anchor: 'center' },
          },
        ],
        styles: {},
        assets: {},
      },
      render_payload: {
        template_ref: 'chaturnath/v1',
        inputs: {},
      },
      resolved_zones: [],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    useTemplateStore.getState().setSourceVideoAspectRatio(1920 / 1080);
    const videoZone = useTemplateStore.getState().template.zones.find((zone) => zone.id === 'video_main');

    expect(videoZone?.bounds).toEqual({
      x: 0,
      y: 270,
      width: 1080,
      height: 810,
    });
  });

  it('forces stack compositing in clip studio manifests', () => {
    useTemplateStore.getState().loadFromManifest({
      manifest_version: '1.0',
      template_ir: {
        template_version: '1.0',
        id: 'chaturnath/v1',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'title_band',
            type: 'text',
            content_ref: 'pov_text',
            bounds: { x: 0, y: 0, width: 1080, height: 170 },
            z: 10,
            text: {
              max_lines: 3,
              overflow: 'shrink',
              font: { family: 'NotoSansDevanagari', weight: 700, fallbacks: [], size: 60 },
              width_percent: 75,
              min_font_size: 24,
              horizontal_align: 'center',
              vertical_align: 'middle',
              line_spacing_px: 2,
            },
            style_ref: 'title_style',
          },
          {
            id: 'video_main',
            type: 'video',
            bounds: { x: 0, y: 170, width: 1080, height: 910 },
            z: 0,
            media: { fit: 'cover', crop_anchor: 'center' },
          },
        ],
        styles: {
          title_style: {
            fill: '#000000',
            bg_fill: '#FFFFFF',
          },
        },
        assets: {},
      },
      render_payload: {
        template_ref: 'chaturnath/v1',
        inputs: { pov_text: 'Test headline' },
      },
      resolved_zones: [
        {
          id: 'title_band',
          type: 'text',
          rect: { x: 0, y: 0, w: 1080, h: 170 },
          z: 10,
          time: { start: 0, end: 10 },
          resolved: {
            text_layout: {
              source_text: 'Test headline',
              font_size_used: 60,
              horizontal_align: 'center',
              vertical_align: 'middle',
              block_width_px: 700,
              block_height_px: 56,
            },
          },
        },
      ],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    expect(useTemplateStore.getState().template.compositing_mode).toBe('stack');
  });

  it('preserves the current video region ratio during inspector-driven resize', () => {
    useTemplateStore.getState().loadFromManifest({
      manifest_version: '1.0',
      template_ir: {
        template_version: '1.0',
        id: 'chaturnath/v1',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'video_main',
            type: 'video',
            bounds: { x: 0, y: 270, width: 1080, height: 810 },
            z: 0,
            media: { fit: 'cover', crop_anchor: 'center' },
          },
        ],
        styles: {},
        assets: {},
      },
      render_payload: {
        template_ref: 'chaturnath/v1',
        inputs: {},
      },
      resolved_zones: [],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    useTemplateStore.getState().setSourceVideoAspectRatio(1920 / 1080);
    useTemplateStore.getState().updateZoneBounds('video_main', { width: 600 });
    const resized = useTemplateStore.getState().template.zones.find((zone) => zone.id === 'video_main');

    expect(resized?.bounds).toEqual({
      x: 0,
      y: 270,
      width: 600,
      height: 450,
    });
  });

  it('keeps the title background width aligned to the video region in stack mode', () => {
    useTemplateStore.getState().loadFromManifest({
      manifest_version: '1.0',
      template_ir: {
        template_version: '1.0',
        id: 'chaturnath/v1',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'title_band',
            type: 'text',
            content_ref: 'pov_text',
            bounds: { x: 140, y: 30, width: 640, height: 120 },
            z: 10,
            text: {
              max_lines: 3,
              overflow: 'shrink',
              font: { family: 'NotoSansDevanagari', weight: 700, fallbacks: [], size: 60 },
              width_percent: 100,
              min_font_size: 24,
              horizontal_align: 'center',
              vertical_align: 'middle',
              line_spacing_px: 2,
            },
            style_ref: 'title_style',
          },
          {
            id: 'video_main',
            type: 'video',
            bounds: { x: 0, y: 170, width: 1080, height: 810 },
            z: 0,
            media: { fit: 'cover', crop_anchor: 'center' },
          },
        ],
        styles: {
          title_style: {
            fill: '#000000',
            bg_fill: '#FFFFFF',
          },
        },
        assets: {},
      },
      render_payload: {
        template_ref: 'chaturnath/v1',
        inputs: { pov_text: 'Test headline' },
      },
      resolved_zones: [
        {
          id: 'title_band',
          type: 'text',
          rect: { x: 0, y: 0, w: 1080, h: 170 },
          z: 10,
          time: { start: 0, end: 10 },
          resolved: {
            text_layout: {
              source_text: 'Test headline',
              font_size_used: 60,
              horizontal_align: 'center',
              vertical_align: 'middle',
              block_width_px: 700,
              block_height_px: 56,
            },
          },
        },
      ],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    useTemplateStore.getState().updateZoneBounds('video_main', {
      x: 80,
      width: 920,
    });

    const backgroundZone = useTemplateStore.getState().template.zones.find((zone) => zone.id === 'title_band__bg');
    const videoZone = useTemplateStore.getState().template.zones.find((zone) => zone.id === 'video_main');
    const textZone = useTemplateStore.getState().template.zones.find((zone) => zone.id === 'title_band');

    expect(backgroundZone?.bounds).toMatchObject({
      x: 80,
      width: 920,
    });
    expect(videoZone?.bounds).toMatchObject({
      x: 80,
      width: 920,
    });
    expect(Number(textZone?.bounds.x)).toBeGreaterThanOrEqual(80);
    expect(Number(textZone?.bounds.x) + Number(textZone?.bounds.width)).toBeLessThanOrEqual(1000);
  });
});
