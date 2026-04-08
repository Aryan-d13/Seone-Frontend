import type {
  TemplateJSON,
  TextFontSpec,
  TextFontLanguageOverrideSpec,
} from '../types/template';
import type { FontCatalogEntry } from '@/types/fonts';
import type {
  FontState,
  StudioFontDescriptor,
  StudioFontViewModel,
} from '../types/studioUi';

export type RuntimeFontLanguage = 'en' | 'hi';

export type RuntimeFontIssueCode =
  | 'missing_family'
  | 'script_unsupported'
  | 'analysis_pending'
  | 'analysis_failed';

export interface ActiveTextFontSelection {
  family: string;
  weight: number;
  language: RuntimeFontLanguage | null;
  override: TextFontLanguageOverrideSpec | null;
}

export interface ResolvedRuntimeTextFont extends StudioFontViewModel {
  family: string;
  weight: number;
  configuredFamily: string;
  configuredWeight: number;
  configuredLanguage: RuntimeFontLanguage | null;
  detectedLanguage: RuntimeFontLanguage | null;
  activeLanguage: RuntimeFontLanguage | null;
  fallbackApplied: boolean;
  issue: RuntimeFontIssueCode | null;
  repairable: boolean;
  repairFamily: string | null;
  repairWeight: number | null;
  repairMessage: string | null;
}

export interface RuntimeFontIssue {
  zoneId: string;
  contentRef: string | null;
  family: string;
  language: RuntimeFontLanguage | null;
  issue: RuntimeFontIssueCode;
  message: string;
  effectiveFamily: string;
  repairable: boolean;
  repairFamily: string | null;
  repairWeight: number | null;
}

const LANGUAGE_SAFE_FALLBACK_FAMILY: Record<RuntimeFontLanguage, string> = {
  en: 'NotoSans',
  hi: 'NotoSansDevanagari',
};

function formatLanguage(language: RuntimeFontLanguage | null): string {
  if (language === 'hi') return 'Hindi';
  if (language === 'en') return 'English';
  return 'current';
}

function toFontDescriptor(
  entry: FontCatalogEntry | undefined,
  family: string,
  weight: number,
  sourceOverride?: StudioFontDescriptor['source']
): StudioFontDescriptor {
  return {
    family,
    weight,
    source: sourceOverride ?? (entry?.source === 'uploaded' ? 'uploaded' : 'builtin'),
  };
}

export function normalizeCopyLanguage(value: unknown): RuntimeFontLanguage | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'en' || normalized === 'hi') return normalized;
  return null;
}

export function detectTextLanguage(
  text: string | null | undefined
): RuntimeFontLanguage | null {
  if (typeof text !== 'string' || !text.trim()) return null;

  const hasDevanagari = Array.from(text).some(
    char => char >= '\u0900' && char <= '\u097f'
  );
  const hasLatin = Array.from(text).some(char => {
    return (
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '\u00c0' && char <= '\u024f')
    );
  });

  if (hasDevanagari && !hasLatin) return 'hi';
  if (hasLatin && !hasDevanagari) return 'en';
  return null;
}

export function findFontEntry(
  fonts: FontCatalogEntry[],
  family: string | null | undefined
): FontCatalogEntry | undefined {
  const normalized = String(family || '')
    .trim()
    .toLowerCase();
  if (!normalized) return undefined;
  return fonts.find(
    entry =>
      String(entry.family || '')
        .trim()
        .toLowerCase() === normalized
  );
}

export function nearestRuntimeWeight(
  entry: FontCatalogEntry,
  requestedWeight: number
): number {
  const weights =
    Array.isArray(entry.weights) && entry.weights.length > 0 ? entry.weights : [400];
  return weights.reduce((best, candidate) =>
    Math.abs(candidate - requestedWeight) < Math.abs(best - requestedWeight)
      ? candidate
      : best
  );
}

function fontSupportsLanguage(
  entry: FontCatalogEntry | undefined,
  language: RuntimeFontLanguage | null
): 'supported' | 'unsupported' | 'pending' | 'failed' {
  if (!entry || !language) return 'supported';

  if (entry.source === 'uploaded') {
    if (entry.analysisState === 'failed') return 'failed';
    if (entry.analysisState !== 'ready') return 'pending';
  }

  const scripts = (entry.scripts || []).map(script =>
    String(script || '')
      .trim()
      .toLowerCase()
  );
  if (!scripts.length) {
    return entry.source === 'uploaded' ? 'pending' : 'supported';
  }

  const requiredScript = language === 'hi' ? 'devanagari' : 'latin';
  return scripts.includes(requiredScript) ? 'supported' : 'unsupported';
}

