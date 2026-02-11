
import { renderHook, act } from '@testing-library/react';
import { useJobSubmit } from '../hooks/useJobSubmit';
import { vi, describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
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

describe('Job Payload Contract & Invariants', () => {
    let consoleErrorSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({ id: 'job-contract-123' }),
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('Invariant: Initial state has NO errors (Banner check)', () => {
        const { result } = renderHook(() => useJobSubmit());
        expect(result.current.errors).toEqual({});
        expect(result.current.state.error).toBeNull();
    });

    it('Invariant: Submit blocked if copyLanguage is NULL (No Network Call)', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            // Fill all fields EXCEPT copyLanguage
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=valid');
            result.current.selectTemplate('template-ref-hi');
            result.current.updateField('language', 'hi');
            // copyLanguage defaults to NULL
        });

        await act(async () => {
            await result.current.submit();
        });

        // 1. Check Error State
        expect(result.current.errors.copyLanguage).toBeDefined();
        // 2. Check Submit Blocked (defense in depth)
        // If validation failed, submit returns early.
        // We verify NO network calls were made.
        expect(authService.authFetch).not.toHaveBeenCalled();
    });

    it('Contract: Maps Hindi selection to CANONICAL payload', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=hindi_video');
            result.current.selectTemplate('template-ref-hi');
            result.current.updateField('language', 'hi');
            result.current.updateField('copyLanguage', 'hi'); // EXPLICIT SELECTION
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);
            result.current.updateField('clipCount', 3);
        });

        await act(async () => {
            await result.current.submit();
        });

        const calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        const [url, options] = calls[0];
        const body = JSON.parse(options.body as string);

        // 1. Canonical Fields
        expect(body.url).toBe('https://www.youtube.com/watch?v=hindi_video');
        expect(body.min_duration).toBe(1.0);
        expect(body.max_duration).toBe(2.0);
        expect(body.count).toBe(3);
        expect(body.template_ref).toBe('template-ref-hi');

        // 2. Strict New Contract
        expect(body.language_mode).toBe('hi');
        expect(body.copy_language).toBe('hi'); // Verified explicit

        // 3. Regression / Legacy Checks (MUST BE UNDEFINED)
        expect(body.copy_mode).toBeUndefined();
        expect(body.language).toBeUndefined();
        expect(body.extra_config).toBeUndefined();

        console.log('--- PAYLOAD: language_mode=hi, copy_language=hi ---');
        console.log(JSON.stringify(body, null, 2));
    });

    it('Contract: Maps Auto selection + Copy En to CANONICAL payload', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=auto_video');
            result.current.selectTemplate('template-ref-auto');
            result.current.updateField('language', 'auto');
            result.current.updateField('copyLanguage', 'en'); // EXPLICIT SELECTION
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);
            result.current.updateField('clipCount', 5);
        });

        await act(async () => { await result.current.submit(); });
        const calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        const body = JSON.parse(calls[0][1].body as string);

        // 1. Canonical Fields
        expect(body.url).toBe('https://www.youtube.com/watch?v=auto_video');
        expect(body.count).toBe(5);

        // 2. Strict New Contract
        expect(body.language_mode).toBe('auto');
        expect(body.copy_language).toBe('en'); // Verified explicit (no independence check needed, explicit wins)

        // 3. Regression
        expect(body.copy_mode).toBeUndefined();

        console.log('--- PAYLOAD: language_mode=auto, copy_language=en ---');
        console.log(JSON.stringify(body, null, 2));
    });

    it('Contract: Maps Auto selection + Copy Hi to CANONICAL payload', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=auto_video_hi');
            result.current.selectTemplate('template-ref-auto');
            result.current.updateField('language', 'auto');
            result.current.updateField('copyLanguage', 'hi'); // EXPLICIT SELECTION, different from auto default assumption
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);
            result.current.updateField('clipCount', 5);
        });

        await act(async () => { await result.current.submit(); });
        const calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        const body = JSON.parse(calls[0][1].body as string);

        // 1. Canonical Fields
        expect(body.url).toBe('https://www.youtube.com/watch?v=auto_video_hi');

        // 2. Strict New Contract
        expect(body.language_mode).toBe('auto');
        expect(body.copy_language).toBe('hi'); // Verified explicit independence

        console.log('--- PAYLOAD: language_mode=auto, copy_language=hi ---');
        console.log(JSON.stringify(body, null, 2));
    });

    it('Contract: Maps English selection to CANONICAL payload', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=en_video');
            result.current.selectTemplate('template-ref-en');
            result.current.updateField('language', 'en');
            result.current.updateField('copyLanguage', 'en'); // EXPLICIT SELECTION
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);
            result.current.updateField('clipCount', 4);
        });

        await act(async () => { await result.current.submit(); });
        const calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        const body = JSON.parse(calls[0][1].body as string);

        expect(body.language_mode).toBe('en');
        expect(body.copy_language).toBe('en');

        console.log('--- PAYLOAD: language_mode=en, copy_language=en ---');
        console.log(JSON.stringify(body, null, 2));
    });

    it('Regression: Banner clears after fixing error (no phantom keys)', () => {
        const { result } = renderHook(() => useJobSubmit());

        // 1. Trigger validation errors
        act(() => {
            result.current.submit(); // Will fail validation
        });

        // Error exists
        expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);
        expect(result.current.errors.youtubeUrl).toBeDefined();

        // 2. Clear error by typing
        act(() => {
            result.current.updateField('youtubeUrl', 'https://valid.url');
        });

        // 3. Assert FIX: Key is fully removed, not left as undefined
        const keys = Object.keys(result.current.errors);
        expect(keys).not.toContain('youtubeUrl');
        expect(result.current.errors.youtubeUrl).toBeUndefined();

        console.log('--- REGRESSION PASSED: youtubeUrl key removed from errors:', keys);
    });

    it('Invariant: Fields are strictly present', async () => {
        const { result } = renderHook(() => useJobSubmit());
        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=invar');
            result.current.selectTemplate('temp');
            result.current.updateField('copyLanguage', 'en');
        });

        await act(async () => { await result.current.submit(); });
        const calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        const body = JSON.parse(calls[0][1].body as string);

        const requiredFields = ['url', 'min_duration', 'max_duration', 'count', 'template_ref', 'language_mode', 'copy_language'];
        requiredFields.forEach(field => {
            expect(body[field]).not.toBeUndefined();
            expect(body[field]).not.toBeNull();
        });
    });
});
