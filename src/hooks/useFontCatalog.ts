'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/services/auth';
import { endpoints } from '@/lib/config';
import type { FontCatalogEntry, FontCatalogResponse } from '@/types/fonts';

let fontCatalogCache: FontCatalogEntry[] | null = null;

export function useFontCatalog() {
  const [fonts, setFonts] = useState<FontCatalogEntry[]>(fontCatalogCache || []);
  const [isLoading, setIsLoading] = useState(!fontCatalogCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fontCatalogCache) {
      setIsLoading(false);
      return;
    }

    async function fetchFonts() {
      try {
        const response = await authFetch(endpoints.pages.fonts);
        if (!response.ok) {
          throw new Error(`Failed to load fonts (${response.status})`);
        }
        const payload = (await response.json()) as FontCatalogResponse;
        const nextFonts = Array.isArray(payload.fonts) ? payload.fonts : [];
        fontCatalogCache = nextFonts;
        setFonts(nextFonts);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fonts');
      } finally {
        setIsLoading(false);
      }
    }

    void fetchFonts();
  }, []);

  return { fonts, isLoading, error };
}
