'use client';

import { useState, useCallback, useEffect } from 'react';
import { Job, PaginatedResponse } from '@/types';
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

    const fetchJobs = useCallback(async (page: number, isRefresh = false) => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                per_page: pageSize.toString(),
                ...(status ? { status } : {}),
            });

            const response = await authFetch(`${endpoints.jobs.list}?${queryParams.toString()}`);

            if (!response.ok) {
                throw new Error('Failed to fetch jobs');
            }

            const data: PaginatedResponse<Job> = await response.json();

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
    }, [pageSize, status]);

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
