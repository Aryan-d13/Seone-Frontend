
import { renderHook, act } from '@testing-library/react';
import { useJobSubmit } from '../hooks/useJobSubmit';
import { vi, describe, it, beforeEach, afterEach } from 'vitest';
import * as authService from '@/services/auth';

// Mock router
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: pushMock,
        replace: vi.fn(),
        prefetch: vi.fn(),
    }),
}));

// Mock authFetch
vi.mock('@/services/auth', () => ({
    authFetch: vi.fn(),
}));

describe('Job Payload Verification', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        // Use console.error to ensure output is captured even if stdout is swallowed
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock successful response
        (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({ id: 'job-123' }),
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });


    it('captures payloads', async () => {
        const { result } = renderHook(() => useJobSubmit());
        const payloads: Record<string, unknown> = {};

        // 1. Hindi
        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            result.current.selectTemplate('template-1');
            result.current.updateField('language', 'hi');
            result.current.updateField('copyLanguage', 'hi');
            // Add clip count just to be sure it's valid
            result.current.updateField('clipCount', 5);
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);

        });
        await act(async () => { await result.current.submit(); });
        let calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        let [, options] = calls[calls.length - 1]; // Get last call
        payloads.hindi = JSON.parse(options.body as string);

        // 2. English
        act(() => {
            result.current.reset(); // Reset first to clear state
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            result.current.selectTemplate('template-1');
            result.current.updateField('language', 'en');
            result.current.updateField('copyLanguage', 'en');
            result.current.updateField('clipCount', 5);
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);
        });
        await act(async () => { await result.current.submit(); });
        calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        [, options] = calls[calls.length - 1];
        payloads.english = JSON.parse(options.body as string);

        // 3. Auto
        act(() => {
            result.current.reset();
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            result.current.selectTemplate('template-1');
            result.current.updateField('language', 'auto');
            result.current.updateField('copyLanguage', 'hi');
            result.current.updateField('clipCount', 5);
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);
        });
        await act(async () => { await result.current.submit(); });
        calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        [, options] = calls[calls.length - 1];
        payloads.auto = JSON.parse(options.body as string);

        // Write to file
        const fs = await import('fs');
        const path = await import('path');
        fs.writeFileSync(path.resolve(__dirname, 'captured_payloads.json'), JSON.stringify(payloads, null, 2));
    });

});
