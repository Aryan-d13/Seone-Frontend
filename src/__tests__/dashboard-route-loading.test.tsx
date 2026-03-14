import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardLoading from '@/app/(dashboard)/dashboard/loading';
import NewJobLoading from '@/app/(dashboard)/dashboard/new/loading';

describe('Dashboard route loading fallbacks', () => {
  it('renders the overview route loader', () => {
    render(<DashboardLoading />);

    expect(screen.getByTestId('dashboard-loading-overview')).toBeInTheDocument();
    expect(screen.getByText('Preparing dashboard')).toBeInTheDocument();
  });

  it('renders the new-job route loader', () => {
    render(<NewJobLoading />);

    expect(screen.getByTestId('dashboard-loading-new-job')).toBeInTheDocument();
    expect(screen.getByText('Preparing new job')).toBeInTheDocument();
  });
});
