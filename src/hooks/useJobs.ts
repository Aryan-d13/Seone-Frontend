'use client';

import { useState, useCallback, useEffect } from 'react';
import { Job } from '@/types';
import { authFetch } from '@/services/auth';
import { endpoints } from '@/lib/config';

interface UseJobsOptions {
  initialPage?: number;
  pageSize?: number;
  status?: string;
}

interface JobsState {
  items: Job[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
}

interface NormalizedJobsResponse {
  items: Job[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const readNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    typeof value === 'string' &&
    value.trim() !== '' &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return fallback;
};

const readBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
};

const normalizeJobsResponse = (
  raw: unknown,
  fallbackPageSize: number
): NormalizedJobsResponse => {
  const payload = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;

  let items: Job[] = [];
  if (Array.isArray(payload)) {
    items = payload as Job[];
  } else if (isRecord(payload)) {
    const rawItems = payload.items ?? payload.jobs ?? payload.results ?? payload.data;
    if (Array.isArray(rawItems)) {
      items = rawItems as Job[];
    }
  }

  const total = readNumber(
    isRecord(payload)
      ? (payload.total ?? payload.total_items ?? payload.count ?? payload.totalCount)
      : undefined,
    items.length
  );
  const page = readNumber(
    isRecord(payload)
      ? (payload.page ?? payload.current_page ?? payload.pageNumber)
      : undefined,
    1
  );
  const pageSize = readNumber(
    isRecord(payload)
      ? (payload.pageSize ?? payload.page_size ?? payload.per_page ?? payload.limit)
      : undefined,
    fallbackPageSize
  );
  const explicitHasMore = readBoolean(
    isRecord(payload) ? (payload.hasMore ?? payload.has_more) : undefined
  );
  const computedHasMore = total > 0 ? page * pageSize < total : items.length >= pageSize;

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: explicitHasMore ?? computedHasMore,
  };
};

export function useJobs({ initialPage = 1, pageSize = 10, status }: UseJobsOptions = {}) {
  const [state, setState] = useState<JobsState>({
    items: [],
    total: 0,
    page: initialPage,
    pageSize,
    hasMore: false,
    isLoading: true,
    error: null,
  });

  const fetchJobs = useCallback(
    async (page: number, isRefresh = false) => {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const queryParams = new URLSearchParams({
          page: page.toString(),
          per_page: pageSize.toString(),
          ...(status ? { status } : {}),
        });

        const response = await authFetch(
          `${endpoints.jobs.list}?${queryParams.toString()}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch jobs');
        }

        const raw = await response.json();
        const data = normalizeJobsResponse(raw, pageSize);

        setState(prev => ({
          items: isRefresh ? data.items : [...prev.items, ...data.items], // Append for infinite scroll, replace for refresh
          total: data.total,
          page: data.page,
          pageSize: data.pageSize,
          hasMore: data.hasMore,
          isLoading: false,
          error: null,
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch jobs',
        }));
      }
    },
    [pageSize, status]
  );

  // Initial fetch
  useEffect(() => {
    fetchJobs(initialPage, true);
  }, [fetchJobs, initialPage]);

  const loadMore = useCallback(() => {
    if (!state.isLoading && state.hasMore) {
      fetchJobs(state.page + 1);
    }
  }, [state.isLoading, state.hasMore, state.page, fetchJobs]);

  const refresh = useCallback(() => {
    fetchJobs(1, true);
  }, [fetchJobs]);

  return {
    ...state,
    items: state.items ?? [], // Defense-in-depth: ensure items is always an array
    loadMore,
    refresh,
  };
}
