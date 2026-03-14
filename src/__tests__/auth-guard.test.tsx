import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useAuthStore } from '@/stores';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/stores', () => ({
  useAuthStore: vi.fn(),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);

const initialize = vi.fn(async () => {});
const cachedUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
};

describe('AuthGuard', () => {
  beforeEach(() => {
    replace.mockReset();
    initialize.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders protected content immediately when cached auth is still revalidating', () => {
    mockUseAuthStore.mockReturnValue({
      user: cachedUser,
      isAuthenticated: true,
      isLoading: true,
      initialize,
    } as ReturnType<typeof useAuthStore>);

    render(
      <AuthGuard requireAuth>
        <div>Protected content</div>
      </AuthGuard>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-bootstrap-loader')).not.toBeInTheDocument();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('shows the explicit auth bootstrap loader when there is no cached session', () => {
    mockUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      initialize,
    } as ReturnType<typeof useAuthStore>);

    render(
      <AuthGuard requireAuth>
        <div>Protected content</div>
      </AuthGuard>
    );

    expect(screen.getByTestId('auth-bootstrap-loader')).toBeInTheDocument();
    expect(screen.getByText('Securing your workspace')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects to login after verification clears an optimistic protected session', async () => {
    const storeState = {
      user: cachedUser,
      isAuthenticated: true,
      isLoading: true,
      initialize,
    };

    mockUseAuthStore.mockImplementation(
      () => storeState as unknown as ReturnType<typeof useAuthStore>
    );

    const view = render(
      <AuthGuard requireAuth>
        <div>Protected content</div>
      </AuthGuard>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();

    storeState.user = null;
    storeState.isAuthenticated = false;
    storeState.isLoading = false;

    view.rerender(
      <AuthGuard requireAuth>
        <div>Protected content</div>
      </AuthGuard>
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
