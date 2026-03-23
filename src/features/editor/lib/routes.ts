export function buildStudioHref(): string {
  return '/studio';
}

export function buildClipStudioHref(jobId: string, clipIndex: number | string): string {
  return `/studio/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(String(clipIndex))}`;
}

export function openClipStudioTab(jobId: string, clipIndex: number | string): void {
  const href = buildClipStudioHref(jobId, clipIndex);
  if (typeof window === 'undefined') return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

export interface StudioDragPayload {
  jobId: string;
  clipIndex: number;
  url: string;
  filename: string;
}
