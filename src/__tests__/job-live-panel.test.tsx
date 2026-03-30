import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobLivePanel } from '@/components/job/JobLivePanel';
import { authFetch } from '@/services/auth';
import type { Job, UXFact } from '@/types';

vi.mock('@/services/auth', () => ({
  authFetch: vi.fn(),
}));

const mockAuthFetch = vi.mocked(authFetch);

const FACT_BATCH: UXFact[] = [
  {
    id: 'fact-1',
    headline: 'Bananas are berries',
    body: 'Botanically, bananas count as berries while strawberries do not.',
    tag: 'Curiosity',
    audience_scope: 'global',
    ttl_seconds: 8,
  },
  {
    id: 'fact-2',
    headline: 'Zero has a history',
    body: 'The number zero was formalized in ancient India centuries before it spread widely elsewhere.',
    tag: 'India-Light',
    audience_scope: 'india_light',
    ttl_seconds: 8,
  },
  {
    id: 'fact-3',
    headline: 'Cuts hide in motion',
    body: 'A cut made during movement usually feels smoother because the eye is already busy tracking change.',
    tag: 'Story Craft',
    audience_scope: 'global',
    ttl_seconds: 8,
  },
  {
    id: 'fact-4',
    headline: 'Octopuses taste by touch',
    body: 'An octopus can detect chemicals with its suckers, so touch and taste blur together for it.',
    tag: 'Oddity',
    audience_scope: 'wildcard',
    ttl_seconds: 8,
  },
];

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-123',
    status: 'downloading',
    ui_state: {
      status: 'downloading',
      label: 'Pulling source video',
      sublabel: 'Locking onto the original upload.',
      progress: 12,
      active_step: 'download',
      parallel_hint: null,
    },
    progress: 12,
    clip_count: 0,
    created_at: '2026-03-29T00:00:00Z',
    ...overrides,
  };
}

describe('JobLivePanel', () => {
  beforeEach(() => {
    mockAuthFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ facts: FACT_BATCH }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows a quiet whisper for active states', async () => {
    render(<JobLivePanel job={buildJob()} jobId="job-123" />);

    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('job-live-panel')).toHaveTextContent(
      'Pulling source video'
    );
    expect(screen.getByTestId('job-live-whisper')).toHaveTextContent('Meanwhile');
    expect(screen.getByTestId('job-live-whisper')).toHaveTextContent(
      'Botanically, bananas count as berries while strawberries do not.'
    );
  });

  it('hides the whisper for terminal states', () => {
    render(
      <JobLivePanel
        job={buildJob({
          status: 'completed',
          ui_state: {
            status: 'completed',
            label: 'Done',
            sublabel: null,
            progress: 100,
            active_step: 'completed',
            parallel_hint: null,
          },
          progress: 100,
        })}
        jobId="job-123"
      />
    );

    expect(screen.queryByTestId('job-live-whisper')).not.toBeInTheDocument();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('rotates one whisper at a time from the fetched batch', async () => {
    vi.useFakeTimers();

    render(<JobLivePanel job={buildJob()} jobId="job-123" />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('job-live-whisper')).toHaveTextContent(
      'Botanically, bananas count as berries while strawberries do not.'
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(screen.getByTestId('job-live-whisper')).toHaveTextContent(
      'The number zero was formalized in ancient India centuries before it spread widely elsewhere.'
    );
  });
});
