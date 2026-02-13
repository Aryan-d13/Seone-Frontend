// ============================================
// ADMIN PANEL TYPES
// Seed-only template schema + defaults
// ============================================

// ---------- Shared Primitives ----------

export interface TemplateBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TemplateCanvas {
    width: number;
    height: number;
    color_space: 'sRGB';
    unit: 'px';
}

// ---------- Zone Types ----------

export interface TextFontConfig {
    family: 'NotoSansDevanagari' | 'NotoSans';
    fallbacks?: string[];
    weight: number;
    size: number;
}

export interface TextZoneConfig {
    horizontal_align?: 'left' | 'center' | 'right';
    vertical_align?: 'top' | 'middle' | 'bottom';
    line_spacing_px?: number;
    max_lines: number;
    overflow: 'shrink' | 'clip';
    font: TextFontConfig;
    width_percent: number;
    min_font_size: number;
}

export interface MediaZoneConfig {
    fit: 'cover' | 'contain' | 'fill';
    crop_anchor: 'center' | 'top' | 'bottom';
}

export interface BaseZone {
    id: string;
    bounds: TemplateBounds;
    z: number;
}

export interface TextZone extends BaseZone {
    type: 'text';
    content_ref: string;
    text: TextZoneConfig;
    style_ref: string;
}

export interface VideoZone extends BaseZone {
    type: 'video';
    media: MediaZoneConfig;
}

export interface ImageZone extends BaseZone {
    type: 'image';
    asset_ref: string;
}

export type TemplateZone = TextZone | VideoZone | ImageZone;

// ---------- Styles ----------

export interface TemplateStyles {
    title_style: {
        bg_fill: string;
        fill: string;
    };
}

// ---------- Asset ----------

export interface TemplateAsset {
    type: 'image';
    gcs_path: string;
    path: string;
    download_url?: string;
}

// ---------- Template Document ----------

export interface FirestoreTemplate {
    id: string;
    template_version: string;
    name: string;
    canvas: TemplateCanvas;
    zones: TemplateZone[];
    styles: TemplateStyles;
    assets?: Record<string, TemplateAsset>;
}

// ---------- Form State ----------

export interface TemplateFormData {
    slug: string;
    canvas: TemplateCanvas;
    styles: TemplateStyles;
    logoFile: File | null;
    logoPreview: string | null;
}

// ---------- Defaults ----------

export const DEFAULT_CANVAS: TemplateCanvas = {
    width: 1080,
    height: 1080,
    color_space: 'sRGB',
    unit: 'px',
};

export const DEFAULT_STYLES: TemplateStyles = {
    title_style: {
        bg_fill: '#FFFFFF',
        fill: '#000000',
    },
};

const LOGO_WIDTH_RATIO = 132 / 1080;
const LOGO_HEIGHT_RATIO = 52 / 1080;
const LOGO_TOP_RATIO = 24 / 1080;
const LOGO_RIGHT_RATIO = 24 / 1080;
const TITLE_BAND_RATIO = 0.25;

export function buildDefaultZones(canvas: TemplateCanvas): TemplateZone[] {
    const titleBandHeight = Math.round(canvas.height * TITLE_BAND_RATIO);
    const videoHeight = Math.max(0, canvas.height - titleBandHeight);

    const logoWidth = Math.max(1, Math.round(canvas.width * LOGO_WIDTH_RATIO));
    const logoHeight = Math.max(1, Math.round(canvas.height * LOGO_HEIGHT_RATIO));
    const logoTop = Math.round(canvas.height * LOGO_TOP_RATIO);
    const logoRight = Math.round(canvas.width * LOGO_RIGHT_RATIO);
    const logoLeft = Math.max(0, canvas.width - logoWidth - logoRight);

    return [
        {
            id: 'title_band',
            type: 'text',
            content_ref: 'pov_text',
            bounds: { x: 0, y: 0, width: canvas.width, height: titleBandHeight },
            z: 10,
            text: {
                horizontal_align: 'center',
                vertical_align: 'middle',
                line_spacing_px: 6,
                max_lines: 3,
                overflow: 'shrink',
                font: {
                    family: 'NotoSansDevanagari',
                    fallbacks: ['NotoSansDevanagari'],
                    weight: 700,
                    size: 60,
                },
                width_percent: 75,
                min_font_size: 24,
            },
            style_ref: 'title_style',
        },
        {
            id: 'logo_mark',
            type: 'image',
            asset_ref: 'logo_mark',
            bounds: { x: logoLeft, y: logoTop, width: logoWidth, height: logoHeight },
            z: 20,
        },
        {
            id: 'video_main',
            type: 'video',
            bounds: { x: 0, y: titleBandHeight, width: canvas.width, height: videoHeight },
            z: 0,
            media: { fit: 'cover', crop_anchor: 'center' },
        },
    ];
}

export const DEFAULT_FORM_DATA: TemplateFormData = {
    slug: '',
    canvas: DEFAULT_CANVAS,
    styles: DEFAULT_STYLES,
    logoFile: null,
    logoPreview: null,
};
