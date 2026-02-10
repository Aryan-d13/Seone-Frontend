'use client';

import { useState, useEffect } from 'react';
import { Template } from '@/types/job';
import { authFetch } from '@/services/auth';
import { endpoints } from '@/lib/config';

/**
 * API response shape from GET /api/v1/pages (renderer v1).
 */
interface TemplatesResponse {
    templates: Template[];
    total: number;
}

// Simple in-memory cache
let templatesCache: Template[] | null = null;

/**
 * Hook to fetch available templates from backend.
 * Returns templates with template_ref as the canonical identifier.
 */
export function useTemplates() {
    const [templates, setTemplates] = useState<Template[]>(templatesCache || []);
    const [isLoading, setIsLoading] = useState(!templatesCache);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (templatesCache) {
            setIsLoading(false);
            return;
        }

        async function fetchTemplates() {
            try {
                const response = await authFetch(endpoints.pages.list);
                if (!response.ok) throw new Error('Failed to load templates');

                const data: TemplatesResponse | Template[] | { pages?: Template[] } = await response.json();

                // Handle multiple response shapes for backwards compatibility
                let fetchedTemplates: Template[];
                if ('templates' in data && Array.isArray(data.templates)) {
                    // New API shape: { templates: [...], total: N }
                    fetchedTemplates = data.templates;
                } else if ('pages' in data && Array.isArray(data.pages)) {
                    // Legacy shape: { pages: [...] }
                    fetchedTemplates = (data.pages as unknown[]).map((p: unknown) => {
                        const page = p as { template_ref?: string; slug?: string; name?: string };
                        return {
                            ...page,
                            template_ref: page.template_ref || page.slug || '',
                        };
                    }) as Template[];
                } else if (Array.isArray(data)) {
                    // Direct array
                    fetchedTemplates = data as Template[];
                } else {
                    throw new Error('Unexpected API response shape');
                }

                templatesCache = fetchedTemplates;
                setTemplates(fetchedTemplates);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch templates:', err);
                setError(err instanceof Error ? err.message : 'Failed to load templates');

                // Fallback mock data for development if API fails
                const mockTemplates: Template[] = [
                    { template_ref: 'modern-minimal/v1', name: 'Modern Minimal', slug: 'modern-minimal', category: 'Trending', aspect_ratio: '9:16' },
                    { template_ref: 'bold-creator/v1', name: 'Bold Creator', slug: 'bold-creator', category: 'Trending', aspect_ratio: '9:16' },
                    { template_ref: 'viral-hook/v1', name: 'Viral Hook', slug: 'viral-hook', category: 'Engagement', aspect_ratio: '9:16' },
                    { template_ref: 'story-time/v1', name: 'Story Time', slug: 'story-time', category: 'Engagement', aspect_ratio: '9:16' },
                    { template_ref: 'educational/v1', name: 'Educational', slug: 'educational', category: 'Educational', aspect_ratio: '1:1' },
                    { template_ref: 'entertainment/v1', name: 'Entertainment', slug: 'entertainment', category: 'Entertainment', aspect_ratio: '9:16' },
                ];
                // Don't cache mock data permanently, but set it for UI
                setTemplates(mockTemplates);
            } finally {
                setIsLoading(false);
            }
        }

        fetchTemplates();
    }, []);

    return { templates, isLoading, error };
}

/**
 * @deprecated Use useTemplates instead. This hook maintains backwards compatibility.
 */
export function usePages() {
    const { templates, isLoading, error } = useTemplates();

    // Map templates to legacy Page format for backwards compatibility
    const pages = templates.map(t => ({
        id: t.template_ref,
        name: t.name,
        slug: t.slug,
        description: t.description,
        thumbnailUrl: t.thumbnailUrl,
        category: t.category,
    }));

    return { pages, isLoading, error };
}
