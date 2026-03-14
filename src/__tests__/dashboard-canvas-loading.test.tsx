import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DashboardCanvasLoading } from '@/components/layout/DashboardCanvasLoading';

vi.useFakeTimers();

describe('DashboardCanvasLoading', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('renders the page-shaped new job skeleton immediately', () => {
    render(<DashboardCanvasLoading variant="newJob" />);

    expect(screen.getByTestId('dashboard-loading-new-job')).toBeInTheDocument();
    expect(screen.getByText('Preparing new job')).toBeInTheDocument();
  });

  it('escalates slow-network copy after 2s and 8s without removing the notice slot', () => {
    render(<DashboardCanvasLoading variant="newJob" />);

    const notice = screen.getByTestId('slow-load-notice');
    expect(notice).toBeInTheDocument();
    expect(notice).not.toHaveTextContent('Connecting to Seone...');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(notice).toHaveTextContent('Connecting to Seone...');

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(notice).toHaveTextContent(
      'Waking up backend, this can take a bit on cold start.'
    );
  });
});
