import type { AssetDef } from '../types/template';
import type { FontCatalogEntry } from '@/types/fonts';

const FONT_EXTENSIONS = new Set(['.ttf', '.otf']);

export function isSupportedFontFile(file: File): boolean {
  const suffix = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
  return FONT_EXTENSIONS.has(suffix);
}

export function inferFontStyle(fileName: string): 'normal' | 'italic' {
  return /italic/i.test(fileName) ? 'italic' : 'normal';
}

export function inferFontWeight(fileName: string, fallbackWeight = 400): number {
  const normalized = fileName.toLowerCase();
  if (/thin|hairline/.test(normalized)) return 100;
  if (/extralight|ultralight/.test(normalized)) return 200;
  if (/light/.test(normalized)) return 300;
  if (/medium/.test(normalized)) return 500;
  if (/semibold|demibold/.test(normalized)) return 600;
  if (/extrabold|ultrabold/.test(normalized)) return 800;
  if (/black|heavy/.test(normalized)) return 900;
  if (/bold/.test(normalized)) return 700;
  if (/regular|book|roman/.test(normalized)) return 400;
  return fallbackWeight;
}

export function inferFontFamily(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const cleaned = withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\b(thin|hairline|extralight|ultralight|light|regular|book|roman|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || withoutExt || 'Custom Font';
}

export function buildFontAssetKey(family: string, weight: number, style: string = 'normal'): string {
  const slug = family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'custom_font';
  return `font_${slug}_${weight}_${style.toLowerCase()}`;
}

export function buildUploadedFontEntry(assetKey: string, asset: AssetDef): FontCatalogEntry | null {
  if (asset.type !== 'font' || !asset.family) return null;
  return {
    family: asset.family,
    display: asset.family,
    weights: [typeof asset.weight === 'number' ? asset.weight : 400],
    scripts: ['custom'],
    source: 'uploaded',
    assetKey,
  };
}

export function listUploadedFontEntries(assets: Record<string, AssetDef>): FontCatalogEntry[] {
  const seen = new Map<string, FontCatalogEntry>();
  for (const [assetKey, asset] of Object.entries(assets || {})) {
    const entry = buildUploadedFontEntry(assetKey, asset);
    if (!entry) continue;
    const key = entry.family.toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
      continue;
    }
    const mergedWeights = Array.from(new Set([...existing.weights, ...entry.weights])).sort((a, b) => a - b);
    seen.set(key, { ...existing, weights: mergedWeights });
  }
  return Array.from(seen.values()).sort((left, right) => left.display.localeCompare(right.display));
}

export function isFontFamilyAvailable(family: string, fonts: FontCatalogEntry[]): boolean {
  const normalized = family.trim().toLowerCase();
  return fonts.some((entry) => entry.family.trim().toLowerCase() == normalized);
}

export function mergeFontEntries(...groups: Array<FontCatalogEntry[] | null | undefined>): FontCatalogEntry[] {
  const merged = new Map<string, FontCatalogEntry>();

  for (const group of groups) {
    for (const entry of group || []) {
      const key = entry.family.trim().toLowerCase();
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...entry,
          weights: Array.from(new Set(entry.weights)).sort((left, right) => left - right),
        });
        continue;
      }
      merged.set(key, {
        ...existing,
        display: existing.display || entry.display,
        scripts: Array.from(new Set([...(existing.scripts || []), ...(entry.scripts || [])])),
        source: existing.source === 'uploaded' ? existing.source : entry.source,
        assetKey: existing.assetKey || entry.assetKey,
        weights: Array.from(new Set([...(existing.weights || []), ...(entry.weights || [])])).sort((left, right) => left - right),
      });
    }
  }

  return Array.from(merged.values()).sort((left, right) => left.display.localeCompare(right.display));
}
