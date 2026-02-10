/**
 * JobsList Component Display Tests
 * 
 * Verifies that the JobsList component correctly distinguishes between
 * requested clip count and actual clips produced for terminal jobs.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobsList } from '@/components/job/JobsList';
import { useJobs } from '@/hooks/useJobs';
import type { Job } from '@/types';

// Mock the useJobs hook
vi.mock('@/hooks/useJobs', () => ({
    useJobs: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

// Mock framer-motion to render children directly
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
}));

const BASE_JOB: Job = {
    id: 'display-test-001',
    status: 'queued',
    progress: 0,
    clip_count: 3, // Requested 3 clips
    created_at: new Date().toISOString(),
};

describe('JobsList Component Display (INV-4)', () => {
    it('shows requested clip count for in-progress jobs', () => {
        const job: Job = { ...BASE_JOB, status: 'rendering', progress: 50 };
        (useJobs as any).mockReturnValue({
            items: [job],
            isLoading: false,
            hasMore: false,
            loadMore: vi.fn(),
            error: null,
        });

        render(<JobsList />);

        // Should just show "3 clips"
        expect(screen.getByText('3 clips')).toBeInTheDocument();
    });

    it('shows "0 / N clips" for failed job with no output', () => {
        const job: Job = { ...BASE_JOB, status: 'failed', error_message: 'Failed' };
        (useJobs as any).mockReturnValue({
            items: [job],
            isLoading: false,
            hasMore: false,
            loadMore: vi.fn(),
            error: null,
        });

        render(<JobsList />);

        // Should show "0 / 3 clips"
        expect(screen.getByText('0 / 3 clips')).toBeInTheDocument();
    });

    it('shows "M / N clips" for completed job with M clips', () => {
        const job: Job = {
            ...BASE_JOB,
            status: 'completed',
            progress: 100,
            output: {
                clips: [
                    { index: 0, url: 'a.mp4', filename: 'a.mp4' },
                    { index: 1, url: 'b.mp4', filename: 'b.mp4' },
                ],
            },
        };
        (useJobs as any).mockReturnValue({
            items: [job],
            isLoading: false,
            hasMore: false,
            loadMore: vi.fn(),
            error: null,
        });

        render(<JobsList />);

        // Should show "2 / 3 clips"
        expect(screen.getByText('2 / 3 clips')).toBeInTheDocument();
    });
});
