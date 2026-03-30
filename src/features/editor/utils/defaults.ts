/**
 * Default values for new zones, matching production templates
 * (chaturnath.json, tenali_stories.json).
 *
 * These mirror the exact values used in the rendering_v1 pipeline.
 */

import type { TextSpec, MediaSpec, ZoneSpec, TextFontSpec } from '../types/template';

export const DEFAULT_FONT: TextFontSpec = {
  family: 'NotoSansDevanagari',
  weight: 700,
  fallbacks: [],
  size: 60,
};

export const DEFAULT_TEXT_SPEC: TextSpec = {
  max_lines: 3,
  overflow: 'shrink', // production uses shrink, not wrap
  font: { ...DEFAULT_FONT },
  width_percent: 75,
  min_font_size: 24,
  horizontal_align: 'center',
  vertical_align: 'middle',
  line_spacing_px: 6, // production uses 6, not 0
};

export const DEFAULT_MEDIA_SPEC: MediaSpec = {
  fit: 'cover',
  crop_anchor: 'center', // production uses center, not top
};

/**
 * Factory: creates a new text zone matching production "title_band" layout.
 *
 * At compositing_mode="stack", the title_band sits at the top and the video
 * beneath it. Default height = 270px (25% of 1080).
 */
export function createTextZone(canvasW: number, canvasH: number): ZoneSpec {
  const bandH = Math.round(canvasH * 0.25);
  return {
    id: 'title_band',
    type: 'text',
    content_ref: 'pov_text',
    bounds: { x: 0, y: 0, width: canvasW, height: bandH },
    z: 10,
    text: { ...DEFAULT_TEXT_SPEC, font: { ...DEFAULT_FONT } },
    style_ref: 'title_style',
  };
}

/**
 * Factory: creates a new image zone matching production "logo_mark".
 *
 * Uses auto-height (omitted) for chaturnath-style small logos,
 * or a fixed height can be set in the inspector.
 */
export function createImageZone(): ZoneSpec {
  return {
    id: 'logo_mark',
    type: 'image',
    role: 'logo',
    asset_ref: 'logo_mark',
    bounds: { x: 15, y: 15, width: 50 },
    z: 20,
  };
}

/**
 * Factory: creates a new video zone matching production "video_main".
 *
 * For stack mode: video sits below the title_band.
 * y = title band height, height = canvas height − title band height.
 */
export function createVideoZone(canvasW: number, canvasH: number): ZoneSpec {
  const bandH = Math.round(canvasH * 0.25);
  return {
    id: 'video_main',
    type: 'video',
    bounds: { x: 0, y: bandH, width: canvasW, height: canvasH - bandH },
    z: 0,
    media: { ...DEFAULT_MEDIA_SPEC },
  };
}
