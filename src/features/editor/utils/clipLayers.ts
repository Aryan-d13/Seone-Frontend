import type { RenderManifest, ResolvedZone } from '../types/manifest';
import type { StyleDef, ZoneSpec } from '../types/template';

export interface ClipLayerDefinition {
  zone: ZoneSpec;
  resolvedZone?: ResolvedZone;
  time: {
    start: number;
    end: number;
  };
}

function resolveTextBackgroundFill(
  zone: ZoneSpec,
  resolvedZone: ResolvedZone | undefined,
  styles: Record<string, StyleDef>
): string | null {
  const resolvedFills = resolvedZone?.resolved?.fills as Record<string, unknown> | undefined;
  if (typeof resolvedFills?.bg === 'string' && resolvedFills.bg.trim()) {
    return resolvedFills.bg;
  }

  const style = zone.style_ref ? styles[zone.style_ref] : undefined;
  if (typeof style?.bg_fill === 'string' && style.bg_fill.trim()) {
    return style.bg_fill;
  }

  return null;
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
    const companionTextZoneId =
      zone.role === 'text_background' && zone.id.endsWith('__bg')
        ? zone.id.slice(0, -4)
        : null;
    const resolvedZone =
      resolvedZonesById.get(zone.id) ||
      (companionTextZoneId ? resolvedZonesById.get(companionTextZoneId) : undefined);
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

export function getClipStageLayerDefinitions(
  layers: ClipLayerDefinition[],
  styles: Record<string, StyleDef>
): ClipLayerDefinition[] {
  const explicitBackgroundIds = new Set(
    layers
      .filter(
        layer =>
          layer.zone.type === 'shape' &&
          layer.zone.role === 'text_background' &&
          layer.zone.id.endsWith('__bg')
      )
      .map(layer => layer.zone.id)
  );

  return layers.flatMap(layer => {
    const { zone, resolvedZone } = layer;
    if (zone.type !== 'text') {
      return [layer];
    }

    const backgroundZoneId = `${zone.id}__bg`;
    if (explicitBackgroundIds.has(backgroundZoneId)) {
      return [layer];
    }

    const backgroundFill = resolveTextBackgroundFill(zone, resolvedZone, styles);
    if (!backgroundFill) {
      return [layer];
    }

    const derivedBackgroundZone: ZoneSpec = {
      id: backgroundZoneId,
      type: 'shape',
      bounds: { ...zone.bounds },
      z: zone.z - 1,
      role: 'text_background',
      shape: { kind: 'rect' },
      style_ref: zone.style_ref,
    };

    return [
      {
        ...layer,
        zone: derivedBackgroundZone,
      },
      layer,
    ];
  });
}
