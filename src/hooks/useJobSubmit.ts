'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    SubmissionFormData,
    FormErrors,
    SubmissionState,
    defaultFormData,
    DURATION_MIN,
    DURATION_MAX,
    CLIP_COUNT_MIN,
    CLIP_COUNT_MAX,
} from '@/types/job';
import { isValidYouTubeUrl } from '@/lib/utils';
import { authFetch } from '@/services/auth';
import { endpoints } from '@/lib/config';
import { usePages } from '@/hooks/usePages';

export function useJobSubmit() {
    const router = useRouter();
    const [formData, setFormData] = useState<SubmissionFormData>(defaultFormData);
    const [errors, setErrors] = useState<FormErrors>({});
    const [state, setState] = useState<SubmissionState>({
        isSubmitting: false,
        isSuccess: false,
        error: null,
        jobId: null,
    });

    // Update form field
    const updateField = useCallback(<K extends keyof SubmissionFormData>(
        field: K,
        value: SubmissionFormData[K]
    ) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error for this field
        setErrors(prev => ({ ...prev, [field]: undefined }));
    }, []);

    // Toggle page selection
    const togglePage = useCallback((pageId: string) => {
        setFormData(prev => ({
            ...prev,
            selectedPages: prev.selectedPages.includes(pageId)
                ? prev.selectedPages.filter(id => id !== pageId)
                : [...prev.selectedPages, pageId],
        }));
        setErrors(prev => ({ ...prev, selectedPages: undefined }));
    }, []);

    // Validate form
    const validate = useCallback((): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.youtubeUrl.trim()) {
            newErrors.youtubeUrl = 'YouTube URL is required';
        } else if (!isValidYouTubeUrl(formData.youtubeUrl)) {
            newErrors.youtubeUrl = 'Please enter a valid YouTube URL';
        }

        if (formData.minDuration >= formData.maxDuration) {
            newErrors.duration = 'Min duration must be less than max duration';
        }

        if (formData.minDuration < DURATION_MIN || formData.maxDuration > DURATION_MAX) {
            newErrors.duration = `Duration must be between ${DURATION_MIN}s and ${DURATION_MAX}s`;
        }

        if (formData.clipCount < CLIP_COUNT_MIN || formData.clipCount > CLIP_COUNT_MAX) {
            newErrors.clipCount = `Clip count must be between ${CLIP_COUNT_MIN} and ${CLIP_COUNT_MAX}`;
        }

        if (formData.selectedPages.length === 0) {
            newErrors.selectedPages = 'Please select at least one template';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData]);

    const { pages } = usePages();

    // Submit job
    const submit = useCallback(async () => {
        if (!validate()) return;

        setState({ isSubmitting: true, isSuccess: false, error: null, jobId: null });

        try {
            // 1. Map Page IDs to Names (Strict Contract)
            const selectedPageNames = formData.selectedPages.map(id => {
                const page = pages.find(p => p.id === id);
                if (!page) throw new Error(`Invalid template ID: ${id}`);
                return page.name;
            });

            // 2. Clamp and Round Duration (Data Correctness)
            // Convert to minutes, clamp to [0.5, 10], round to 1 decimal
            const minMinutes = Math.min(Math.max(formData.minDuration / 60, 0.5), 10);
            const maxMinutes = Math.min(Math.max(formData.maxDuration / 60, 0.5), 10);

            // Ensure min <= max after clamping
            const finalMin = Number(Math.min(minMinutes, maxMinutes).toFixed(1));
            const finalMax = Number(Math.max(minMinutes, maxMinutes).toFixed(1));

            // 3. Map Copy Mode & Language (API Alignment)
            // API expects copy_mode to be 'en' or 'hi' (language code)
            // UI copyMode ('ai'/'ocr') goes to extra_config
            const apiCopyMode = formData.language === 'auto' ? 'en' : formData.language;

            const response = await authFetch(endpoints.jobs.create, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: formData.youtubeUrl,
                    min_duration: finalMin,
                    max_duration: finalMax,
                    count: formData.clipCount,
                    pages: selectedPageNames,
                    copy_mode: apiCopyMode,
                    language: null, // As per docs
                    extra_config: {
                        mode: formData.copyMode, // 'ai' | 'ocr' | 'manual'
                        ui_language_selection: formData.language // Preserve original selection
                    }
                }),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: 'Submission failed' }));
                throw new Error(error.detail || 'Failed to create job');
            }

            const data = await response.json();
            setState({ isSubmitting: false, isSuccess: true, error: null, jobId: data.id });

            // Redirect to job page
            router.push(`/dashboard/jobs/${data.id}`);
        } catch (err) {
            setState({
                isSubmitting: false,
                isSuccess: false,
                error: err instanceof Error ? err.message : 'An error occurred',
                jobId: null,
            });
        }
    }, [formData, validate, router, pages]);

    // Reset form
    const reset = useCallback(() => {
        setFormData(defaultFormData);
        setErrors({});
        setState({ isSubmitting: false, isSuccess: false, error: null, jobId: null });
    }, []);

    return {
        formData,
        errors,
        state,
        updateField,
        togglePage,
        validate,
        submit,
        reset,
    };
}
