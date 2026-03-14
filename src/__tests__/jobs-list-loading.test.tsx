import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobsList } from '@/components/job/JobsList';
import { useJobs } from '@/hooks/useJobs';

vi.mock('@/hooks/useJobs', () => ({
  useJobs: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const mockUseJobs = vi.mocked(useJobs);

describe('JobsList loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header-preserving skeleton rows on initial load', () => {
    mockUseJobs.mockReturnValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
      hasMore: false,
      isLoading: true,
      error: null,
      loadMore: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useJobs>);

    render(<JobsList />);

    expect(screen.getByTestId('jobs-list-loading')).toBeInTheDocument();
    expect(screen.getByText('Job ID')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByTestId('jobs-list-loading-row')).toHaveLength(5);
    expect(screen.queryByText('No jobs found')).not.toBeInTheDocument();
  });
});
