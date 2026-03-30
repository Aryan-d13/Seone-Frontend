import type { ZoneSpec } from '../types/template';

export function hasForcedAutoHeight(zone: Pick<ZoneSpec, 'type' | 'role'>): boolean {
  return zone.type === 'image' && zone.role === 'logo';
}
