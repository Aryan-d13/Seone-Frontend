/**
 * Import and validate a rendering_v1 template JSON.
 *
 * Validates required fields, applies defaults for optional fields,
 * and returns a TemplateJSON ready for the editor store.
 */

import type { TemplateJSON, ZoneSpec, TextSpec, MediaSpec, TextFontSpec, StyleDef, AssetDef, ShapeSpec } from '../types/template';
import { hasForcedAutoHeight } from './zoneRules';

class ImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImportError';
    }
}

function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
        return undefined;
    }
    return normalized;
}

function validateFont(font: unknown): TextFontSpec {
    const f = (font || {}) as Record<string, unknown>;
    return {
        family: String(f.family ?? 'NotoSansDevanagari'),
        weight: Number(f.weight ?? 400),
        fallbacks: Array.isArray(f.fallbacks) ? f.fallbacks.map(String) : [],
        size: f.size != null ? Number(f.size) : null,
    };
}

function validateTextSpec(text: unknown): TextSpec {
    const t = (text || {}) as Record<string, unknown>;
    return {
        max_lines: Number(t.max_lines ?? 3),
        overflow: (t.overflow === 'shrink' ? 'shrink' : 'wrap'),
        font: validateFont(t.font),
        width_percent: t.width_percent != null ? Number(t.width_percent) : null,
        min_font_size: t.min_font_size != null ? Number(t.min_font_size) : null,
        horizontal_align: (['left', 'center', 'right'].includes(String(t.horizontal_align)) ? String(t.horizontal_align) : 'center') as TextSpec['horizontal_align'],
        vertical_align: (['top', 'middle', 'bottom'].includes(String(t.vertical_align)) ? String(t.vertical_align) : 'middle') as TextSpec['vertical_align'],
        line_spacing_px: Number(t.line_spacing_px ?? 0),
    };
}

function validateMediaSpec(media: unknown): MediaSpec {
    const m = (media || {}) as Record<string, unknown>;
    const cropFocus =
        m.crop_focus && typeof m.crop_focus === 'object'
            ? (m.crop_focus as Record<string, unknown>)
            : null;
    return {
        fit: (m.fit === 'contain' ? 'contain' : 'cover'),
        crop_anchor: (['center', 'top', 'bottom'].includes(String(m.crop_anchor)) ? String(m.crop_anchor) : 'center') as MediaSpec['crop_anchor'],
        ...(cropFocus
            ? {
                crop_focus: {
                    x:
                        typeof cropFocus.x === 'number' && Number.isFinite(cropFocus.x)
                            ? cropFocus.x
                            : 0.5,
                    y:
                        typeof cropFocus.y === 'number' && Number.isFinite(cropFocus.y)
                            ? cropFocus.y
                            : 0.5,
                },
            }
            : {}),
    };
}

function validateZone(raw: unknown, index: number): ZoneSpec {
    const z = raw as Record<string, unknown>;
    if (!z.id) throw new ImportError(`Zone at index ${index} missing "id"`);
    if (!z.type) throw new ImportError(`Zone "${z.id}" missing "type"`);
    if (!z.bounds) throw new ImportError(`Zone "${z.id}" missing "bounds"`);

    const bounds = z.bounds as Record<string, unknown>;

    const type = String(z.type) as ZoneSpec['type'];
    const role = z.role ? String(z.role) : undefined;
    const forceAutoHeight = hasForcedAutoHeight({ type, role });
    const zone: ZoneSpec = {
        id: String(z.id),
        type,
        bounds: {
            x: bounds.x as number,
            y: bounds.y as number,
            width: bounds.width as number,
            ...(!forceAutoHeight && bounds.height != null ? { height: bounds.height as number } : {}),
        },
        z: Number(z.z ?? 0),
    };

    const contentRef = readOptionalString(z.content_ref);
    if (contentRef) zone.content_ref = contentRef;
    if (z.text) zone.text = validateTextSpec(z.text);
    if (z.media) zone.media = validateMediaSpec(z.media);
    if (type === 'shape') {
        const shape = (z.shape || {}) as Record<string, unknown>;
        zone.shape = {
            kind: (shape.kind === 'rect' ? 'rect' : 'rect') as ShapeSpec['kind'],
        };
    }
    const assetRef = readOptionalString(z.asset_ref);
    if (assetRef) zone.asset_ref = assetRef;
    const styleRef = readOptionalString(z.style_ref);
    if (styleRef) zone.style_ref = styleRef;
    if (role) zone.role = role;

    return zone;
}

export function importTemplate(jsonString: string): TemplateJSON {
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(jsonString);
    } catch {
        throw new ImportError('Invalid JSON');
    }

    if (!data.canvas) throw new ImportError('Missing "canvas" field');
    if (!data.id) throw new ImportError('Missing "id" field');

    const canvas = data.canvas as Record<string, unknown>;
    if (!canvas.width || !canvas.height) {
        throw new ImportError('Canvas must have "width" and "height"');
    }

    const rawZones = Array.isArray(data.zones) ? data.zones : [];
    const zones = rawZones.map((z, i) => validateZone(z, i));

    // Validate styles — generic dict of string → string
    const styles: Record<string, StyleDef> = {};
    const rawStyles = (data.styles || {}) as Record<string, Record<string, string>>;
    for (const [key, value] of Object.entries(rawStyles)) {
        styles[key] = { ...value };
    }

    // Validate assets
    const assets: Record<string, AssetDef> = {};
    const rawAssets = (data.assets || {}) as Record<string, Record<string, string>>;
    for (const [key, value] of Object.entries(rawAssets)) {
        assets[key] = {
            type: value.type || 'image',
            path: value.path || '',
            ...(readOptionalString(value.source_uri) ? { source_uri: readOptionalString(value.source_uri) } : {}),
            ...(readOptionalString(value.gcs_path) ? { gcs_path: readOptionalString(value.gcs_path) } : {}),
        };
    }

    // Compositing mode — default to "overlay" if not specified
    const compositingRaw = String(data.compositing_mode ?? 'overlay');
    const compositing_mode = compositingRaw === 'stack' ? 'stack' : 'overlay';

    return {
        template_version: String(data.template_version ?? '1.0'),
        id: String(data.id),
        canvas: {
            width: Number(canvas.width),
            height: Number(canvas.height),
            unit: String(canvas.unit ?? 'px'),
            color_space: String(canvas.color_space ?? 'sRGB'),
        },
        compositing_mode,
        zones,
        styles,
        assets,
    };
}
