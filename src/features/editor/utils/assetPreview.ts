import { getMediaUrl } from '@/lib/config';
import type { AssetDef } from '../types/template';

function isLikelyLocalFilesystemPath(value: string): boolean {
    if (/^[A-Za-z]:[\\/]/.test(value)) return true;
    return /^\/(mnt|Users|home|tmp|var|private|opt|usr|etc|Volumes)\//.test(value);
}

function isBrowserLoadableCandidate(value: string): boolean {
    if (!value || isLikelyLocalFilesystemPath(value)) return false;
    if (/^https?:\/\//i.test(value) || value.startsWith('//')) return true;
    if (value.startsWith('/data/')) return true;
    if (value.startsWith('data/')) return true;
    return false;
}

export function isProtectedAssetUrl(value: string | null | undefined): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim();
    if (!normalized) return false;
    if (normalized.startsWith('/api/') || normalized.startsWith('api/')) return true;
    return /^https?:\/\/[^/]+\/api\//i.test(normalized);
}

export function getAssetPreviewUrl(
    asset: AssetDef | null | undefined,
    manifestAssetUrl?: string | null,
): string | null {
    const manifestUrl = typeof manifestAssetUrl === 'string' ? manifestAssetUrl.trim() : '';
    if (manifestUrl && !isProtectedAssetUrl(manifestUrl)) return getMediaUrl(manifestUrl);

    if (!asset) return null;

    const candidates = [
        typeof asset.source_uri === 'string' ? asset.source_uri.trim() : '',
        typeof asset.path === 'string' ? asset.path.trim() : '',
    ];

    for (const candidate of candidates) {
        if (isBrowserLoadableCandidate(candidate)) {
            return getMediaUrl(candidate);
        }
    }

    return null;
}
