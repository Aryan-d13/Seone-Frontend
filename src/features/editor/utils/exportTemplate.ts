/**
 * Export a clean TemplateJSON matching rendering_v1's load_template_ir().
 *
 * Strips any UI-only state that doesn't belong in the output.
 */

import type { TemplateJSON, ZoneSpec } from '../types/template';
import { hasForcedAutoHeight } from './zoneRules';

function readPersistableRef(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (!normalized) return undefined;
    if (normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
        return undefined;
    }
    return normalized;
}

function cleanZone(zone: ZoneSpec): Record<string, unknown> {
    const includeHeight = !hasForcedAutoHeight(zone) && zone.bounds.height !== undefined;
    const clean: Record<string, unknown> = {
        id: zone.id,
        type: zone.type,
        bounds: includeHeight
            ? { x: zone.bounds.x, y: zone.bounds.y, width: zone.bounds.width, height: zone.bounds.height }
            : { x: zone.bounds.x, y: zone.bounds.y, width: zone.bounds.width },
        z: zone.z,
    };

    const contentRef = readPersistableRef(zone.content_ref);
    if (contentRef) clean.content_ref = contentRef;
    if (zone.text) clean.text = JSON.parse(JSON.stringify(zone.text));
    if (zone.media) clean.media = { ...zone.media };
    if (zone.shape) clean.shape = { ...zone.shape };
    const assetRef = readPersistableRef(zone.asset_ref);
    if (assetRef) clean.asset_ref = assetRef;
    const styleRef = readPersistableRef(zone.style_ref);
    if (styleRef) clean.style_ref = styleRef;
    const role = readPersistableRef(zone.role);
    if (role) clean.role = role;

    return clean;
}

export function exportTemplate(template: TemplateJSON): string {
    const output = {
        template_version: template.template_version,
        id: template.id,
        canvas: { ...template.canvas },
        compositing_mode: template.compositing_mode,
        zones: template.zones.map(cleanZone),
        styles: JSON.parse(JSON.stringify(template.styles)),
        assets: JSON.parse(JSON.stringify(template.assets)),
        ...(template.slot_contract ? { slot_contract: JSON.parse(JSON.stringify(template.slot_contract)) } : {}),
        ...(template.compatibility_key ? { compatibility_key: template.compatibility_key } : {}),
    };

    return JSON.stringify(output, null, 2);
}

/**
 * Trigger a JSON file download in the browser.
 */
export function downloadJSON(json: string, filename: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
