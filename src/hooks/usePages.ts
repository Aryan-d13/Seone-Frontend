'use client';

import { useState, useEffect } from 'react';
import { Page } from '@/types/job';
import { authFetch } from '@/services/auth';
import { endpoints } from '@/lib/config';

// Simple in-memory cache
let pagesCache: Page[] | null = null;

export function usePages() {
    const [pages, setPages] = useState<Page[]>(pagesCache || []);
    const [isLoading, setIsLoading] = useState(!pagesCache);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (pagesCache) {
            setIsLoading(false);
            return;
        }

        async function fetchPages() {
            try {
                const response = await authFetch(endpoints.pages.list);
                if (!response.ok) throw new Error('Failed to load templates');

                const data = await response.json();
                const fetchedPages = data.pages || data;

                pagesCache = fetchedPages;
                setPages(fetchedPages);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch pages:', err);
                setError(err instanceof Error ? err.message : 'Failed to load templates');
                // Fallback mock data for development if API fails
                const mockPages: Page[] = [
                    { id: '1', name: 'Modern Minimal', slug: 'modern-minimal', category: 'Trending' },
                    { id: '2', name: 'Bold Creator', slug: 'bold-creator', category: 'Trending' },
                    { id: '3', name: 'Viral Hook', slug: 'viral-hook', category: 'Engagement' },
                    { id: '4', name: 'Story Time', slug: 'story-time', category: 'Engagement' },
                    { id: '5', name: 'Educational', slug: 'educational', category: 'Educational' },
                    { id: '6', name: 'Entertainment', slug: 'entertainment', category: 'Entertainment' },
                ];
                // Don't cache mock data permanently, but set it for UI
                setPages(mockPages);
            } finally {
                setIsLoading(false);
            }
        }

        fetchPages();
    }, []);

    return { pages, isLoading, error };
}
