import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import TemplateAdminPanel from '@/features/editor/admin/TemplateAdminPanel';
import { useTemplateStore } from '@/features/editor/store/templateStore';

const listTemplatesMock = vi.fn();
const getTemplateMock = vi.fn();
const saveTemplateMock = vi.fn();
const deleteTemplateMock = vi.fn();
const uploadAssetToAzureMock = vi.fn();
const isAzureAssetUploadConfiguredMock = vi.fn();

vi.mock('@/features/editor/components/Canvas/CanvasWorkspace', () => ({
  default: () => <div data-testid="admin-canvas">Canvas</div>,
}));

vi.mock('@/features/editor/components/Inspector/PropertyInspector', () => ({
  default: () => <div data-testid="admin-inspector">Inspector</div>,
}));

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
  AZURE_UPLOAD_NOT_CONFIGURED_MESSAGE:
    'Logo upload is not configured in this environment.',
}));

const initialStoreState = useTemplateStore.getState();

function makeTemplate(id = 'chaturnath/v1') {
  return {
    template_version: '1.0',
    id,
    canvas: { width: 1080, height: 1080, unit: 'px', color_space: 'sRGB' },
    compositing_mode: 'stack' as const,
    zones: [
      {
        id: 'title_band',
        type: 'text' as const,
        content_ref: 'pov_text',
        bounds: { x: 0, y: 0, width: 1080, height: 270 },
        z: 10,
        text: {
          max_lines: 3,
          overflow: 'shrink' as const,
          font: { family: 'Inter', weight: 700, fallbacks: [], size: 60 },
          width_percent: 75,
          min_font_size: 24,
          horizontal_align: 'center' as const,
          vertical_align: 'middle' as const,
          line_spacing_px: 6,
        },
        style_ref: 'title_style',
      },
    ],
    styles: {
      title_style: { fill: '#000000', bg_fill: '#FFFFFF' },
    },
    assets: {},
  };
}

