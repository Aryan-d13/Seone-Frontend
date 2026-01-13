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
    selectedPages: string[];
}

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
    selectedPages?: string;
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
    selectedPages: [],
};

// Duration constraints
export const DURATION_MIN = 30;
export const DURATION_MAX = 600;
export const CLIP_COUNT_MIN = 1;
export const CLIP_COUNT_MAX = 10;
