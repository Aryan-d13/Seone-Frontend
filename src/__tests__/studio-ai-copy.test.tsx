import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import PropertyInspector from '@/features/editor/components/Inspector/PropertyInspector';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const authFetchMock = vi.fn();

vi.mock('@/services/auth', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

vi.mock('@/features/editor/components/Inspector/FontPicker', () => ({
  default: () => <div data-testid="font-picker" />,
}));

const initialStoreState = useTemplateStore.getState();

function makeTextZone(contentRef = 'pov_text') {
  return {
    id: 'title_band',
    type: 'text' as const,
    content_ref: contentRef,
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

function makeTemplate(contentRef = 'pov_text') {
  return {
    template_version: '1.0',
    id: 'chaturnath/v1',
    canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'overlay' as const,
    zones: [makeTextZone(contentRef)],
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
    },
    resolved_zones: [],
    canvas: { w: 1080, h: 1080 },
    compositing_mode: 'overlay' as const,
    assets: {},
  };
}

describe('Studio AI Copy inspector', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    act(() => {
      useTemplateStore.setState(initialStoreState, true);
    });
  });

  afterEach(() => {
    act(() => {
      useTemplateStore.setState(initialStoreState, true);
    });
  });

  it('only appears for the pov_text layer in clip mode', () => {
    act(() => {
      useTemplateStore.setState({
        template: makeTemplate('other_text') as any,
        activeManifest: makeManifest() as any,
        selectedZoneId: 'title_band',
        previewTexts: { other_text: 'Other text' },
        aiCopySessions: {},
      });
    });

    render(
      <PropertyInspector renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />
    );

    expect(
      screen.queryByRole('button', { name: /generate 3 povs/i })
    ).not.toBeInTheDocument();
  });

  it('hides geometry behind Advanced until requested', async () => {
    act(() => {
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: makeManifest() as any,
        selectedZoneId: 'title_band',
        previewTexts: { pov_text: 'Original POV' },
        aiCopySessions: {},
      });
    });

    render(
      <PropertyInspector renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />
    );

    expect(screen.queryByText('Position & Size')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    });

    expect(screen.getByText('Position & Size')).toBeInTheDocument();
  });

  it('generates suggestions and applies one to pov_text', async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        options: ['POV one', 'POV two', 'POV three'],
        copy_language: 'en',
      }),
    });

    act(() => {
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: makeManifest() as any,
        selectedZoneId: 'title_band',
        previewTexts: { pov_text: 'Original POV' },
        aiCopySessions: {},
      });
    });

    render(
      <PropertyInspector renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate 3 povs/i }));
    });

    expect(authFetchMock).toHaveBeenCalledWith(
      '/api/v1/jobs/job-123/clips/1/copy-suggestions',
      expect.objectContaining({
        method: 'POST',
      })
    );

    await screen.findByText('POV one');

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^use$/i })[0]);
    });

    expect(useTemplateStore.getState().previewTexts.pov_text).toBe('POV one');
  });

  it('regenerate sends prior options as rejected exclusions', async () => {
    authFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          options: ['First one', 'First two', 'First three'],
          copy_language: 'en',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          options: ['Second one', 'Second two', 'Second three'],
          copy_language: 'en',
        }),
      });

    act(() => {
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: makeManifest() as any,
        selectedZoneId: 'title_band',
        previewTexts: { pov_text: 'Original POV' },
        aiCopySessions: {},
      });
    });

    render(
      <PropertyInspector renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate 3 povs/i }));
    });
    await screen.findByText('First one');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    });

    await screen.findByText('Second one');

    const secondCallBody = JSON.parse(authFetchMock.mock.calls[1][1].body);
    expect(secondCallBody.rejected_options).toEqual([
      'First one',
      'First two',
      'First three',
    ]);
  });

  it('keeps manual editing usable when AI copy generation fails', async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: 'Clip analysis context is unavailable.' }),
    });

    act(() => {
      useTemplateStore.setState({
        template: makeTemplate() as any,
        activeManifest: makeManifest() as any,
        selectedZoneId: 'title_band',
        previewTexts: { pov_text: 'Original POV' },
        aiCopySessions: {},
      });
    });

    render(
      <PropertyInspector renderPreviewRequest={{ jobId: 'job-123', clipIndex: 1 }} />
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /generate 3 povs/i }));
    });

    expect(
      await screen.findByText('Clip analysis context is unavailable.')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Original POV'), {
      target: { value: 'Manual edit still works' },
    });

    await waitFor(() => {
      expect(useTemplateStore.getState().previewTexts.pov_text).toBe(
        'Manual edit still works'
      );
    });
  });
});
