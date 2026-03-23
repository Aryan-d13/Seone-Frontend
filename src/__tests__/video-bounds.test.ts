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
});
