import type { PropsWithChildren } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from '@/app/(dashboard)/dashboard/page';
import { useJobs } from '@/hooks/useJobs';
import { useAuthStore } from '@/stores';
import type { Job } from '@/types';

vi.mock('@/hooks/useJobs', () => ({
  useJobs: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: () => <span>__skeleton__</span>,
}));

const mockUseJobs = vi.mocked(useJobs);
const mockUseAuthStore = vi.mocked(useAuthStore);

const BASE_JOB: Job = {
  id: 'job-1',
  status: 'completed',
  progress: 100,
  clip_count: 3,
  created_at: '2026-03-01T08:30:00Z',
  output: {
    clips: [{ index: 0, url: 'clip.mp4', filename: 'clip.mp4' }],
  },
};

describe('Dashboard loading states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    } as ReturnType<typeof useAuthStore>);
  });

  it('keeps dependent stats in skeleton state until their own requests resolve', () => {
    mockUseJobs
      .mockReturnValueOnce({
        items: [BASE_JOB],
        total: 1,
        isLoading: false,
      } as ReturnType<typeof useJobs>)
      .mockReturnValueOnce({
        items: [],
        total: 0,
        isLoading: true,
      } as ReturnType<typeof useJobs>)
      .mockReturnValueOnce({
        items: [],
        total: 0,
        isLoading: true,
      } as ReturnType<typeof useJobs>);

    render(<DashboardPage />);

    expect(screen.getAllByText('__skeleton__')).toHaveLength(2);
    expect(screen.getByText('Total Jobs').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Completed').parentElement).toHaveTextContent('__skeleton__');
    expect(screen.getByText('Completed').parentElement).not.toHaveTextContent('0');
    expect(screen.getByText('Processing').parentElement).toHaveTextContent(
      '__skeleton__'
    );
    expect(screen.getByText('Processing').parentElement).not.toHaveTextContent('0');
  });
});
