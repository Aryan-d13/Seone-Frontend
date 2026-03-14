import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { WarmupDebugLogger } from '@/components/layout/WarmupDebugLogger';
import type { WarmupDebugPayload } from '@/lib/requestWarmup';

const PAYLOAD: WarmupDebugPayload = {
  eligible: true,
  path: '/dashboard',
  targets: ['https://api.example.com/api/v1/health', 'https://worker.example.com'],
  at: '2026-03-14T02:10:00.000Z',
};

describe('WarmupDebugLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs once when debug payload is present', () => {
    const view = render(<WarmupDebugLogger payload={PAYLOAD} />);
    view.rerender(<WarmupDebugLogger payload={PAYLOAD} />);

    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      '[WARMUP:debug] middleware warmup triggered',
      PAYLOAD
    );
  });

  it('does not log when payload is absent', () => {
    render(<WarmupDebugLogger payload={null} />);

    expect(console.log).not.toHaveBeenCalled();
  });
});