export function getActiveTextFontSelection(
  font: TextFontSpec,
  copyLanguage: unknown
): ActiveTextFontSelection {
  const language = normalizeCopyLanguage(copyLanguage);
  const override =
    language && font.language_overrides
      ? font.language_overrides[language] || null
      : null;
  return {
    family: String(override?.family || font.family || '').trim(),
    weight: Number(override?.weight ?? font.weight ?? 400),
    language,
    override,
  };
}

export function applyTextFontSelection(
  font: TextFontSpec,
  nextSelection: { family: string; weight: number; copyLanguage: unknown }
): TextFontSpec {
  const language = normalizeCopyLanguage(nextSelection.copyLanguage);
  const nextFont: TextFontSpec = {
    ...font,
    family: nextSelection.family,
    weight: nextSelection.weight,
  };

  if (!language) {
    return nextFont;
  }

  const languageOverrides = {
    ...(font.language_overrides || {}),
    [language]: {
      family: nextSelection.family,
      weight: nextSelection.weight,
    },
  };

  return {
    ...nextFont,
    language_overrides: languageOverrides,
  };
}

function buildResolvedState({
  selectedEntry,
  effectiveEntry,
  configuredFamily,
  configuredWeight,
  configuredLanguage,
  hasExplicitActiveOverride,
  detectedLanguage,
  activeLanguage,
  issue,
}: {
  selectedEntry: FontCatalogEntry | undefined;
  effectiveEntry: FontCatalogEntry | undefined;
  configuredFamily: string;
  configuredWeight: number;
  configuredLanguage: RuntimeFontLanguage | null;
  hasExplicitActiveOverride: boolean;
  detectedLanguage: RuntimeFontLanguage | null;
  activeLanguage: RuntimeFontLanguage | null;
  issue: RuntimeFontIssueCode | null;
}): ResolvedRuntimeTextFont {
  const selectedWeight = selectedEntry
    ? nearestRuntimeWeight(selectedEntry, configuredWeight)
    : configuredWeight;
  const fallbackApplied =
    Boolean(issue) &&
    (effectiveEntry?.family.trim().toLowerCase() || '') !==
      configuredFamily.trim().toLowerCase();
  const effectiveFamily = effectiveEntry?.family || configuredFamily;
  const effectiveWeight = effectiveEntry
    ? nearestRuntimeWeight(effectiveEntry, configuredWeight)
    : configuredWeight;
  const repairable = false;
  const repairMessage = null;

  let fontState: FontState = 'SELECTED_VALID';
  let compatibilityStatus = 'Selected font matches the current text.';
  let blockingReason: string | null = null;

  if (issue === 'missing_family') {
    fontState = 'MISSING';
    compatibilityStatus = 'Selected font is missing from the runtime catalog.';
    blockingReason = `${configuredFamily} is not available in the runtime font catalog. Preview and export are blocked until you choose an available font.`;
  } else if (issue === 'analysis_pending') {
    fontState = 'CHECKING';
    compatibilityStatus = 'Uploaded font is still being checked for text support.';
    blockingReason = `${configuredFamily} is still being checked for ${formatLanguage(activeLanguage)} text support. Preview and export are blocked until the check finishes.`;
  } else if (issue === 'analysis_failed') {
    fontState = fallbackApplied ? 'FALLBACK_DIAGNOSTIC' : 'SELECTED_INVALID';
    compatibilityStatus = `Font compatibility could not be verified. Canvas is using ${effectiveFamily}.`;
    blockingReason = `${configuredFamily} could not be verified for ${formatLanguage(activeLanguage)} text. Preview and export are blocked until you choose a verified font.`;
  } else if (issue === 'script_unsupported') {
    fontState = fallbackApplied ? 'FALLBACK_DIAGNOSTIC' : 'SELECTED_INVALID';
    compatibilityStatus = `Selected font does not support ${formatLanguage(activeLanguage)} text. Canvas is using ${effectiveFamily}.`;
    blockingReason = `${configuredFamily} cannot render ${formatLanguage(activeLanguage)} text. Preview and export are blocked until you choose a compatible font.`;
  }

  return {
    selectedFont: toFontDescriptor(selectedEntry, configuredFamily, selectedWeight),
    effectiveFont: toFontDescriptor(
      effectiveEntry,
      effectiveFamily,
      effectiveWeight,
      fallbackApplied ? 'fallback' : undefined
    ),
    fontState,
    compatibilityStatus,
    blockingReason,
    family: effectiveFamily,
    weight: effectiveWeight,
    configuredFamily,
    configuredWeight,
    configuredLanguage,
    detectedLanguage,
    activeLanguage,
    fallbackApplied,
    issue,
    repairable,
    repairFamily: repairable ? effectiveFamily : null,
    repairWeight: repairable ? effectiveWeight : null,
    repairMessage,
  };
}

