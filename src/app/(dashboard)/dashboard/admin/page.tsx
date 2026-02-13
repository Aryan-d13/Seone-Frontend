'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import {
    onFirebaseAuthChange,
    signInWithFirebase,
    signOutFirebase,
    type FirebaseUser,
} from '@/config/firebase';
import {
    createTemplate,
    deleteTemplate,
    listTemplates,
    normalizeSlug,
    type FirestoreTemplateDoc,
} from '@/services/admin';
import { DEFAULT_FORM_DATA, type TemplateFormData } from '@/types/admin';
import styles from './page.module.css';

function cloneDefaultFormData(): TemplateFormData {
    return {
        slug: '',
        canvas: { ...DEFAULT_FORM_DATA.canvas },
        styles: {
            title_style: { ...DEFAULT_FORM_DATA.styles.title_style },
        },
        logoFile: null,
        logoPreview: null,
    };
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Something went wrong. Please try again.';
}

function isPng(file: File): boolean {
    return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
}

export default function AdminPage() {
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [isAuthLoading, setIsAuthLoading] = useState(false);

    const [formData, setFormData] = useState<TemplateFormData>(() => cloneDefaultFormData());
    const [templates, setTemplates] = useState<FirestoreTemplateDoc[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onFirebaseAuthChange((user) => {
            setFirebaseUser(user);
            setAuthReady(true);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        return () => {
            if (formData.logoPreview) {
                URL.revokeObjectURL(formData.logoPreview);
            }
        };
    }, [formData.logoPreview]);

    const loadTemplates = useCallback(async () => {
        if (!firebaseUser) {
            setTemplates([]);
            return;
        }

        setIsLoadingTemplates(true);

        try {
            const docs = await listTemplates();
            setTemplates(docs);
        } catch (loadError) {
            setError(getErrorMessage(loadError));
        } finally {
            setIsLoadingTemplates(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        if (!firebaseUser) {
            setTemplates([]);
            return;
        }

        void loadTemplates();
    }, [firebaseUser, loadTemplates]);

    const sortedTemplates = useMemo(() => {
        return [...templates].sort((left, right) => {
            const leftLabel = (left.name || left._docId).trim();
            const rightLabel = (right.name || right._docId).trim();

            return leftLabel.localeCompare(rightLabel);
        });
    }, [templates]);

    const handleConnect = async () => {
        setError(null);
        setSuccess(null);
        setIsAuthLoading(true);

        try {
            await signInWithFirebase();
        } catch (connectError) {
            setError(getErrorMessage(connectError));
        } finally {
            setIsAuthLoading(false);
        }
    };

    const handleDisconnect = async () => {
        setError(null);
        setSuccess(null);
        setIsAuthLoading(true);

        try {
            await signOutFirebase();
            setTemplates([]);
        } catch (disconnectError) {
            setError(getErrorMessage(disconnectError));
        } finally {
            setIsAuthLoading(false);
        }
    };

    const handleSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
        const slug = normalizeSlug(event.target.value);
        setFormData((prev) => ({ ...prev, slug }));
    };

    const handleCanvasChange = (key: 'width' | 'height') => (
        event: ChangeEvent<HTMLInputElement>
    ) => {
        const value = Number.parseInt(event.target.value, 10);
        const nextValue = Number.isFinite(value) ? value : 0;

        setFormData((prev) => ({
            ...prev,
            canvas: {
                ...prev.canvas,
                [key]: nextValue,
            },
        }));
    };

    const handleColorChange = (key: 'bg_fill' | 'fill') => (
        event: ChangeEvent<HTMLInputElement>
    ) => {
        const value = event.target.value;
        setFormData((prev) => ({
            ...prev,
            styles: {
                title_style: {
                    ...prev.styles.title_style,
                    [key]: value,
                },
            },
        }));
    };

    const handleLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextFile = event.target.files?.[0] ?? null;

        if (nextFile && !isPng(nextFile)) {
            setError('Logo must be a PNG file.');
            event.target.value = '';
            return;
        }

        setError(null);

        setFormData((prev) => {
            if (prev.logoPreview) {
                URL.revokeObjectURL(prev.logoPreview);
            }

            return {
                ...prev,
                logoFile: nextFile,
                logoPreview: nextFile ? URL.createObjectURL(nextFile) : null,
            };
        });
    };

    const resetForm = () => {
        setFormData((prev) => {
            if (prev.logoPreview) {
                URL.revokeObjectURL(prev.logoPreview);
            }

            return cloneDefaultFormData();
        });
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        if (!firebaseUser) {
            setError('Connect Firebase before seeding.');
            return;
        }

        if (!formData.slug) {
            setError('Template key is required.');
            return;
        }

        if (!formData.logoFile) {
            setError('Logo PNG is required.');
            return;
        }

        if (formData.canvas.width <= 0 || formData.canvas.height <= 0) {
            setError('Canvas width and height must be greater than 0.');
            return;
        }

        setIsSubmitting(true);

        try {
            const docId = await createTemplate(formData);
            setSuccess(`Seed completed: ${docId}`);
            resetForm();
            await loadTemplates();
        } catch (submitError) {
            setError(getErrorMessage(submitError));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (docId: string) => {
        const shouldDelete = window.confirm(`Delete template "${docId}"?`);

        if (!shouldDelete) {
            return;
        }

        setError(null);
        setSuccess(null);

        try {
            await deleteTemplate(docId);
            setSuccess(`Deleted: ${docId}`);
            await loadTemplates();
        } catch (deleteError) {
            setError(getErrorMessage(deleteError));
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>Admin Panel</h1>
                <p className={styles.subtitle}>
                    Seed a template in one step: logo, canvas size, title colors.
                </p>
            </div>

            <section className={styles.panel}>
                <div className={styles.panelHeader}>
                    <h2>Firebase Access</h2>
                </div>
                <div className={styles.statusRow}>
                    {authReady && firebaseUser ? (
                        <p className={styles.connected}>Connected as {firebaseUser.email}</p>
                    ) : (
                        <p className={styles.muted}>Sign in to write Firestore and Storage.</p>
                    )}
                    {firebaseUser ? (
                        <Button
                            variant="secondary"
                            onClick={handleDisconnect}
                            isLoading={isAuthLoading}
                        >
                            Disconnect
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            onClick={handleConnect}
                            isLoading={isAuthLoading}
                            disabled={!authReady}
                        >
                            Connect Firebase
                        </Button>
                    )}
                </div>
            </section>

            {error && <div className={styles.error}>{error}</div>}
            {success && <div className={styles.success}>{success}</div>}

            <div className={styles.grid}>
                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2>Seed Template</h2>
                    </div>
                    <form className={styles.form} onSubmit={handleSubmit}>
                        <div className={styles.field}>
                            <label htmlFor="seed-slug" className={styles.label}>Template Key</label>
                            <input
                                id="seed-slug"
                                className={styles.input}
                                value={formData.slug}
                                onChange={handleSlugChange}
                                placeholder="kappu-v1"
                                autoComplete="off"
                                required
                            />
                            <p className={styles.muted}>
                                Used for Firestore id and storage path.
                            </p>
                        </div>

                        <div className={styles.twoCol}>
                            <div className={styles.field}>
                                <label htmlFor="canvas-width" className={styles.label}>Canvas Width</label>
                                <input
                                    id="canvas-width"
                                    type="number"
                                    min={1}
                                    className={styles.input}
                                    value={formData.canvas.width}
                                    onChange={handleCanvasChange('width')}
                                    required
                                />
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="canvas-height" className={styles.label}>Canvas Height</label>
                                <input
                                    id="canvas-height"
                                    type="number"
                                    min={1}
                                    className={styles.input}
                                    value={formData.canvas.height}
                                    onChange={handleCanvasChange('height')}
                                    required
                                />
                            </div>
                        </div>

                        <div className={styles.twoCol}>
                            <div className={styles.field}>
                                <label htmlFor="bg-fill" className={styles.label}>Title Background</label>
                                <input
                                    id="bg-fill"
                                    type="color"
                                    className={styles.colorInput}
                                    value={formData.styles.title_style.bg_fill}
                                    onChange={handleColorChange('bg_fill')}
                                />
                            </div>
                            <div className={styles.field}>
                                <label htmlFor="text-fill" className={styles.label}>Title Text Fill</label>
                                <input
                                    id="text-fill"
                                    type="color"
                                    className={styles.colorInput}
                                    value={formData.styles.title_style.fill}
                                    onChange={handleColorChange('fill')}
                                />
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="logo-file" className={styles.label}>Logo PNG</label>
                            <input
                                id="logo-file"
                                type="file"
                                accept="image/png"
                                className={styles.fileInput}
                                onChange={handleLogoChange}
                                required
                            />
                            <p className={styles.muted}>
                                Uploaded as <code>logo.png</code> to <code>templates/&lt;key&gt;/assets/</code>.
                            </p>
                        </div>

                        {formData.logoPreview && (
                            <div className={styles.logoPreview}>
                                <span className={styles.label}>Preview</span>
                                <img src={formData.logoPreview} alt="Logo preview" />
                            </div>
                        )}

                        <div className={styles.actions}>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={resetForm}
                                disabled={isSubmitting}
                            >
                                Reset
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                isLoading={isSubmitting}
                                disabled={!firebaseUser}
                            >
                                Seed Template
                            </Button>
                        </div>
                    </form>
                </section>

                <section className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2>Seeded Templates</h2>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void loadTemplates()}
                            disabled={!firebaseUser || isLoadingTemplates}
                        >
                            Refresh
                        </Button>
                    </div>

                    {!firebaseUser && (
                        <p className={styles.muted}>Connect Firebase to list templates.</p>
                    )}

                    {firebaseUser && isLoadingTemplates && (
                        <p className={styles.muted}>Loading templates...</p>
                    )}

                    {firebaseUser && !isLoadingTemplates && sortedTemplates.length === 0 && (
                        <p className={styles.muted}>No templates found.</p>
                    )}

                    {firebaseUser && !isLoadingTemplates && sortedTemplates.length > 0 && (
                        <div className={styles.list}>
                            {sortedTemplates.map((template) => (
                                <article key={template._docId} className={styles.listItem}>
                                    <div className={styles.itemInfo}>
                                        <h3>{template.name || template._docId}</h3>
                                        <p className={styles.itemMeta}>
                                            doc: <code>{template._docId}</code>
                                        </p>
                                        <p className={styles.itemMeta}>
                                            ref: <code>{template.id}</code>
                                        </p>
                                    </div>
                                    <div className={styles.itemActions}>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => void handleDelete(template._docId)}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
