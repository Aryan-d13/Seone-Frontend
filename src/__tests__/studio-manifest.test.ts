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
    });

    expect(manifest?.render_payload.inputs.pov_text).toBe('edited headline');
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
            source_uri: 'http://localhost:8000/data/users/user-123/jobs/job-1/editor_assets/logo.png',
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
    });

    expect(manifest?.assets.logo_mark).toBe(
      'http://localhost:8000/data/users/user-123/jobs/job-1/editor_assets/logo.png',
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
    });

    expect(manifest?.assets.logo_mark).toBe(
      'http://localhost:8000/api/v1/jobs/job-1/clips/1/assets/logo_mark',
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
    });

    expect(manifest?.template_ir.assets.logo_mark.source_uri).toBe(
      'templates/chaturnath_v1/assets/logo.png',
    );
    expect(manifest?.template_ir.assets.logo_mark.gcs_path).toBe(
      'templates/chaturnath/assets/logo.png',
    );
  });
});
