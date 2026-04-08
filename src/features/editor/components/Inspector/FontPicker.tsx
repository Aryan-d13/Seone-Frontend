import { useMemo, useState } from 'react';
import type { FontCatalogEntry } from '@/types/fonts';
import './FontPicker.css';

interface FontPickerProps {
  fonts: FontCatalogEntry[];
  value: string;
  weight?: number;
  missing?: boolean;
  disabled?: boolean;
  locked?: boolean;
  emptyLabel?: string;
  onChange: (family: string) => void;
  onWeightChange?: (weight: number) => void;
  onUpload?: () => void;
  uploadLabel?: string;
  uploadDisabled?: boolean;
  uploadHelpText?: string | null;
}

function nearestWeight(entry: FontCatalogEntry, requestedWeight: number): number {
  const weights =
    Array.isArray(entry.weights) && entry.weights.length > 0 ? entry.weights : [400];
  return weights.reduce(
    (best, candidate) =>
      Math.abs(candidate - requestedWeight) < Math.abs(best - requestedWeight)
        ? candidate
        : best,
    weights[0]
  );
}

function formatSource(source: string): string {
  if (source === 'uploaded') return 'Uploaded';
  if (source === 'builtin') return 'Built-in';
  return source || 'Runtime';
}

export default function FontPicker({
  fonts,
  value,
  weight = 400,
  missing = false,
  disabled = false,
  locked = false,
  emptyLabel = 'No fonts available',
  onChange,
  onWeightChange,
  onUpload,
  uploadLabel = 'Upload font',
  uploadDisabled = false,
  uploadHelpText = null,
}: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const normalizedFonts = useMemo(() => {
    if (fonts.length > 0) return fonts;
    if (!value.trim()) return [];
    return [
      {
        family: value,
        display: value,
        weights: [weight],
        scripts: ['unknown'],
        source: 'builtin',
      },
    ];
  }, [fonts, value, weight]);

  const filtered = useMemo(() => {
    if (!filter) return normalizedFonts;
    const lower = filter.toLowerCase();
    return normalizedFonts.filter(
      font =>
        font.family.toLowerCase().includes(lower) ||
        font.display.toLowerCase().includes(lower) ||
        font.scripts.some(script => script.toLowerCase().includes(lower))
    );
  }, [filter, normalizedFonts]);

  const currentFont = normalizedFonts.find(
    entry => entry.family.trim().toLowerCase() === value.trim().toLowerCase()
  );

  const handleSelect = (font: FontCatalogEntry) => {
    onChange(font.family);
    if (onWeightChange) {
      onWeightChange(nearestWeight(font, weight));
    }
    setOpen(false);
    setFilter('');
  };

  const effectiveDisabled = disabled || locked;

  return (
    <div className={`font-picker ${effectiveDisabled ? 'font-picker--disabled' : ''}`}>
      <button
        className={`font-picker__trigger ${missing ? 'font-picker__trigger--missing' : ''} ${locked ? 'font-picker__trigger--locked' : ''}`}
        onClick={() => !effectiveDisabled && setOpen(value => !value)}
        type="button"
        disabled={effectiveDisabled}
      >
        <span className="font-picker__current">{currentFont?.display || value}{locked ? ' (locked)' : ''}</span>
        <span className="font-picker__meta-pill">
          {currentFont?.scripts?.[0] || 'font'}
        </span>
        <svg
          className="font-picker__chevron"
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && !effectiveDisabled && (
        <div className="font-picker__dropdown">
          <input
            className="font-picker__search"
            type="text"
            placeholder="Search fonts..."
            value={filter}
            onChange={event => setFilter(event.target.value)}
            autoFocus
          />
          <div className="font-picker__list">
            {filtered.map(font => (
              <button
                key={`${font.family}:${font.source}`}
                className={`font-picker__option ${font.family === value ? 'font-picker__option--selected' : ''}`}
                onClick={() => handleSelect(font)}
                type="button"
              >
                <span className="font-picker__option-copy">
                  <span
                    className="font-picker__option-name"
                    style={{ fontFamily: `"${font.family}", var(--font-sans)` }}
                  >
                    {font.display}
                  </span>
                  <span className="font-picker__option-meta">
                    {formatSource(font.source)} ·{' '}
                    {(font.scripts || []).join(', ') || 'general'}
                  </span>
                </span>
                <span className="font-picker__option-weights">
                  {font.weights.length > 1
                    ? `${font.weights[0]}-${font.weights[font.weights.length - 1]}`
                    : font.weights[0]}
                </span>
              </button>
            ))}
            {filtered.length === 0 && normalizedFonts.length > 0 && (
              <div className="font-picker__empty">
                No fonts match &quot;{filter}&quot;
              </div>
            )}
            {!normalizedFonts.length && (
              <div className="font-picker__empty">{emptyLabel}</div>
            )}
          </div>
        </div>
      )}

      {currentFont && currentFont.weights.length > 1 && onWeightChange && (
        <div className="font-picker__weight">
          <span className="font-picker__weight-label">Weight</span>
          <select
            className="font-picker__weight-select"
            value={nearestWeight(currentFont, weight)}
            onChange={event => onWeightChange(Number(event.target.value))}
          >
            {currentFont.weights.map(entryWeight => (
              <option key={entryWeight} value={entryWeight}>
                {entryWeight}
              </option>
            ))}
          </select>
        </div>
      )}

      {!locked && (missing || onUpload || uploadHelpText) && (
        <div className="font-picker__footer">
          {missing && (
            <div className="font-picker__notice">
              This font is missing from the runtime catalog. Pick a built-in font or
              upload the file.
            </div>
          )}
          {uploadHelpText && <div className="font-picker__notice">{uploadHelpText}</div>}
          {onUpload && (
            <button
              type="button"
              className="font-picker__upload"
              onClick={onUpload}
              disabled={uploadDisabled}
            >
              {uploadLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
