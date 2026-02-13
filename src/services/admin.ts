// ============================================
// ADMIN SERVICE
// Firebase Firestore + Storage seed operations
// ============================================

import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import {
    buildDefaultZones,
    type FirestoreTemplate,
    type TemplateAsset,
    type TemplateCanvas,
    type TemplateFormData,
    type TemplateStyles,
} from '@/types/admin';

const TEMPLATES_COL = 'templates';
const DEFAULT_BG_FILL = '#FFFFFF';
const DEFAULT_TEXT_FILL = '#000000';

export type FirestoreTemplateDoc = FirestoreTemplate & { _docId: string };

function buildTemplateDocId(slug: string): string {
    return `${slug}_v1`;
}

function buildTemplateRef(slug: string): string {
    return `${slug}/v1`;
}

function buildGcsPath(slug: string): string {
    return `templates/${slug}/assets/logo.png`;
}

function buildAssetPath(slug: string): string {
    return `./templates/${slug}/assets/logo.png`;
}

function formatTemplateName(slug: string): string {
    const words = slug
        .split(/[-_]+/)
        .filter(Boolean)
        .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);

    return words.length > 0 ? words.join(' ') : slug;
}

export function normalizeSlug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function normalizeCanvas(canvas: TemplateCanvas): TemplateCanvas {
    const width = Number(canvas.width);
    const height = Number(canvas.height);

    if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(width)) {
        throw new Error('Canvas width must be a positive integer.');
    }

    if (!Number.isFinite(height) || height <= 0 || !Number.isInteger(height)) {
        throw new Error('Canvas height must be a positive integer.');
    }

    return {
        width,
        height,
        color_space: 'sRGB',
        unit: 'px',
    };
}

function normalizeStyles(styles: TemplateStyles): TemplateStyles {
    const bgFill = styles.title_style.bg_fill?.trim() || DEFAULT_BG_FILL;
    const fill = styles.title_style.fill?.trim() || DEFAULT_TEXT_FILL;

    return {
        title_style: {
            bg_fill: bgFill,
            fill,
        },
    };
}

function validateLogoFile(file: File): void {
    const isPngMime = file.type === 'image/png';
    const isPngExtension = file.name.toLowerCase().endsWith('.png');

    if (!isPngMime && !isPngExtension) {
        throw new Error('Logo must be a PNG file.');
    }
}

async function uploadLogo(slug: string, file: File): Promise<TemplateAsset> {
    const gcsPath = buildGcsPath(slug);
    const storageRef = ref(storage, gcsPath);

    await uploadBytes(storageRef, file, {
        contentType: 'image/png',
    });

    return {
        type: 'image',
        gcs_path: gcsPath,
        path: buildAssetPath(slug),
    };
}

export async function listTemplates(): Promise<FirestoreTemplateDoc[]> {
    const snap = await getDocs(collection(db, TEMPLATES_COL));

    return snap.docs.map((templateDoc) => ({
        ...templateDoc.data(),
        _docId: templateDoc.id,
    })) as FirestoreTemplateDoc[];
}

export async function getTemplate(docId: string): Promise<FirestoreTemplateDoc | null> {
    const snap = await getDoc(doc(db, TEMPLATES_COL, docId));

    if (!snap.exists()) {
        return null;
    }

    return { ...snap.data(), _docId: snap.id } as FirestoreTemplateDoc;
}

export async function createTemplate(formData: TemplateFormData): Promise<string> {
    const slug = normalizeSlug(formData.slug);

    if (!slug) {
        throw new Error('Template key is required.');
    }

    if (!formData.logoFile) {
        throw new Error('Logo PNG is required.');
    }

    validateLogoFile(formData.logoFile);

    const canvas = normalizeCanvas(formData.canvas);
    const styles = normalizeStyles(formData.styles);
    const logoAsset = await uploadLogo(slug, formData.logoFile);
    const docId = buildTemplateDocId(slug);

    const templateData: FirestoreTemplate = {
        id: buildTemplateRef(slug),
        template_version: '1.0',
        name: formatTemplateName(slug),
        canvas,
        zones: buildDefaultZones(canvas),
        styles,
        assets: {
            logo_mark: logoAsset,
        },
    };

    await setDoc(doc(db, TEMPLATES_COL, docId), templateData);

    return docId;
}

export async function deleteTemplate(docId: string): Promise<void> {
    const template = await getTemplate(docId);
    const logoPath = template?.assets?.logo_mark?.gcs_path;

    if (logoPath) {
        try {
            await deleteObject(ref(storage, logoPath));
        } catch {
            // Ignore missing asset/delete race and continue deleting doc.
        }
    }

    await deleteDoc(doc(db, TEMPLATES_COL, docId));
}
