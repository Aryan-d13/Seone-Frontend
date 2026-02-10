// ============================================
// JOB TYPES
// Extended types for job creation and management
// ============================================

export interface SubmissionFormData {
    youtubeUrl: string;
    minDuration: number;
    maxDuration: number;
    clipCount: number;
    language: 'hi' | 'en' | 'auto';
    copyMode: 'ai' | 'ocr' | 'manual';
    selectedTemplate: string | null; // template_ref, single selection
}

/**
 * Template type for job creation UI.
 * template_ref is the value to submit in JobCreateRequest.
 */
export interface Template {
    template_ref: string; // Canonical ID, e.g. "chaturnath/v1"
    name: string;
    slug: string;
    aspect_ratio?: string;
    description?: string;
    thumbnailUrl?: string;
    category?: string;
}

/**
 * @deprecated Use Template instead
 */
export interface Page {
    id: string;
    name: string;
    slug: string;
    description?: string;
    thumbnailUrl?: string;
    category?: string;
}

export interface FormErrors {
    youtubeUrl?: string;
    duration?: string;
    clipCount?: string;
    selectedTemplate?: string;
    general?: string;
}

export interface SubmissionState {
    isSubmitting: boolean;
    isSuccess: boolean;
    error: string | null;
    jobId: string | null;
}

// Default form values
export const defaultFormData: SubmissionFormData = {
    youtubeUrl: '',
    minDuration: 60,
    maxDuration: 300,
    clipCount: 3,
    language: 'hi',
    copyMode: 'ai',
    selectedTemplate: null,
};

// Duration constraints
export const DURATION_MIN = 30;
export const DURATION_MAX = 600;
export const CLIP_COUNT_MIN = 1;
export const CLIP_COUNT_MAX = 10;
