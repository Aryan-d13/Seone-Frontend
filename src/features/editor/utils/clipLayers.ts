import type { RenderManifest, ResolvedZone } from '../types/manifest';
import type { ZoneSpec } from '../types/template';

export interface ClipLayerDefinition {
  zone: ZoneSpec;
  resolvedZone?: ResolvedZone;
  time: {
    start: number;
    end: number;
  };
}

function coerceNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function getManifestClipDuration(
  manifest: RenderManifest | null | undefined,
  fallbackDuration = 0
): number {
  const rawWindow = manifest?.render_payload?.time_window;
  const start = coerceNonNegativeNumber(rawWindow?.start, 0);
  const end = coerceNonNegativeNumber(rawWindow?.end, fallbackDuration);
  return end > start ? end - start : Math.max(fallbackDuration, 0);
}

export function getClipLayerDefinitions(
  zones: ZoneSpec[],
  manifest: RenderManifest | null | undefined,
  fallbackDuration = 0
): ClipLayerDefinition[] {
  const defaultEnd = Math.max(getManifestClipDuration(manifest, fallbackDuration), 0.1);
  const resolvedZonesById = new Map(
    (manifest?.resolved_zones ?? []).map(zone => [zone.id, zone])
  );

  return zones.map(zone => {
    const resolvedZone = resolvedZonesById.get(zone.id);
    const start = coerceNonNegativeNumber(resolvedZone?.time?.start, 0);
    const end = coerceNonNegativeNumber(resolvedZone?.time?.end, defaultEnd);

    return {
      zone,
      resolvedZone,
      time: {
        start,
        end: end > start ? end : Math.max(start + 0.1, defaultEnd),
      },
    };
  });
}
