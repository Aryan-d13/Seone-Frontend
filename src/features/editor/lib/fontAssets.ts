import type { AssetDef } from '../types/template';
import type {
  FontAssetAnalysis,
  FontCatalogEntry,
  FontAnalysisState,
} from '@/types/fonts';

const FONT_EXTENSIONS = new Set(['.ttf', '.otf']);

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function codePointSupportsLatin(codePoint: number): boolean {
  return (
    (codePoint >= 0x0041 && codePoint <= 0x007a) ||
    (codePoint >= 0x00c0 && codePoint <= 0x024f)
  );
}

function codePointSupportsDevanagari(codePoint: number): boolean {
  return codePoint >= 0x0900 && codePoint <= 0x097f;
}

function detectScriptsFromCodePoint(codePoint: number, scripts: Set<string>): void {
  if (codePointSupportsLatin(codePoint)) {
    scripts.add('latin');
  }
  if (codePointSupportsDevanagari(codePoint)) {
    scripts.add('devanagari');
  }
}

function hasInterestingScripts(scripts: Set<string>): boolean {
  return scripts.has('latin') && scripts.has('devanagari');
}

function readTableOffset(view: DataView, tag: string): number | null {
  const numTables = readUint16(view, 4);
  for (let index = 0; index < numTables; index += 1) {
    const tableOffset = 12 + index * 16;
    const tableTag = String.fromCharCode(
      view.getUint8(tableOffset),
      view.getUint8(tableOffset + 1),
      view.getUint8(tableOffset + 2),
      view.getUint8(tableOffset + 3)
    );
    if (tableTag !== tag) continue;
    return readUint32(view, tableOffset + 8);
  }
  return null;
}

function readFormat12Scripts(
  view: DataView,
  subtableOffset: number,
  scripts: Set<string>
): void {
  const numGroups = readUint32(view, subtableOffset + 12);
  for (let index = 0; index < numGroups; index += 1) {
    const groupOffset = subtableOffset + 16 + index * 12;
    const startCharCode = readUint32(view, groupOffset);
    const endCharCode = readUint32(view, groupOffset + 4);
    for (let codePoint = startCharCode; codePoint <= endCharCode; codePoint += 1) {
      detectScriptsFromCodePoint(codePoint, scripts);
      if (hasInterestingScripts(scripts)) {
        return;
      }
    }
  }
}

function readFormat4Scripts(
  view: DataView,
  subtableOffset: number,
  scripts: Set<string>
): void {
  const segCount = readUint16(view, subtableOffset + 6) / 2;
  const endCodeOffset = subtableOffset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;

  for (let segmentIndex = 0; segmentIndex < segCount; segmentIndex += 1) {
    const endCode = readUint16(view, endCodeOffset + segmentIndex * 2);
    const startCode = readUint16(view, startCodeOffset + segmentIndex * 2);
    if (startCode === 0xffff && endCode === 0xffff) continue;
    for (let codePoint = startCode; codePoint <= endCode; codePoint += 1) {
      detectScriptsFromCodePoint(codePoint, scripts);
      if (hasInterestingScripts(scripts)) {
        return;
      }
    }
  }
}

export function analyzeFontBuffer(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer);
  const cmapOffset = readTableOffset(view, 'cmap');
  if (cmapOffset == null) {
    throw new Error('Font file is missing a cmap table');
  }

  const scripts = new Set<string>();
  const numSubtables = readUint16(view, cmapOffset + 2);
  let bestUnicodeOffset: number | null = null;

  for (let index = 0; index < numSubtables; index += 1) {
    const recordOffset = cmapOffset + 4 + index * 8;
    const platformId = readUint16(view, recordOffset);
    const encodingId = readUint16(view, recordOffset + 2);
    const subtableOffset = cmapOffset + readUint32(view, recordOffset + 4);
    const format = readUint16(view, subtableOffset);
    const isUnicodeSubtable =
      platformId === 0 ||
      (platformId === 3 && (encodingId === 1 || encodingId === 10));
    if (!isUnicodeSubtable) continue;
    if (format !== 4 && format !== 12) continue;
    if (format === 12) {
      bestUnicodeOffset = subtableOffset;
      break;
    }
    if (bestUnicodeOffset == null) {
      bestUnicodeOffset = subtableOffset;
    }
  }

  if (bestUnicodeOffset == null) {
    return [];
  }

  const format = readUint16(view, bestUnicodeOffset);
  if (format === 12) {
    readFormat12Scripts(view, bestUnicodeOffset, scripts);
  } else if (format === 4) {
    readFormat4Scripts(view, bestUnicodeOffset, scripts);
  }

  return Array.from(scripts).sort();
}

