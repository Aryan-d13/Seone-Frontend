/**
 * Font catalogue — curated list of fonts available in the rendering container.
 *
 * Each entry has the font family name (as used in TemplateIR), display name,
 * and weight range. This list drives the FontPicker dropdown.
 *
 * Keep this in sync with the fonts installed via Dockerfile / font provisioning.
 */

export interface FontEntry {
    family: string;
    display: string;
    weights: number[];
    script?: 'latin' | 'devanagari' | 'multi';
}

export const AVAILABLE_FONTS: FontEntry[] = [
    // ── Devanagari / Hindi ──────────────────────
    {
        family: 'NotoSansDevanagari',
        display: 'Noto Sans Devanagari',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        script: 'devanagari',
    },
    {
        family: 'NotoSerifDevanagari',
        display: 'Noto Serif Devanagari',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        script: 'devanagari',
    },
    {
        family: 'Poppins',
        display: 'Poppins',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        script: 'multi',
    },
    {
        family: 'Mukta',
        display: 'Mukta',
        weights: [200, 300, 400, 500, 600, 700, 800],
        script: 'devanagari',
    },
    {
        family: 'Tiro Devanagari Hindi',
        display: 'Tiro Devanagari Hindi',
        weights: [400],
        script: 'devanagari',
    },
    // ── Latin / Universal ───────────────────────
    {
        family: 'NotoSans',
        display: 'Noto Sans',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        script: 'latin',
    },
    {
        family: 'NotoSerif',
        display: 'Noto Serif',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        script: 'latin',
    },
    {
        family: 'Oswald',
        display: 'Oswald',
        weights: [200, 300, 400, 500, 600, 700],
        script: 'latin',
    },
    {
        family: 'Montserrat',
        display: 'Montserrat',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        script: 'latin',
    },
    {
        family: 'Playfair Display',
        display: 'Playfair Display',
        weights: [400, 500, 600, 700, 800, 900],
        script: 'latin',
    },
    {
        family: 'Lora',
        display: 'Lora',
        weights: [400, 500, 600, 700],
        script: 'latin',
    },
    {
        family: 'Raleway',
        display: 'Raleway',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        script: 'latin',
    },
];

/**
 * Find a font entry by family name. Case-insensitive.
 */
export function findFont(family: string): FontEntry | undefined {
    const lower = family.toLowerCase();
    return AVAILABLE_FONTS.find((f) => f.family.toLowerCase() === lower);
}

/**
 * Get the closest available weight for a font.
 */
export function nearestWeight(font: FontEntry, target: number): number {
    return font.weights.reduce((prev, curr) =>
        Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
    );
}
