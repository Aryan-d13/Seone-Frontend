
import { renderHook, act } from '@testing-library/react';
import { useJobSubmit } from '../hooks/useJobSubmit';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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

    it('Invariant: Submit blocked if template is missing (No Network Call)', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            // Fill required fields except template selection
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=valid');
            result.current.updateField('language', 'hi');
            result.current.updateField('copyLanguage', 'hi');
        });

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.errors.selectedTemplate).toBeDefined();
        expect(authService.authFetch).not.toHaveBeenCalled();
    });

    it('Contract: Keeps content language and copy language independent', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=hindi_video');
            result.current.selectTemplate('template-ref-hi');
            result.current.updateField('language', 'hi');
            result.current.updateField('copyLanguage', 'en');
            result.current.updateField('minDuration', 60);
            result.current.updateField('maxDuration', 120);
            result.current.updateField('clipCount', 3);
        });

        await act(async () => {
            await result.current.submit();
        });

        const calls = (authService.authFetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
        const [, options] = calls[0];
        const body = JSON.parse(options.body as string);

        // 1. Canonical Fields
        expect(body.url).toBe('https://www.youtube.com/watch?v=hindi_video');
        expect(body.min_duration).toBe(1.0);
        expect(body.max_duration).toBe(2.0);
        expect(body.count).toBe(3);
        expect(body.template_ref).toBe('template-ref-hi');

        // 2. Contract fields
        expect(body.language_mode).toBe('hi');
        expect(body.copy_language).toBe('en');

        // 3. Regression / Legacy Checks (MUST BE UNDEFINED)
        expect(body.copy_mode).toBeUndefined();
        expect(body.language).toBeUndefined();
        expect(body.extra_config).toBeUndefined();

        console.log('--- PAYLOAD: language_mode=hi, copy_language=en ---');
        console.log(JSON.stringify(body, null, 2));
    });

    it('Contract: Auto content still uses explicitly selected copy language', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=auto_video');
            result.current.selectTemplate('template-ref-auto');
            result.current.updateField('language', 'auto');
            result.current.updateField('copyLanguage', 'hi');
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
        expect(body.copy_language).toBe('hi');

        // 3. Regression
        expect(body.copy_mode).toBeUndefined();

        console.log('--- PAYLOAD: language_mode=auto, copy_language=hi ---');
        console.log(JSON.stringify(body, null, 2));
    });

    it('Contract: Maps English content + English copy', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=en_video');
            result.current.selectTemplate('template-ref-en');
            result.current.updateField('language', 'en');
            result.current.updateField('copyLanguage', 'en');
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
            result.current.updateField('copyLanguage', 'hi');
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

    it('Invariant: Submit blocked if copy language is missing', async () => {
        const { result } = renderHook(() => useJobSubmit());

        act(() => {
            result.current.updateField('youtubeUrl', 'https://www.youtube.com/watch?v=nocopy');
            result.current.updateField('language', 'hi');
            result.current.selectTemplate('template-ref-hi');
        });

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.errors.copyLanguage).toBeDefined();
        expect(authService.authFetch).not.toHaveBeenCalled();
    });
});
