import { getBlob, getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/config/firebase';
import type { AssetDef } from '../types/template';
import { ensureFirebaseStudioAuth } from './firebaseStudioAuth';

function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
        return undefined;
    }
    return normalized;
}

function getTemplateSlug(templateId: string | null | undefined): string | undefined {
    const normalized = readOptionalString(templateId);
    if (!normalized) return undefined;

    const slashMatch = normalized.match(/^([a-z0-9_-]+)\/v\d+$/i);
    if (slashMatch?.[1]) {
        return slashMatch[1].trim();
    }

    const underscoredMatch = normalized.match(/^([a-z0-9_-]+)_v\d+$/i);
    if (underscoredMatch?.[1]) {
        return underscoredMatch[1].trim();
    }

    return undefined;
}

function isLikelyBrowserUrl(value: string): boolean {
    return /^https?:\/\//i.test(value) || value.startsWith('//');
}

function isLikelyAbsoluteFilePath(value: string): boolean {
    if (/^[A-Za-z]:[\\/]/.test(value)) return true;
    return value.startsWith('/mnt/') || value.startsWith('/Users/') || value.startsWith('/home/');
}

function getCanonicalAssetRefCandidates(
    asset: AssetDef | null | undefined,
    assetKey: string,
    templateId?: string | null,
): string[] {
    const candidates: string[] = [];

    const sourceUri = readOptionalString(asset?.source_uri);
    if (
        sourceUri &&
        !isLikelyBrowserUrl(sourceUri) &&
        !sourceUri.startsWith('/api/') &&
        !sourceUri.startsWith('/data/') &&
        !isLikelyAbsoluteFilePath(sourceUri) &&
        !candidates.includes(sourceUri)
    ) {
        candidates.push(sourceUri);
    }

    const explicitGcsPath = readOptionalString(asset?.gcs_path);
    if (explicitGcsPath && !candidates.includes(explicitGcsPath)) {
        candidates.push(explicitGcsPath);
    }

    const derivedPath = getCanonicalAssetGcsPath(asset, assetKey, templateId);
    if (derivedPath && !candidates.includes(derivedPath)) {
        candidates.push(derivedPath);
    }

    return candidates;
}

export function getCanonicalAssetGcsPath(
    asset: AssetDef | null | undefined,
    assetKey: string,
    templateId?: string | null,
): string | undefined {
    const explicitPath = readOptionalString(asset?.gcs_path);
    if (explicitPath) return explicitPath;

    if (assetKey !== 'logo_mark') return undefined;

    const slug = getTemplateSlug(templateId);
    if (!slug) return undefined;
    return `templates/${slug}/assets/logo.png`;
}

export async function resolveFirebaseAssetUrl(
    asset: AssetDef | null | undefined,
    assetKey: string,
    templateId?: string | null,
): Promise<string | null> {
    const gcsPath = getCanonicalAssetGcsPath(asset, assetKey, templateId);
    if (!gcsPath) return null;

    try {
        return await getDownloadURL(ref(storage, gcsPath));
    } catch {
        return null;
    }
}

export async function resolveFirebaseAssetBlobUrl(
    asset: AssetDef | null | undefined,
    assetKey: string,
    templateId?: string | null,
): Promise<string | null> {
    const candidates = getCanonicalAssetRefCandidates(asset, assetKey, templateId);
    if (!candidates.length) return null;

    try {
        await ensureFirebaseStudioAuth();
    } catch {
        // Best-effort auth only. Blob reads may still succeed if the asset is public.
    }

    for (const candidate of candidates) {
        try {
            const blob = await getBlob(ref(storage, candidate));
            if (!blob.size) continue;
            return URL.createObjectURL(blob);
        } catch {
            continue;
        }
    }

    return null;
}