describe('Template admin panel', () => {
  beforeEach(() => {
    listTemplatesMock.mockReset();
    getTemplateMock.mockReset();
    saveTemplateMock.mockReset();
    deleteTemplateMock.mockReset();
    uploadAssetToAzureMock.mockReset();
    uploadAssetToAzureMock.mockResolvedValue({
      azureBlobPath: 'templates/chaturnath_v1/assets/logo.png',
      sourceUri: 'azure://seone-data/templates/chaturnath_v1/assets/logo.png',
      downloadUrl: 'https://example.com/logo.png',
    });
    isAzureAssetUploadConfiguredMock.mockReturnValue(true);

    act(() => {
      useTemplateStore.setState(initialStoreState, true);
    });
  });

  afterEach(() => {
    act(() => {
      useTemplateStore.setState(initialStoreState, true);
    });
  });

  it('opens on the template library with existing templates visible', async () => {
    listTemplatesMock.mockResolvedValue([
      {
        docId: 'chaturnath_v1',
        templateId: 'chaturnath/v1',
        name: 'Chaturnath',
        canvasWidth: 1080,
        canvasHeight: 1080,
        zoneCount: 3,
        updatedAt: '2026-03-24T12:00:00.000Z',
      },
    ]);

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(await screen.findByText('Chaturnath')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new/i })).toBeInTheDocument();
  });

  it('creates a new template through the modal and opens the focused editor shell', async () => {
    listTemplatesMock.mockResolvedValue([]);

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Kapil Kappu' },
    });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement
    );

    expect(
      await screen.findByRole('button', { name: /back to library/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Kapil Kappu')).toBeInTheDocument();
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
    expect(screen.getByTestId('admin-canvas')).toBeInTheDocument();
  });

  it('saves a newly created template explicitly', async () => {
    listTemplatesMock.mockResolvedValue([]);
    saveTemplateMock.mockResolvedValue('kapil_kappu_v2');

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Kapil Kappu' },
    });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(saveTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'kapil_kappu/v2',
        }),
        'admin@example.com'
      );
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('stores uploaded admin template assets in source_uri without writing gcs_path', async () => {
    listTemplatesMock.mockResolvedValue([]);
    saveTemplateMock.mockResolvedValue('kapil_kappu_v2');
    uploadAssetToAzureMock.mockResolvedValueOnce({
      azureBlobPath: 'templates/kapil_kappu_v2/assets/logo.png',
      sourceUri: 'azure://seone-data/templates/kapil_kappu_v2/assets/logo.png',
      downloadUrl: 'https://example.com/logo.png',
    });

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Kapil Kappu' },
    });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement
    );

    await screen.findByRole('button', { name: /back to library/i });

    act(() => {
      useTemplateStore
        .getState()
        .setPendingFile(
          'logo_mark',
          new File(['png'], 'logo.png', { type: 'image/png' })
        );
      useTemplateStore.getState().setAsset('logo_mark', {
        type: 'image',
        gcs_path: 'templates/legacy/assets/logo.png',
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    await waitFor(() => {
      expect(uploadAssetToAzureMock).toHaveBeenCalledWith(
        'kapil_kappu_v2',
        'logo.png',
        expect.any(File),
        expect.objectContaining({
          assetKey: 'logo_mark',
          assetType: 'image',
        })
      );
      expect(saveTemplateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          assets: expect.objectContaining({
            logo_mark: expect.objectContaining({
              type: 'image',
              source_uri: 'azure://seone-data/templates/kapil_kappu_v2/assets/logo.png',
            }),
          }),
        }),
        'admin@example.com'
      );
    });

    const savedTemplate = saveTemplateMock.mock.calls.at(-1)?.[0];
    expect(savedTemplate.assets.logo_mark.gcs_path).toBeUndefined();
  });

  it('shows a visible delete action for the selected layer and supports keyboard delete', async () => {
    listTemplatesMock.mockResolvedValue([]);

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Kapil Kappu' },
    });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement
    );

    await screen.findByRole('button', { name: /back to library/i });

    fireEvent.click(screen.getByRole('button', { name: 'title_band' }));

    expect(screen.getByRole('button', { name: /delete layer/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /delete selected layer/i })
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Delete' });
    });

    expect(
      useTemplateStore.getState().template.zones.find(zone => zone.id === 'title_band')
    ).toBeUndefined();
  });

  it('does not trigger keyboard delete while typing in an input', async () => {
    listTemplatesMock.mockResolvedValue([]);

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Kapil Kappu' },
    });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement
    );

    await screen.findByRole('button', { name: /back to library/i });

    fireEvent.click(screen.getByRole('button', { name: 'title_band' }));

    const saveAsButton = screen.getByRole('button', { name: /save as new/i });
    fireEvent.click(saveAsButton);

    const nameInput = screen.getByLabelText(/^name$/i);
    fireEvent.focus(nameInput);

    await act(async () => {
      fireEvent.keyDown(nameInput, { key: 'Backspace' });
    });

    expect(
      useTemplateStore.getState().template.zones.find(zone => zone.id === 'title_band')
    ).toBeDefined();
  });

  it('maps 401 admin failures to an explicit session message', async () => {
    listTemplatesMock.mockRejectedValue(
      new Error('Failed to list templates (401): unauthorized')
    );

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    expect(await screen.findByTestId('admin-library-error')).toHaveTextContent(
      'Your session is missing or expired. Sign in again to manage templates.'
    );
  });

  it('maps 503 admin failures to an explicit storage message', async () => {
    listTemplatesMock.mockRejectedValue(
      new Error('Failed to list templates (503): Template storage is unavailable')
    );

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    expect(await screen.findByTestId('admin-library-error')).toHaveTextContent(
      'Template storage is unavailable right now. Check Firestore and template-storage configuration.'
    );
  });

  it('fails fast with a clear message when logo upload is not configured', async () => {
    listTemplatesMock.mockResolvedValue([]);
    isAzureAssetUploadConfiguredMock.mockReturnValue(false);

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Kapil Kappu' },
    });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement
    );

    await screen.findByRole('button', { name: /back to library/i });

    act(() => {
      useTemplateStore
        .getState()
        .setPendingFile(
          'logo_mark',
          new File(['png'], 'logo.png', { type: 'image/png' })
        );
      useTemplateStore.getState().setAsset('logo_mark', {
        type: 'image',
        path: 'logo.png',
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    });

    expect(await screen.findByTestId('admin-save-error')).toHaveTextContent(
      'Logo upload is not configured in this environment.'
    );
    expect(uploadAssetToAzureMock).not.toHaveBeenCalled();
  });

  it('shows a visible editor banner when protected asset hydration fails auth', async () => {
    listTemplatesMock.mockResolvedValue([]);

    render(<TemplateAdminPanel userEmail="admin@example.com" />);

    await screen.findByText(/no templates yet/i);

    fireEvent.click(screen.getAllByRole('button', { name: /create/i })[0]);
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Kapil Kappu' },
    });
    fireEvent.change(screen.getByLabelText(/^version$/i), { target: { value: 'v2' } });
    fireEvent.submit(
      screen.getByRole('button', { name: /continue/i }).closest('form') as HTMLFormElement
    );

    await screen.findByRole('button', { name: /back to library/i });

    act(() => {
      useTemplateStore
        .getState()
        .setAssetPreviewError(
          'Your session is missing or expired. Sign in again to load template assets.'
        );
    });

    expect(await screen.findByTestId('admin-asset-preview-error')).toHaveTextContent(
      'Your session is missing or expired. Sign in again to load template assets.'
    );
  });
});
