import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JobDetailPage from '@/app/(dashboard)/dashboard/jobs/[id]/page';
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { authFetch } from '@/services/auth';
import { useJobStore } from '@/stores/job';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/stores/job', () => ({
  useJobStore: vi.fn(),
}));

vi.mock('@/hooks/useJobWebSocket', () => ({
  useJobWebSocket: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  authFetch: vi.fn(),
}));

vi.mock('@/components/job/PipelineTimeline', () => ({
  PipelineTimeline: () => <div>__timeline__</div>,
}));

vi.mock('@/components/job/ClipGallery', () => ({
  ClipGallery: () => <div>__gallery__</div>,
}));

const mockUseJobStore = vi.mocked(useJobStore);
const mockUseJobWebSocket = vi.mocked(useJobWebSocket);
const mockAuthFetch = vi.mocked(authFetch);

function resolvedParams(id: string): Promise<{ id: string }> {
  return {
    status: 'fulfilled',
    value: { id },
    then() {},
  } as unknown as Promise<{ id: string }>;
}

describe('Job detail loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseJobStore.mockReturnValue({
      job: null,
      liveClips: [],
      wsConnected: false,
      lastEventAt: null,
      lastCursor: null,
      isLoading: false,
      error: null,
      setJob: vi.fn(),
      updateJob: vi.fn(),
      addClip: vi.fn(),
      setWsConnected: vi.fn(),
      setLastEventAt: vi.fn(),
      setLastCursor: vi.fn(),
      setError: vi.fn(),
      setLoading: vi.fn(),
      reset: vi.fn(),
    } as ReturnType<typeof useJobStore>);

    mockAuthFetch.mockImplementation(() => new Promise<Response>(() => {}));
  });

  it('renders the page-shaped loading skeleton before the initial fetch resolves', async () => {
    render(<JobDetailPage params={resolvedParams('job-123')} />);

    expect(screen.getByTestId('job-detail-loading')).toBeInTheDocument();
    expect(screen.queryByText('__timeline__')).not.toBeInTheDocument();
    expect(screen.queryByText('__gallery__')).not.toBeInTheDocument();
    expect(mockUseJobWebSocket).toHaveBeenCalledWith('job-123');

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    });
  });
});
