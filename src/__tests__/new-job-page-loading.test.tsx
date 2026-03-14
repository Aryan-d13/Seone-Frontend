import type { PropsWithChildren } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NewJobPage from '@/app/(dashboard)/dashboard/new/page';
import { useJobSubmit } from '@/hooks/useJobSubmit';
import { useServiceConfig } from '@/hooks/useServiceConfig';
import { useTemplates } from '@/hooks/useTemplates';

vi.mock('@/hooks/useJobSubmit', () => ({
  useJobSubmit: vi.fn(),
}));

vi.mock('@/hooks/useServiceConfig', () => ({
  useServiceConfig: vi.fn(),
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        return ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => {
          const {
            animate,
            initial,
            transition,
            variants,
            whileHover,
            whileTap,
            ...domProps
          } = props;

          void animate;
          void initial;
          void transition;
          void variants;
          void whileHover;
          void whileTap;

          return <div {...domProps}>{children}</div>;
        };
      },
    }
  ),
}));

const mockUseJobSubmit = vi.mocked(useJobSubmit);
const mockUseServiceConfig = vi.mocked(useServiceConfig);
const mockUseTemplates = vi.mocked(useTemplates);

describe('NewJobPage loading state', () => {
  beforeEach(() => {
    mockUseJobSubmit.mockReturnValue({
      formData: { selectedTemplate: null },
      errors: {},
      state: { isSubmitting: false, isSuccess: false, error: null, jobId: null },
      updateField: vi.fn(),
      selectTemplate: vi.fn(),
      submit: vi.fn(),
      reset: vi.fn(),
    } as ReturnType<typeof useJobSubmit>);

    mockUseServiceConfig.mockReturnValue({
      killSwitch: false,
    } as ReturnType<typeof useServiceConfig>);
  });

  it('shows the new job skeleton while templates are still loading', () => {
    mockUseTemplates.mockReturnValue({
      templates: [],
      isLoading: true,
      error: null,
    } as ReturnType<typeof useTemplates>);

    render(<NewJobPage />);

    expect(screen.getByTestId('dashboard-loading-new-job')).toBeInTheDocument();
    expect(screen.getByText('Preparing new job')).toBeInTheDocument();
  });
});