export function resolveRuntimeTextFont({
  font,
  copyLanguage,
  textContent,
  fonts,
}: {
  font: TextFontSpec;
  copyLanguage: unknown;
  textContent?: string | null;
  fonts: FontCatalogEntry[];
}): ResolvedRuntimeTextFont {
  const selection = getActiveTextFontSelection(font, copyLanguage);
  const configuredLanguage = selection.language;
  const hasExplicitActiveOverride = Boolean(selection.override);
  const detectedLanguage = detectTextLanguage(textContent);
  const activeLanguage = detectedLanguage || configuredLanguage;
  const fallbackLanguage = detectedLanguage || configuredLanguage || 'en';
  const fallbackFamily = LANGUAGE_SAFE_FALLBACK_FAMILY[fallbackLanguage];
  const configuredFamily = selection.family || fallbackFamily;
  const configuredWeight = Number.isFinite(selection.weight) ? selection.weight : 400;
  const configuredEntry = findFontEntry(fonts, configuredFamily);
  const fallbackEntry = findFontEntry(fonts, fallbackFamily);
  const supportState = fontSupportsLanguage(configuredEntry, activeLanguage);

  if (!configuredEntry) {
    return buildResolvedState({
      selectedEntry: undefined,
      effectiveEntry: fallbackEntry,
      configuredFamily,
      configuredWeight,
      configuredLanguage,
      hasExplicitActiveOverride,
      detectedLanguage,
      activeLanguage,
      issue: 'missing_family',
    });
  }

  if (supportState === 'supported') {
    return buildResolvedState({
      selectedEntry: configuredEntry,
      effectiveEntry: configuredEntry,
      configuredFamily,
      configuredWeight,
      configuredLanguage,
      hasExplicitActiveOverride,
      detectedLanguage,
      activeLanguage,
      issue: null,
    });
  }

  return buildResolvedState({
    selectedEntry: configuredEntry,
    effectiveEntry: fallbackEntry || configuredEntry,
    configuredFamily,
    configuredWeight,
    configuredLanguage,
    hasExplicitActiveOverride,
    detectedLanguage,
    activeLanguage,
    issue:
      supportState === 'pending'
        ? 'analysis_pending'
        : supportState === 'failed'
          ? 'analysis_failed'
          : 'script_unsupported',
  });
}

export function collectRuntimeFontIssues({
  template,
  previewTexts,
  copyLanguage,
  fonts,
}: {
  template: TemplateJSON;
  previewTexts: Record<string, string>;
  copyLanguage: unknown;
  fonts: FontCatalogEntry[];
}): RuntimeFontIssue[] {
  const issues: RuntimeFontIssue[] = [];
  for (const zone of template.zones) {
    if (zone.type !== 'text' || !zone.text) continue;
    const textContent = zone.content_ref ? previewTexts[zone.content_ref] || '' : '';
    const resolved = resolveRuntimeTextFont({
      font: zone.text.font,
      copyLanguage,
      textContent,
      fonts,
    });
    if (!resolved.issue || !resolved.blockingReason) continue;
    issues.push({
      zoneId: zone.id,
      contentRef: zone.content_ref || null,
      family: resolved.configuredFamily,
      language: resolved.activeLanguage,
      issue: resolved.issue,
      message: resolved.blockingReason,
      effectiveFamily: resolved.effectiveFont.family,
      repairable: resolved.repairable,
      repairFamily: resolved.repairFamily,
      repairWeight: resolved.repairWeight,
    });
  }
  return issues;
}
