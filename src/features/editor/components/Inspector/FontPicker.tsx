/**
 * FontPicker — dropdown for selecting from available container fonts.
 *
 * Each font is rendered in its own typeface (where possible via Google Fonts CDN)
 * so the user can visually preview the style before selecting.
 */

import { useState, useMemo } from 'react';
import { AVAILABLE_FONTS, nearestWeight, type FontEntry } from '../../data/fontCatalogue';
import './FontPicker.css';

interface FontPickerProps {
    value: string;
    weight?: number;
    onChange: (family: string) => void;
    onWeightChange?: (weight: number) => void;
}

export default function FontPicker({ value, weight = 400, onChange, onWeightChange }: FontPickerProps) {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');

    const filtered = useMemo(() => {
        if (!filter) return AVAILABLE_FONTS;
        const lower = filter.toLowerCase();
        return AVAILABLE_FONTS.filter(
            (f) =>
                f.family.toLowerCase().includes(lower) ||
                f.display.toLowerCase().includes(lower) ||
                f.script?.includes(lower)
        );
    }, [filter]);

    const currentFont = AVAILABLE_FONTS.find(
        (f) => f.family.toLowerCase() === value.toLowerCase()
    );

    const handleSelect = (font: FontEntry) => {
        onChange(font.family);
        if (onWeightChange) {
            onWeightChange(nearestWeight(font, weight));
        }
        setOpen(false);
        setFilter('');
    };

    return (
        <div className="font-picker">
            <button
                className="font-picker__trigger"
                onClick={() => setOpen(!open)}
                type="button"
            >
                <span className="font-picker__current">
                    {currentFont?.display || value}
                </span>
                <span className="font-picker__script-tag">
                    {currentFont?.script || ''}
                </span>
                <svg className="font-picker__chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {open && (
                <div className="font-picker__dropdown">
                    <input
                        className="font-picker__search"
                        type="text"
                        placeholder="Search fonts..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        autoFocus
                    />
                    <div className="font-picker__list">
                        {filtered.map((font) => (
                            <button
                                key={font.family}
                                className={`font-picker__option ${font.family === value ? 'font-picker__option--selected' : ''}`}
                                onClick={() => handleSelect(font)}
                                type="button"
                            >
                                <span className="font-picker__option-name">
                                    {font.display}
                                </span>
                                <span className="font-picker__option-meta">
                                    {font.weights.length}w · {font.script}
                                </span>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <div className="font-picker__empty">
                                No fonts match "{filter}"
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Weight selector — only show if current font has multiple weights */}
            {currentFont && currentFont.weights.length > 1 && onWeightChange && (
                <div className="font-picker__weight">
                    <span className="font-picker__weight-label">Weight</span>
                    <select
                        className="font-picker__weight-select"
                        value={nearestWeight(currentFont, weight)}
                        onChange={(e) => onWeightChange(Number(e.target.value))}
                    >
                        {currentFont.weights.map((w) => (
                            <option key={w} value={w}>
                                {w} {w <= 300 ? '(Light)' : w <= 500 ? '(Regular)' : w <= 700 ? '(Bold)' : '(Black)'}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}
