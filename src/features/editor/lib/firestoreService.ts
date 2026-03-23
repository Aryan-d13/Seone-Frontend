/**
 * Firestore CRUD for the `templates/` collection.
 *
 * Document ID convention: template.id with "/" → "_"
 *   e.g. "chaturnath/v1" → "chaturnath_v1"
 *
 * This matches the existing Python backend (seed_templates.py, firestore_resolver.py).
 */

import {
    collection, doc, getDocs, getDoc, setDoc, deleteDoc,
    serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { TemplateJSON } from '../types/template';

const COLLECTION = 'templates';

export interface TemplateListItem {
    docId: string;
    templateId: string;
    name: string;
    canvasWidth: number;
    canvasHeight: number;
    zoneCount: number;
    updatedAt?: string;
    updatedBy?: string;
}

/**
 * Normalize a template ID to a Firestore document ID.
 */
export function toDocId(templateId: string): string {
    return templateId.replace(/\//g, '_');
}

/**
 * List all templates from Firestore.
 */
export async function listTemplates(): Promise<TemplateListItem[]> {
    const q = query(collection(db, COLLECTION));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
        const data = doc.data();
        const canvas = data.canvas || {};
        return {
            docId: doc.id,
            templateId: data.id || doc.id,
            name: (data.id || doc.id).replace(/_/g, ' ').replace(/\//g, ' / '),
            canvasWidth: canvas.width || 0,
            canvasHeight: canvas.height || 0,
            zoneCount: Array.isArray(data.zones) ? data.zones.length : 0,
            updatedAt: data._updated_at?.toDate?.()?.toISOString?.() || undefined,
            updatedBy: data._updated_by || undefined,
        };
    });
}

/**
 * Fetch a single template from Firestore.
 */
export async function getTemplate(docId: string): Promise<TemplateJSON | null> {
    const ref = doc(db, COLLECTION, docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data();
    // Strip internal metadata before returning
    const { _updated_at, _updated_by, ...templateData } = data;
    return templateData as unknown as TemplateJSON;
}

/**
 * Save (create or overwrite) a template in Firestore.
 * Adds metadata: _updated_at, _updated_by.
 */
export async function saveTemplate(
    template: TemplateJSON,
    userEmail: string,
): Promise<string> {
    const docId = toDocId(template.id);
    const ref = doc(db, COLLECTION, docId);

    await setDoc(ref, {
        ...template,
        _updated_at: serverTimestamp(),
        _updated_by: userEmail,
    });

    return docId;
}

/**
 * Delete a template from Firestore.
 */
export async function deleteTemplate(docId: string): Promise<void> {
    const ref = doc(db, COLLECTION, docId);
    await deleteDoc(ref);
}
