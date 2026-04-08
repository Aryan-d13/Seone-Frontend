import { buildStudioManifest } from '@/features/editor/utils/studioManifest';

describe('buildStudioManifest', () => {
  it('merges live preview text into manifest inputs', () => {
    const manifest = buildStudioManifest({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [],
        styles: {},
        assets: {},
      },
      previewTexts: { pov_text: 'edited headline' },
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'overlay',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: {
          template_ref: 'chaturnath/v1',
          inputs: { pov_text: 'old headline' },
          source_video_key: 'users/user-123/library/videos/source.mp4',
        },
        resolved_zones: [],
        canvas: { w: 1080, h: 1080 },
        compositing_mode: 'overlay',
        assets: {},
      },
      draftGeometryZoneIds: new Set(),
    });

    expect(manifest?.render_payload.inputs.pov_text).toBe('edited headline');
    expect(manifest?.render_payload.template_ref).toBe('clip/test');
    expect(manifest).not.toHaveProperty('resolved_zones');
    expect(manifest).not.toHaveProperty('canvas');
    expect(manifest).not.toHaveProperty('compositing_mode');
  });

  it('promotes template asset source_uri into manifest asset URLs', () => {
    const manifest = buildStudioManifest({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: 'users/user-123/jobs/job-1/editor_assets/logo.png',
            source_uri:
              'http://localhost:8000/data/users/user-123/jobs/job-1/editor_assets/logo.png',
          },
        },
      },
      previewTexts: {},
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'overlay',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: {
          template_ref: 'chaturnath/v1',
          inputs: {},
          source_video_key: 'users/user-123/library/videos/source.mp4',
        },
        resolved_zones: [],
        canvas: { w: 1080, h: 1080 },
        compositing_mode: 'overlay',
        assets: {},
      },
      draftGeometryZoneIds: new Set(),
    });

    expect(manifest?.assets.logo_mark).toBe(
      'http://localhost:8000/data/users/user-123/jobs/job-1/editor_assets/logo.png'
    );
  });

  it('keeps an existing resolved manifest asset URL when template metadata is stale', () => {
    const manifest = buildStudioManifest({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: 'E:\\\\Code\\\\Seone\\\\temp\\\\missing\\\\logo.png',
            source_uri: 'templates/chaturnath_v1/assets/logo.png',
          },
        },
      },
      previewTexts: {},
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'overlay',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: {
          template_ref: 'chaturnath/v1',
          inputs: {},
          source_video_key: 'users/user-123/library/videos/source.mp4',
        },
        resolved_zones: [],
        canvas: { w: 1080, h: 1080 },
        compositing_mode: 'overlay',
        assets: {
          logo_mark: '/api/v1/jobs/job-1/clips/1/assets/logo_mark',
        },
      },
      draftGeometryZoneIds: new Set(),
    });

    expect(manifest?.assets.logo_mark).toBe(
      'http://localhost:8000/api/v1/jobs/job-1/clips/1/assets/logo_mark'
    );
  });

  it('preserves the exact logo source_uri while keeping gcs_path as fallback metadata', () => {
    const manifest = buildStudioManifest({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: 'E:\\\\Code\\\\Seone\\\\temp\\\\missing\\\\logo.png',
            source_uri: 'templates/chaturnath_v1/assets/logo.png',
            gcs_path: 'templates/chaturnath/assets/logo.png',
          },
        },
      },
      previewTexts: {},
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'overlay',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: {
          template_ref: 'chaturnath/v1',
          inputs: {},
          source_video_key: 'users/user-123/library/videos/source.mp4',
        },
        resolved_zones: [],
        canvas: { w: 1080, h: 1080 },
        compositing_mode: 'overlay',
        assets: {
          logo_mark: '/api/v1/jobs/job-1/clips/1/assets/logo_mark',
        },
      },
      draftGeometryZoneIds: new Set(),
    });

    expect(manifest?.template_ir.assets.logo_mark.source_uri).toBe(
      'templates/chaturnath_v1/assets/logo.png'
    );
    expect(manifest?.template_ir.assets.logo_mark.gcs_path).toBe(
      'templates/chaturnath/assets/logo.png'
    );
  });

  it('backfills source_uri from the resolved asset URL when the template only has a bad local path', () => {
    const manifest = buildStudioManifest({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [],
        styles: {},
        assets: {
          logo_mark: {
            type: 'image',
            path: 'E:\\\\Code\\\\Seone',
          },
        },
      },
      previewTexts: {},
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'overlay',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: {
          template_ref: 'chaturnath/v1',
          inputs: {},
          source_video_key: 'users/user-123/library/videos/source.mp4',
        },
        resolved_zones: [],
        canvas: { w: 1080, h: 1080 },
        compositing_mode: 'overlay',
        assets: {
          logo_mark: '/api/v1/jobs/job-1/clips/1/assets/logo_mark',
        },
      },
      draftGeometryZoneIds: new Set(),
    });

    expect(manifest?.assets.logo_mark).toBe(
      'http://localhost:8000/api/v1/jobs/job-1/clips/1/assets/logo_mark'
    );
    expect(manifest?.template_ir.assets.logo_mark.source_uri).toBe(
      'http://localhost:8000/api/v1/jobs/job-1/clips/1/assets/logo_mark'
    );
  });

  it('writes resolved baseline bounds for untouched zones and keeps draft geometry for edited ones', () => {
    const manifest = buildStudioManifest({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'stack',
        zones: [
          {
            id: 'title_band',
            type: 'text',
            bounds: { x: 220, y: 42, width: 680, height: 82 },
            z: 10,
            content_ref: 'pov_text',
            text: {
              max_lines: 2,
              overflow: 'shrink',
              font: { family: 'NotoSansDevanagari', weight: 700, fallbacks: [], size: 60 },
              width_percent: 100,
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
            asset_ref: 'logo_mark',
            bounds: { x: 42, y: 18, width: 72, height: 72 },
            z: 11,
          },
        ],
        styles: {
          title_style: { fill: '#24c85c', bg_fill: '#d0d0d0' },
        },
        assets: {},
      },
      previewTexts: { pov_text: 'उसने अपने सपनों के लिए लड़ा' },
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'stack',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: {
          template_ref: 'clip/test',
          inputs: { pov_text: 'old headline' },
          source_video_key: 'users/user-123/library/videos/source.mp4',
        },
        resolved_zones: [
          {
            id: 'title_band',
            type: 'text',
            rect: { x: 0, y: 0, w: 1080, h: 170 },
            z: 10,
            time: { start: 0, end: 5 },
            resolved: {
              text_layout: {
                source_text: 'उसने अपने सपनों के लिए लड़ा',
              },
            },
          },
          {
            id: 'logo_mark',
            type: 'image',
            rect: { x: 18, y: 18, w: 72, h: 72 },
            z: 11,
            time: { start: 0, end: 5 },
            resolved: {},
          },
        ],
        canvas: { w: 1080, h: 1080 },
        compositing_mode: 'stack',
        assets: {},
      },
      draftGeometryZoneIds: new Set(['logo_mark']),
    });

    const titleZone = manifest?.template_ir.zones.find(zone => zone.id === 'title_band');
    const logoZone = manifest?.template_ir.zones.find(zone => zone.id === 'logo_mark');
    expect(titleZone?.bounds).toEqual({ x: 0, y: 0, width: 1080, height: 170 });
    expect(logoZone?.bounds).toEqual({ x: 42, y: 18, width: 72, height: 72 });
  });

  it('tolerates studio draft manifests that omit resolved_zones', () => {
    const manifest = buildStudioManifest({
      template: {
        template_version: '1.0',
        id: 'clip/test',
        canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
        compositing_mode: 'overlay',
        zones: [
          {
            id: 'title_band',
            type: 'text',
            bounds: { x: 220, y: 42, width: 680, height: 82 },
            z: 10,
            content_ref: 'pov_text',
            text: {
              max_lines: 2,
              overflow: 'shrink',
              font: { family: 'NotoSansDevanagari', weight: 700, fallbacks: [], size: 60 },
              width_percent: 100,
              min_font_size: 24,
              horizontal_align: 'center',
              vertical_align: 'middle',
              line_spacing_px: 6,
            },
            style_ref: 'title_style',
          },
        ],
        styles: {
          title_style: { fill: '#24c85c', bg_fill: '#d0d0d0' },
        },
        assets: {},
      },
      previewTexts: { pov_text: 'edited headline' },
      activeManifest: {
        manifest_version: '1.0',
        template_ir: {
          template_version: '1.0',
          id: 'clip/test',
          canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
          compositing_mode: 'overlay',
          zones: [],
          styles: {},
          assets: {},
        },
        render_payload: {
          template_ref: 'clip/test',
          inputs: { pov_text: 'old headline' },
          source_video_url: '/data/users/user-123/library/videos/source.mp4',
        },
        assets: {},
      },
      draftGeometryZoneIds: new Set(),
    });

    expect(manifest?.render_payload.inputs.pov_text).toBe('edited headline');
    expect(manifest?.template_ir.zones[0]?.bounds).toEqual({
      x: 220,
      y: 42,
      width: 680,
      height: 82,
    });
  });
});
