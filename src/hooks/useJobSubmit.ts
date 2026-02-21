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
  const updateField = useCallback(
    <K extends keyof SubmissionFormData>(field: K, value: SubmissionFormData[K]) => {
      setFormData(prev => ({ ...prev, [field]: value }));
      // Clear error for this field — delete the key entirely
      // so Object.keys(errors).length reflects actual errors
      const errorKey = field as string as keyof FormErrors;
      setErrors(prev => {
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    },
    []
  );

  /**
   * Select a template (single selection).
   * If the same template is clicked again, it gets deselected.
   */
  const selectTemplate = useCallback((templateRef: string) => {
    setFormData(prev => ({
      ...prev,
      selectedTemplate: prev.selectedTemplate === templateRef ? null : templateRef,
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.selectedTemplate;
      return next;
    });
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

    if (!formData.copyLanguage) {
      newErrors.copyLanguage = 'Please select copy language';
    }

    if (!formData.selectedTemplate) {
      newErrors.selectedTemplate = 'Please select a template';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Submit job
  const submit = useCallback(async () => {
    if (!validate()) return;

    if (!formData.copyLanguage) {
      setState({
        isSubmitting: false,
        isSuccess: false,
        error: 'Copy language is required',
        jobId: null,
      });
      return;
    }

    setState({ isSubmitting: true, isSuccess: false, error: null, jobId: null });

    try {
      // Clamp and Round Duration (Data Correctness)
      // Convert to minutes, clamp to [0.5, 10], round to 1 decimal
      const minMinutes = Math.min(Math.max(formData.minDuration / 60, 0.5), 10);
      const maxMinutes = Math.min(Math.max(formData.maxDuration / 60, 0.5), 10);

      // Ensure min <= max after clamping
      const finalMin = Number(Math.min(minMinutes, maxMinutes).toFixed(1));
      const finalMax = Number(Math.max(minMinutes, maxMinutes).toFixed(1));

      // Strict Payload Mapping
      // 1. language_mode maps directly from UI language selection
      const languageMode = formData.language;

      // 2. copy_language comes from explicit UI selection
      const copyLanguage = formData.copyLanguage;

      const payload = {
        url: formData.youtubeUrl,
        min_duration: finalMin,
        max_duration: finalMax,
        count: formData.clipCount,
        template_ref: formData.selectedTemplate,
        language_mode: languageMode,
        copy_language: copyLanguage,
        // Forbidden fields (copy_mode, extra_config) are strictly OMITTED
      };

      const response = await authFetch(endpoints.jobs.create, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ detail: 'Submission failed' }));
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
  }, [formData, validate, router]);

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
    selectTemplate,
    validate,
    submit,
    reset,
  };
}
