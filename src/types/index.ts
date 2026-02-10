// ============================================
// SEONE API TYPES
// Core type definitions for the application
// ============================================

// ---------- Auth Types ----------
export interface User {
    id: string;
    email: string;
    name: string;
    picture?: string;
    domain?: string;
    createdAt?: string;
    role?: 'user' | 'admin';
}

export interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

export interface AuthResponse {
    accessToken: string;
    user: User;
    expiresIn: number;
}

// ---------- Job Types ----------
export type JobStatus =
    | 'queued'
    | 'downloading'
    | 'transcribing'
    | 'analyzing'
    | 'rendering'
    | 'completed'
    | 'failed';

export type JobPhase =
    | 'queued'
    | 'downloading'
    | 'forked'
    | 'rendering'
    | 'completed'
    | 'failed';

export interface Job {
    id: string;
    status: JobStatus;
    phase?: JobPhase;
    fork_join?: {
        fork_entered_at: string | null;
        join_satisfied_at: string | null;
        is_forked: boolean;
        join_satisfied: boolean;
    };
    steps?: Record<string, { status: 'pending' | 'running' | 'completed' | 'failed' } | null>;
    progress: number;
    current_step?: string;
    clip_count: number;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    error_message?: string;
    output?: {
        clips: Clip[];
    };
    ws_url?: string;
}

/**
 * Render options for controlling output quality/format.
 * Optional field in job creation payload.
 */
export interface RenderOptions {
    quality?: 'low' | 'medium' | 'high';
    format?: 'mp4' | 'webm';
    resolution?: string; // e.g. "1080p", "720p"
    [key: string]: unknown;
}

export interface JobCreateRequest {
    url: string;
    min_duration: number; // Minutes
    max_duration: number; // Minutes
    count: number;
    template_ref: string; // e.g. "chaturnath/v1"
    render_options?: RenderOptions;
    copy_mode: string;
    language: string | null;
    extra_config?: Record<string, unknown> | null;
}

export interface JobCreateResponse {
    id: string;
    status: JobStatus;
    ws_url: string;
    message: string;
}

// ---------- Template Types ----------
/**
 * Template type from GET /api/v1/pages (renderer v1).
 * template_ref is the canonical identifier for job submission.
 */
export interface Template {
    template_ref: string; // Canonical ID, e.g. "chaturnath/v1"
    name: string;         // Display name
    aspect_ratio?: string; // e.g. "9:16", "1:1"
    description?: string;
    previewUrl?: string;
    thumbnailUrl?: string;
    category?: string;
}

/**
 * @deprecated Use Template instead. Kept for backwards compatibility.
 */
export interface Page {
    id: string;
    name: string;
    description?: string;
    previewUrl: string;
    category?: string;
    isActive: boolean;
}

// ---------- Clip Types ----------
export interface Clip {
    index: number;
    url: string;
    filename: string;
    // Optional fields that might come from full job details later
    id?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    thumbnailPath?: string;
}

// ---------- WebSocket Event Types ----------
export type WebSocketEventType =
    | 'connected'
    | 'step_started'
    | 'step_completed'
    | 'clip_ready'
    | 'job_completed'
    | 'job_failed';

export interface WebSocketEvent {
    event_type: WebSocketEventType;
    job_id: string;
    timestamp: string;
    message?: string;
    payload?: any;
}

export interface StepStartedEvent extends WebSocketEvent {
    event_type: 'step_started';
    step: string; // 'download', 'transcribe', 'analyze', 'smart_render'
}

export interface ClipReadyEvent extends WebSocketEvent {
    event_type: 'clip_ready';
    payload: {
        clip_index: number;
        clip_url: string;
        clips_ready: number;
        clip_count: number;
    };
}

export interface JobCompletedEvent extends WebSocketEvent {
    event_type: 'job_completed';
    progress: number;
    payload: {
        output: {
            clips: Clip[];
        };
    };
}

export interface JobFailedEvent extends WebSocketEvent {
    event_type: 'job_failed';
    payload: {
        error: string;
    };
}

// ---------- API Response Types ----------
export interface ApiResponse<T> {
    data: T;
    message?: string;
    success: boolean;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

export interface ApiError {
    message: string;
    code: string;
    detail?: string; // FastAPI validation error
    details?: Record<string, unknown>;
}
