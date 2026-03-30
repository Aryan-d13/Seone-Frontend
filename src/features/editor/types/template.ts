/**
 * TypeScript types that exactly mirror the rendering_v1 TemplateIR schema.
 *
 * Source of truth: src/rendering_v1/ir/template_ir.py
 * Parser: src/rendering_v1/parse/template_loader.py
 *
 * IMPORTANT: Do NOT add fields not consumed by load_template_ir().
 * UI-only state lives in the Zustand store, not in these types.
 */

/* ── Canvas ────────────────────────────────────── */

export interface CanvasSpec {
    width: number;
    height: number;
    unit: string;        // always "px"
    color_space: string; // always "sRGB"
}

/* ── Bounds ────────────────────────────────────── */

/** Values can be integers (px) or percentage strings (e.g. "50%"). */
export type LengthSpec = number | string;

export interface BoundsSpec {
    x: LengthSpec;
    y: LengthSpec;
    width: LengthSpec;
    /** Optional — renderer auto-calculates from image aspect ratio when omitted. */
    height?: LengthSpec;
}

/* ── Text ──────────────────────────────────────── */

export interface TextFontSpec {
    family: string;
    weight: number;
    fallbacks: string[];
    size: number | null;
}

export interface TextSpec {
    max_lines: number;
    overflow: 'wrap' | 'shrink';
    font: TextFontSpec;
    width_percent: number | null;
    min_font_size: number | null;
    horizontal_align: 'left' | 'center' | 'right';
    vertical_align: 'top' | 'middle' | 'bottom';
    line_spacing_px: number;
}

/* ── Media ─────────────────────────────────────── */

export interface MediaSpec {
    fit: 'cover' | 'contain';
    crop_anchor: 'center' | 'top' | 'bottom';
    crop_focus?: {
        x: number;
        y: number;
    };
}

export interface ShapeSpec {
    kind?: 'rect';
}

/* ── Assets & Styles ───────────────────────────── */

export interface AssetDef {
    type: string;
    path: string;
    /** Canonical exact asset location for new writes. */
    source_uri?: string;
    /** Legacy compatibility field for older Firebase/GCS-backed templates. */
    gcs_path?: string;
    family?: string;
    weight?: number;
    style?: 'normal' | 'italic' | string;
    format?: 'ttf' | 'otf' | string;
}

/**
 * Style definitions — generic string-keyed dict matching Python renderer.
 * Common keys: fill, bg_fill.
 */
export type StyleDef = Record<string, string>;

/* ── Zones ─────────────────────────────────────── */

export type ZoneType = 'text' | 'image' | 'video' | 'shape';

export interface ZoneSpec {
    id: string;
    type: ZoneType;
    bounds: BoundsSpec;
    z: number;
    content_ref?: string;
    text?: TextSpec;
    media?: MediaSpec;
    asset_ref?: string;
    style_ref?: string;
    shape?: ShapeSpec;
    /** Role hint used by image zones (e.g. "logo"). */
    role?: string;
}

/* ── Template (top-level) ──────────────────────── */

export interface TemplateJSON {
    template_version: string;
    id: string;
    canvas: CanvasSpec;
    zones: ZoneSpec[];
    styles: Record<string, StyleDef>;
    assets: Record<string, AssetDef>;
    /** Controls text compositing: "stack" = vstack, "overlay" = alpha overlay. */
    compositing_mode: 'stack' | 'overlay';
    slot_contract?: {
        version: string;
        text_slots: string[];
        image_slots: string[];
        video_slots: string[];
    };
    compatibility_key?: string;
}