export async function analyzeFontFile(file: File): Promise<string[]> {
  return analyzeFontBuffer(await file.arrayBuffer());
}

export async function analyzeFontUrl(url: string): Promise<string[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch font (${response.status})`);
  }
  return analyzeFontBuffer(await response.arrayBuffer());
}

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
    .replace(
      /\b(thin|hairline|extralight|ultralight|light|regular|book|roman|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || withoutExt || 'Custom Font';
}

export function buildFontAssetKey(
  family: string,
  weight: number,
  style: string = 'normal'
): string {
  const slug =
    family
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'custom_font';
  return `font_${slug}_${weight}_${style.toLowerCase()}`;
}

function pickAnalysisState(
  current: FontAnalysisState | undefined,
  next: FontAnalysisState | undefined
): FontAnalysisState | undefined {
  const order: FontAnalysisState[] = ['ready', 'pending', 'failed'];
  if (!current) return next;
  if (!next) return current;
  return order.indexOf(next) < order.indexOf(current) ? next : current;
}

export function buildUploadedFontEntry(
  assetKey: string,
  asset: AssetDef,
  analysis?: FontAssetAnalysis
): FontCatalogEntry | null {
  if (asset.type !== 'font' || !asset.family) return null;
  const scripts = Array.from(
    new Set((analysis?.scripts?.length ? analysis.scripts : asset.scripts) || [])
  );
  return {
    family: asset.family,
    display: asset.family,
    weights: [typeof asset.weight === 'number' ? asset.weight : 400],
    scripts,
    source: 'uploaded',
    assetKey,
    analysisState: analysis?.state ?? (scripts.length > 0 ? 'ready' : 'pending'),
  };
}

export function listUploadedFontEntries(
  assets: Record<string, AssetDef>,
  analysisByAssetKey: Record<string, FontAssetAnalysis> = {}
): FontCatalogEntry[] {
  const seen = new Map<string, FontCatalogEntry>();
  for (const [assetKey, asset] of Object.entries(assets || {})) {
    const entry = buildUploadedFontEntry(assetKey, asset, analysisByAssetKey[assetKey]);
    if (!entry) continue;
    const key = entry.family.toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
      continue;
    }
    const mergedWeights = Array.from(
      new Set([...existing.weights, ...entry.weights])
    ).sort((a, b) => a - b);
    seen.set(key, {
      ...existing,
      weights: mergedWeights,
      scripts: Array.from(new Set([...(existing.scripts || []), ...(entry.scripts || [])])),
      analysisState: pickAnalysisState(existing.analysisState, entry.analysisState),
    });
  }
  return Array.from(seen.values()).sort((left, right) =>
    left.display.localeCompare(right.display)
  );
}

export function isFontFamilyAvailable(
  family: string,
  fonts: FontCatalogEntry[]
): boolean {
  const normalized = family.trim().toLowerCase();
  return fonts.some(entry => entry.family.trim().toLowerCase() == normalized);
}

export function mergeFontEntries(
  ...groups: Array<FontCatalogEntry[] | null | undefined>
): FontCatalogEntry[] {
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
        scripts: Array.from(
          new Set([...(existing.scripts || []), ...(entry.scripts || [])])
        ),
        source: existing.source === 'uploaded' ? existing.source : entry.source,
        assetKey: existing.assetKey || entry.assetKey,
        weights: Array.from(
          new Set([...(existing.weights || []), ...(entry.weights || [])])
        ).sort((left, right) => left - right),
        analysisState: pickAnalysisState(existing.analysisState, entry.analysisState),
      });
    }
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.display.localeCompare(right.display)
  );
}
