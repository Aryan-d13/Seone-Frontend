/**
 * Backend-backed template CRUD for the admin builder.
 *
 * The embedded admin panel should not depend on browser Firebase auth.
 * These helpers talk to Seone's authenticated API, which handles
 * template storage policy server-side. Production is expected to run
 * fail-closed against Firestore; local development may enable a
 * filesystem fallback explicitly.
 */

import { endpoints } from '@/lib/config';
import { authFetch } from '@/services/auth';
import type { TemplateJSON } from '../types/template';

export interface TemplateListItem {
  docId: string;
  templateId: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  zoneCount: number;
  compatibilityKey?: string;
  updatedAt?: string;
  updatedBy?: string;
  showTags: string[];
}

interface AdminTemplateListWire {
  templates: Array<{
    doc_id: string;
    template_id: string;
    name: string;
    canvas_width: number;
    canvas_height: number;
    zone_count: number;
    compatibility_key?: string;
    updated_at?: string;
    updated_by?: string;
    show_tags?: string[];
  }>;
}

interface AdminTemplateDocumentWire {
  template: TemplateJSON;
}

export function toDocId(templateId: string): string {
  return templateId.replace(/\//g, '_');
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  const response = await authFetch(endpoints.pages.adminTemplates);
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to list templates (${response.status}): ${errorText}`);
  }

  const payload: AdminTemplateListWire = await response.json();
  return payload.templates.map(item => ({
    docId: item.doc_id,
    templateId: item.template_id,
    name: item.name,
    canvasWidth: item.canvas_width,
    canvasHeight: item.canvas_height,
    zoneCount: item.zone_count,
    compatibilityKey: item.compatibility_key,
    updatedAt: item.updated_at,
    updatedBy: item.updated_by,
    showTags: Array.isArray(item.show_tags) ? item.show_tags : [],
  }));
}

export async function getTemplate(docId: string): Promise<TemplateJSON | null> {
  const response = await authFetch(endpoints.pages.adminTemplate(docId));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to load template (${response.status}): ${errorText}`);
  }

  const payload: AdminTemplateDocumentWire = await response.json();
  return payload.template;
}

export async function getPublicTemplateDocument(
  templateRef: string
): Promise<TemplateJSON | null> {
  const response = await authFetch(endpoints.pages.document(templateRef));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to load template (${response.status}): ${errorText}`);
  }

  const payload: AdminTemplateDocumentWire = await response.json();
  return payload.template;
}

export async function saveTemplate(
  template: TemplateJSON,
  userEmail: string
): Promise<string> {
  void userEmail;
  const docId = toDocId(template.id);
  const response = await authFetch(endpoints.pages.adminTemplate(docId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to save template (${response.status}): ${errorText}`);
  }

  return docId;
}

export async function deleteTemplate(docId: string): Promise<void> {
  const response = await authFetch(endpoints.pages.adminTemplate(docId), {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to delete template (${response.status}): ${errorText}`);
  }
}
