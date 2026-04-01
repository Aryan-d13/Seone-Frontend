import type { RenderManifest } from '../types/manifest';
import type { TemplateJSON } from '../types/template';
import { getMediaUrl } from '@/lib/config';
import { exportTemplate } from './exportTemplate';

interface BuildStudioManifestArgs {
  template: TemplateJSON;
  previewTexts: Record<string, string>;
  activeManifest: RenderManifest | null;
  draftGeometryZoneIds?: ReadonlySet<string>;
}

function readOptionalAssetRef(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
    return undefined;
  }
  return normalized;
}

function isPersistableAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized || normalized.startsWith('blob:')) return false;
  if (/^[A-Za-z]:[\\/]/.test(normalized)) return false;
  if (/^\/(mnt|Users|home|tmp|var|private|opt|usr|etc|Volumes)\//.test(normalized))
    return false;
  if (normalized.startsWith('/api/') || normalized.startsWith('/data/')) return true;
  if (normalized.startsWith('api/') || normalized.startsWith('data/')) return true;
  if (normalized.startsWith('//')) return true;
  if (/^https?:\/\//i.test(normalized)) return true;
  return false;
}

function resolveCanonicalAssetUrl(
  asset: { source_uri?: string; gcs_path?: string; path?: string } | undefined,
  existingUrl?: string
): string | undefined {
  if (asset) {
    for (const candidate of [asset.source_uri, asset.gcs_path, asset.path]) {
      if (isPersistableAssetUrl(candidate)) {
        return getMediaUrl(candidate);
      }
    }
  }

  if (isPersistableAssetUrl(existingUrl)) {
    return getMediaUrl(existingUrl);
  }

  return undefined;
}

function isUsableTemplateAssetRef(value: unknown): value is string {
  const normalized = readOptionalAssetRef(value);
  if (!normalized) return false;
  if (normalized.startsWith('blob:') || normalized.startsWith('data:')) return false;
  if (/^[A-Za-z]:[\\/]/.test(normalized)) return false;
  if (/^\/(mnt|Users|home|tmp|var|private|opt|usr|etc|Volumes)\//.test(normalized))
    return false;
  return true;
}

function hasUsableTemplateAssetRef(asset: {
  source_uri?: string;
  gcs_path?: string;
  path?: string;
}): boolean {
  return [asset.source_uri, asset.gcs_path, asset.path].some(isUsableTemplateAssetRef);
}

function resolveBaselineBounds(
  templateZone: TemplateJSON['zones'][number],
  activeManifest: RenderManifest
) {
  const resolvedZonesById = new Map(
    activeManifest.resolved_zones.map(zone => [zone.id, zone])
  );
  const companionTextZoneId =
    templateZone.role === 'text_background' && templateZone.id.endsWith('__bg')
      ? templateZone.id.slice(0, -4)
      : null;
  const resolvedZone =
    resolvedZonesById.get(templateZone.id) ||
    (companionTextZoneId ? resolvedZonesById.get(companionTextZoneId) : undefined);
  const rect = resolvedZone?.rect;
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
  };
}

export function buildStudioManifest({
  template,
  previewTexts,
  activeManifest,
  draftGeometryZoneIds = new Set<string>(),
}: BuildStudioManifestArgs): RenderManifest | null {
  if (!activeManifest) return null;

  const templateJson = JSON.parse(exportTemplate(template)) as TemplateJSON;
  const nextAssets = { ...(activeManifest.assets || {}) };

  for (const [assetKey, asset] of Object.entries(templateJson.assets || {})) {
    const gcsPath = readOptionalAssetRef(asset.gcs_path);
    const sourceUri = readOptionalAssetRef(asset.source_uri);
    const path = readOptionalAssetRef(asset.path);
    templateJson.assets[assetKey] = {
      ...asset,
      ...(path ? { path } : {}),
      ...(sourceUri ? { source_uri: sourceUri } : {}),
      ...(gcsPath ? { gcs_path: gcsPath } : {}),
    };
  }

  for (const [assetKey, asset] of Object.entries(templateJson.assets || {})) {
    const canonicalUrl = resolveCanonicalAssetUrl(asset, nextAssets[assetKey]);
    if (canonicalUrl) {
      nextAssets[assetKey] = canonicalUrl;
      if (!hasUsableTemplateAssetRef(asset)) {
        templateJson.assets[assetKey] = {
          ...asset,
          source_uri: canonicalUrl,
        };
      }
    } else {
      delete nextAssets[assetKey];
    }
  }

  for (const zone of templateJson.zones) {
    if (draftGeometryZoneIds.has(zone.id)) continue;
    const baselineBounds = resolveBaselineBounds(zone, activeManifest);
    if (!baselineBounds) continue;
    zone.bounds = baselineBounds;
  }

  return {
    ...activeManifest,
    template_ir: templateJson,
    render_payload: {
      ...activeManifest.render_payload,
      template_ref: templateJson.id,
      inputs: {
        ...(activeManifest.render_payload?.inputs || {}),
        ...previewTexts,
      },
    },
    canvas: {
      w: templateJson.canvas.width,
      h: templateJson.canvas.height,
    },
    compositing_mode: templateJson.compositing_mode,
    assets: nextAssets,
  };
}
