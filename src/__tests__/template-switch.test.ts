import { mergeTemplateForStudioSwitch } from '@/features/editor/utils/templateSwitch';

describe('mergeTemplateForStudioSwitch', () => {
  it('preserves clip-scoped uploaded fonts when switching templates', () => {
    const currentTemplate = {
      template_version: '1.0',
      id: 'current/v1',
      canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
      compositing_mode: 'overlay' as const,
      zones: [],
      styles: {},
      assets: {
        font_custom_700: {
          type: 'font',
          path: 'users/user-1/jobs/job-1/editor_assets/fonts/custom.ttf',
          source_uri: 'http://localhost:8000/data/users/user-1/jobs/job-1/editor_assets/fonts/custom.ttf',
          family: 'Custom Sans',
          weight: 700,
          style: 'normal',
          format: 'ttf',
        },
      },
    };

    const nextTemplate = {
      template_version: '1.0',
      id: 'next/v1',
      canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
      compositing_mode: 'overlay' as const,
      zones: [],
      styles: {},
      assets: {},
    };

    const merged = mergeTemplateForStudioSwitch(currentTemplate as any, nextTemplate as any);

    expect(merged.assets.font_custom_700).toMatchObject({
      type: 'font',
      family: 'Custom Sans',
      weight: 700,
      source_uri: 'http://localhost:8000/data/users/user-1/jobs/job-1/editor_assets/fonts/custom.ttf',
    });
  });

  it('keeps current asset refs for matching slot keys when the new template is empty', () => {
    const currentTemplate = {
      template_version: '1.0',
      id: 'current/v1',
      canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
      compositing_mode: 'overlay' as const,
      zones: [],
      styles: {},
      assets: {
        logo_mark: {
          type: 'image',
          path: 'users/user-1/jobs/job-1/editor_assets/images/logo.png',
          source_uri: 'http://localhost:8000/data/users/user-1/jobs/job-1/editor_assets/images/logo.png',
        },
      },
    };

    const nextTemplate = {
      template_version: '1.0',
      id: 'next/v1',
      canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
      compositing_mode: 'overlay' as const,
      zones: [],
      styles: {},
      assets: {
        logo_mark: {
          type: 'image',
          path: 'logo.png',
        },
      },
    };

    const merged = mergeTemplateForStudioSwitch(currentTemplate as any, nextTemplate as any);

    expect(merged.assets.logo_mark.source_uri).toBe(
      'http://localhost:8000/data/users/user-1/jobs/job-1/editor_assets/images/logo.png',
    );
    expect(merged.assets.logo_mark.path).toBe(
      'users/user-1/jobs/job-1/editor_assets/images/logo.png',
    );
  });
});
