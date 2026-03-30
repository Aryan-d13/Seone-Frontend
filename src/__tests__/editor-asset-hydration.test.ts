import { useTemplateStore } from '@/features/editor/store/templateStore';
import { getAssetPreviewUrl } from '@/features/editor/utils/assetPreview';
import { exportTemplate } from '@/features/editor/utils/exportTemplate';
import { importTemplate } from '@/features/editor/utils/importTemplate';

const initialStoreState = useTemplateStore.getState();

beforeEach(() => {
  useTemplateStore.setState(initialStoreState, true);
});

describe('editor asset hydration', () => {
  it('preserves preview-capable asset fields during template import', () => {
    const imported = importTemplate(
      JSON.stringify({
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: 'logo.png',
            source_uri: 'https://cdn.example.com/logo.png',
            gcs_path: 'jobs/abc/assets/logo.png',
          },
        },
      })
    );

    expect(imported.assets.logo_mark).toEqual({
      type: 'image',
      path: 'logo.png',
      source_uri: 'https://cdn.example.com/logo.png',
      gcs_path: 'jobs/abc/assets/logo.png',
    });
  });

  it('prefers manifest asset URLs when resolving preview sources', () => {
    expect(
      getAssetPreviewUrl(
        {
          type: 'image',
          path: 'logo.png',
          source_uri: 'https://cdn.example.com/logo.png',
          gcs_path: 'jobs/abc/assets/logo.png',
        },
        '/jobs/abc/assets/logo.png'
      )
    ).toBe('http://localhost:8000/data/jobs/abc/assets/logo.png');
  });

  it('does not feed protected clip asset proxy URLs directly into image tags', () => {
    expect(
      getAssetPreviewUrl(
        {
          type: 'image',
          path: '/mnt/e/Code/Seone/src/templates/chaturnath/assets/logo.png',
        },
        '/api/v1/jobs/job-123/clips/1/assets/logo_mark'
      )
    ).toBeNull();
  });

  it('does not treat gcs_path as a direct browser preview URL', () => {
    expect(
      getAssetPreviewUrl({
        type: 'image',
        path: 'logo.png',
        gcs_path: 'jobs/abc/assets/logo.png',
      })
    ).toBeNull();
  });

  it('hydrates logo previews from manifest asset URLs during manifest load', () => {
    useTemplateStore.getState().loadFromManifest({
      manifest_version: '1.0',
      template_ir: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'logo_mark',
            type: 'image',
            asset_ref: 'logo_mark',
            bounds: { x: 12, y: 12, width: 96 },
            z: 10,
          },
        ],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: '/mnt/e/Code/Seone/src/templates/chaturnath/assets/logo.png',
          },
        },
      },
      render_payload: {},
      resolved_zones: [],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {
        logo_mark: '/api/v1/jobs/job-123/clips/1/assets/logo_mark',
      },
    } as any);

    expect(useTemplateStore.getState().uploadedImages.logo_mark).toBeUndefined();
  });

  it('does not invent gcs_path for legacy logo assets during manifest load', () => {
    useTemplateStore.getState().loadFromManifest({
      manifest_version: '1.0',
      template_ir: {
        template_version: '1.0',
        id: 'chaturnath/v1',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'logo_mark',
            type: 'image',
            asset_ref: 'logo_mark',
            bounds: { x: 12, y: 12, width: 96 },
            z: 10,
          },
        ],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: 'E:\\Code\\Seone\\temp\\missing\\logo.png',
          },
        },
      },
      render_payload: {
        template_ref: 'chaturnath/v1',
      },
      resolved_zones: [],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    expect(
      useTemplateStore.getState().template.assets.logo_mark.gcs_path
    ).toBeUndefined();
  });

  it('leaves legacy logo metadata untouched when no canonical ref is present', () => {
    useTemplateStore.getState().loadFromManifest({
      manifest_version: '1.0',
      template_ir: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'logo_mark',
            type: 'image',
            asset_ref: 'logo_mark',
            bounds: { x: 12, y: 12, width: 96 },
            z: 10,
          },
        ],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: 'E:\\Code\\Seone\\temp\\missing\\logo.png',
          },
        },
      },
      render_payload: {
        template_ref: 'chaturnath/v1',
      },
      resolved_zones: [],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    expect(
      useTemplateStore.getState().template.assets.logo_mark.gcs_path
    ).toBeUndefined();
  });

  it('hydrates preview text from resolved text when render inputs are missing', () => {
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
            bounds: { x: 0, y: 0, width: 1080, height: 240 },
            z: 10,
            text: {
              max_lines: 3,
              overflow: 'shrink',
              font: {
                family: 'NotoSansDevanagari',
                weight: 700,
                fallbacks: [],
                size: 60,
              },
              width_percent: 75,
              min_font_size: 24,
              horizontal_align: 'center',
              vertical_align: 'middle',
              line_spacing_px: 6,
            },
            style_ref: 'title_style',
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
        inputs: {},
      },
      resolved_zones: [
        {
          id: 'title_band',
          type: 'text',
          rect: { x: 0, y: 0, w: 1080, h: 240 },
          z: 10,
          time: { start: 0, end: 5 },
          resolved: {
            text_layout: {
              source_text: 'Recovered headline',
            },
          },
        },
      ],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    expect(useTemplateStore.getState().previewTexts.pov_text).toBe('Recovered headline');
  });

  it('hydrates text zones as content boxes instead of the full template band', () => {
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
              font: {
                family: 'NotoSansDevanagari',
                weight: 700,
                fallbacks: [],
                size: 60,
              },
              width_percent: 75,
              min_font_size: 24,
              horizontal_align: 'center',
              vertical_align: 'middle',
              line_spacing_px: 2,
            },
            style_ref: 'title_style',
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
        inputs: {
          pov_text: 'Is it Klingon or Yiddish?',
        },
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
              source_text: 'Is it Klingon or Yiddish?',
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

    const zone = useTemplateStore
      .getState()
      .template.zones.find(entry => entry.id === 'title_band');
    const backgroundZone = useTemplateStore
      .getState()
      .template.zones.find(entry => entry.id === 'title_band__bg');
    expect(zone?.bounds.width).toBeLessThan(1080);
    expect(zone?.bounds.height).toBeLessThan(170);
    expect(zone?.bounds.x).toBeGreaterThan(0);
    expect(zone?.text?.width_percent).toBe(100);
    expect(backgroundZone?.type).toBe('shape');
    expect(backgroundZone?.role).toBe('text_background');
    expect(backgroundZone?.bounds).toEqual({ x: 0, y: 0, width: 1080, height: 170 });
    expect(useTemplateStore.getState().isLocked('title_band__bg')).toBe(true);
  });

  it('repairs broken saved title background bounds back to the full title band', () => {
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
            bounds: { x: 0, y: 170, width: 1080, height: 910 },
            z: 0,
            media: { fit: 'cover', crop_anchor: 'center' },
          },
          {
            id: 'title_band__bg',
            type: 'shape',
            bounds: { x: 172, y: 41, width: 736, height: 88 },
            z: 9,
            style_ref: 'title_style__background',
            role: 'text_background',
            shape: { kind: 'rect' },
          },
          {
            id: 'title_band',
            type: 'text',
            content_ref: 'pov_text',
            bounds: { x: 390, y: 40, width: 850, height: 80 },
            z: 10,
            text: {
              max_lines: 3,
              overflow: 'shrink',
              font: {
                family: 'NotoSansDevanagari',
                weight: 700,
                fallbacks: [],
                size: 60,
              },
              width_percent: 100,
              min_font_size: 24,
              horizontal_align: 'center',
              vertical_align: 'middle',
              line_spacing_px: 2,
            },
            style_ref: 'title_style__text',
          },
        ],
        styles: {
          title_style__background: { fill: '#FFFFFF' },
          title_style__text: { fill: '#000000' },
        },
        assets: {},
      },
      render_payload: {
        template_ref: 'chaturnath/v1',
        inputs: {
          pov_text: 'Is it Klingon or Yiddish?',
        },
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
              source_text: 'Is it Klingon or Yiddish?',
              font_size_used: 60,
              horizontal_align: 'center',
              vertical_align: 'middle',
              block_width_px: 700,
              block_height_px: 56,
            },
            fills: {
              text: '#000000',
              bg: '#FFFFFF',
            },
          },
        },
      ],
      canvas: { w: 1080, h: 1080 },
      compositing_mode: 'overlay',
      assets: {},
    } as any);

    const backgroundZone = useTemplateStore
      .getState()
      .template.zones.find(entry => entry.id === 'title_band__bg');
    const textZone = useTemplateStore
      .getState()
      .template.zones.find(entry => entry.id === 'title_band');

    expect(backgroundZone?.bounds).toEqual({ x: 0, y: 0, width: 1080, height: 170 });
    expect(
      Number(textZone?.bounds.x) + Number(textZone?.bounds.width)
    ).toBeLessThanOrEqual(1080);
    expect(
      Number(textZone?.bounds.y) + Number(textZone?.bounds.height)
    ).toBeLessThanOrEqual(170);
  });

  it('does not coerce nullable refs into string values on import', () => {
    const imported = importTemplate(
      JSON.stringify({
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'title_band',
            type: 'text',
            bounds: { x: 0, y: 0, width: 1080, height: 240 },
            z: 10,
            content_ref: null,
            asset_ref: 'null',
            style_ref: 'undefined',
          },
        ],
        styles: {},
        assets: {},
      })
    );

    expect(imported.zones[0].content_ref).toBeUndefined();
    expect(imported.zones[0].asset_ref).toBeUndefined();
    expect(imported.zones[0].style_ref).toBeUndefined();
  });

  it('omits invalid ref strings on export', () => {
    const exported = JSON.parse(
      exportTemplate({
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'logo_mark',
            type: 'image',
            bounds: { x: 10, y: 10, width: 100 },
            z: 20,
            asset_ref: 'null' as any,
            style_ref: 'undefined' as any,
            content_ref: '' as any,
          },
        ],
        styles: {},
        assets: {},
      })
    );

    expect(exported.zones[0]).not.toHaveProperty('asset_ref');
    expect(exported.zones[0]).not.toHaveProperty('style_ref');
    expect(exported.zones[0]).not.toHaveProperty('content_ref');
  });
});
