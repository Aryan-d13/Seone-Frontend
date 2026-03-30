'use client';

import type {
  Clip,
  Job,
  JobLike,
  JobStatus,
  JobUIState,
  JobActiveStep,
  JobPhase,
} from '@/types';

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Reserving compute',
  downloading: 'Pulling source video',
  transcribing: 'Listening to speech and timing',
  analyzing: 'Finding the strongest moments',
  rendering: 'Building your clips',
  completed: 'Your clips are ready',
  failed: 'This run needs attention',
};

function isJobStatus(value: unknown): value is JobStatus {
  return (
    value === 'queued' ||
    value === 'downloading' ||
    value === 'transcribing' ||
    value === 'analyzing' ||
    value === 'rendering' ||
    value === 'completed' ||
    value === 'failed'
  );
}

function normalizeClipCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value)) && Number(value) > 0) {
    return Number(value);
  }
  return 1;
}

function normalizeProgress(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  if (typeof value === 'string' && Number.isFinite(Number(value))) {
    return Math.max(0, Math.min(100, Math.round(Number(value))));
  }
  return fallback;
}

function inferStatusFromLegacy(raw: JobLike): JobStatus {
  if (raw.status === 'completed' || raw.status === 'failed') return raw.status;
  if (isJobStatus(raw.status)) return raw.status;

  const currentStep = raw.current_step;
  const phase = raw.phase;
  if (currentStep === 'smart_render' || phase === 'rendering') return 'rendering';
  if (currentStep === 'analyze') return 'analyzing';
  if (currentStep === 'transcribe') return 'transcribing';
  if (currentStep === 'download' || currentStep === 'download_video' || phase === 'downloading') {
    return 'downloading';
  }
  if (phase === 'completed') return 'completed';
  if (phase === 'failed') return 'failed';
  return raw.status === 'pending' ? 'queued' : 'downloading';
}

function inferActiveStep(status: JobStatus): JobActiveStep {
  switch (status) {
    case 'queued':
    case 'downloading':
      return 'download';
    case 'transcribing':
      return 'transcribe';
    case 'analyzing':
      return 'analyze';
    case 'rendering':
      return 'smart_render';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
  }
}

function normalizeUiState(raw: JobLike, status: JobStatus, progress: number): JobUIState {
  const incoming = raw.ui_state;
  const incomingStatus = isJobStatus(incoming?.status) ? incoming.status : undefined;
  const canReuseIncoming = incomingStatus === status;
  return {
    status,
    label:
      canReuseIncoming &&
      typeof incoming?.label === 'string' &&
      incoming.label.trim()
        ? incoming.label.trim()
        : STATUS_LABELS[status],
    sublabel:
      canReuseIncoming &&
      typeof incoming?.sublabel === 'string' &&
      incoming.sublabel.trim()
        ? incoming.sublabel.trim()
        : undefined,
    progress: canReuseIncoming
      ? normalizeProgress(incoming?.progress, progress)
      : progress,
    active_step: canReuseIncoming && incoming?.active_step
      ? incoming.active_step
      : inferActiveStep(status),
    parallel_hint:
      canReuseIncoming &&
      typeof incoming?.parallel_hint === 'string' &&
      incoming.parallel_hint.trim()
        ? incoming.parallel_hint.trim()
        : undefined,
  };
}

function normalizePhase(value: unknown): JobPhase | undefined {
  if (
    value === 'queued' ||
    value === 'downloading' ||
    value === 'forked' ||
    value === 'rendering' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }
  return undefined;
}

function normalizeClips(clips: unknown): Clip[] {
  if (!Array.isArray(clips)) return [];
  return clips
    .filter((clip): clip is Clip => Boolean(clip && typeof clip === 'object'))
    .map(clip => ({
      index:
        typeof clip.index === 'number' && Number.isFinite(clip.index) ? clip.index : 0,
      url: typeof clip.url === 'string' ? clip.url : '',
      filename:
        typeof clip.filename === 'string' && clip.filename.trim()
          ? clip.filename
          : `clip_${typeof clip.index === 'number' ? clip.index : 0}.mp4`,
      id: typeof clip.id === 'string' ? clip.id : undefined,
      startTime:
        typeof clip.startTime === 'number' && Number.isFinite(clip.startTime)
          ? clip.startTime
          : undefined,
      endTime:
        typeof clip.endTime === 'number' && Number.isFinite(clip.endTime) ? clip.endTime : undefined,
      duration:
        typeof clip.duration === 'number' && Number.isFinite(clip.duration) ? clip.duration : undefined,
      thumbnailPath:
        typeof clip.thumbnailPath === 'string' ? clip.thumbnailPath : undefined,
    }));
}

export function buildOptimisticUiState(
  status: JobStatus,
  overrides: Partial<JobUIState> = {}
): JobUIState {
  return {
    status,
    label: STATUS_LABELS[status],
    sublabel: undefined,
    progress: overrides.progress ?? (status === 'rendering' ? 70 : status === 'analyzing' ? 62 : status === 'transcribing' ? 35 : status === 'downloading' ? 12 : status === 'completed' ? 100 : 3),
    active_step: overrides.active_step ?? inferActiveStep(status),
    parallel_hint: overrides.parallel_hint,
  };
}

export function normalizeJob(raw: JobLike): Job {
  const explicitStatus = isJobStatus(raw.status) ? raw.status : undefined;
  const incomingUiStatus =
    raw.ui_state?.status && isJobStatus(raw.ui_state.status) ? raw.ui_state.status : undefined;
  const status = explicitStatus ?? incomingUiStatus ?? inferStatusFromLegacy(raw);
  const progress =
    incomingUiStatus === status
      ? normalizeProgress(
          raw.ui_state?.progress,
          normalizeProgress(raw.progress, status === 'completed' ? 100 : 0)
        )
      : normalizeProgress(raw.progress, status === 'completed' ? 100 : 0);
  const uiState = normalizeUiState(raw, status, progress);

  return {
    ...raw,
    status,
    ui_state: uiState,
    phase: normalizePhase(raw.phase),
    progress: uiState.progress,
    clip_count: normalizeClipCount(raw.clip_count),
    output: raw.output
      ? {
          clips: normalizeClips(raw.output.clips),
        }
      : raw.output,
  };
}
