/**
 * Render Manifest types — TypeScript mirror of the backend manifest schema.
 *
 * The manifest captures everything needed to reconstruct an editable state
 * from a completed render. The interface editor loads this to hydrate itself.
 */

import type { TemplateJSON } from './template';

export interface ResolvedSizePx {
  width?: number;
  height?: number;
}

export interface ResolvedBoxPx extends ResolvedSizePx {
  x?: number;
  y?: number;
}

export interface ResolvedTextLayout {
  backend?: string;
  source_text?: string;
  lines?: string[];
  line_count?: number;
  font_family_used?: string;
  font_size_used?: number;
  line_height_px?: number;
  line_advance_px?: number;
  line_spacing_px?: number;
  baseline?: string;
  horizontal_align?: 'left' | 'center' | 'right';
  vertical_align?: 'top' | 'middle' | 'bottom' | 'center';
  block_width_px?: number;
  block_height_px?: number;
  font_ascent_px?: number;
  font_descent_px?: number;
  content_box_px?: ResolvedBoxPx;
  ink_box_px?: ResolvedSizePx;
  max_text_width_px?: number;
  fits_width?: boolean;
  fits_height?: boolean;
  font_path?: string;
  font_weight?: number;
}

export interface ResolvedZoneFills {
  text?: string;
  bg?: string;
}

export interface ResolvedZonePayload {
  text_layout?: ResolvedTextLayout;
  fills?: ResolvedZoneFills;
  fit?: 'cover' | 'contain';
  crop_anchor?: 'center' | 'top' | 'bottom';
  crop_focus?: { x: number; y: number };
  asset_ref?: string;
  asset_path?: string;
  [key: string]: unknown;
}

/** A resolved zone from the backend ResolvedIR. */
export interface ResolvedZone {
  id: string;
  type: 'text' | 'image' | 'video' | 'shape';
  rect: { x: number; y: number; w: number; h: number };
  z: number;
  time: { start: number; end: number };
  resolved: ResolvedZonePayload;
  role?: string;
}

/** The render payload — what was sent to the pipeline. */
export interface RenderPayload {
  template_ref: string;
  inputs: Record<string, string>;
  time_window?: { start: number; end: number };
  render_options?: Record<string, unknown>;
  copy_language?: string;
  source_video_key?: string;
  source_video_url?: string;
  [key: string]: unknown;
}

/** The render manifest — single source of truth for editor hydration. */
export interface RenderManifest {
  manifest_version: string;
  template_ir: TemplateJSON;
  render_payload: RenderPayload;
  resolved_zones: ResolvedZone[];
  canvas: { w: number; h: number };
  compositing_mode: 'stack' | 'overlay';
  assets: Record<string, string>; // asset key → download URL
}

export interface StudioManifestResponse {
  manifest: RenderManifest;
  source: 'draft' | 'original';
  updated_at?: string | null;
}

export interface StudioSaveResponse {
  updated_at?: string | null;
  source: 'draft';
}

export interface StudioExportResponse {
  url: string;
  filename: string;
  job_id: string;
  clip_index: number;
}

export interface StudioCopySuggestionsResponse {
  options: string[];
  copy_language: 'en' | 'hi';
}
