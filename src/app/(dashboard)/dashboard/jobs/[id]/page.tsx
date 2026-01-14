'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useJobStore } from '@/stores/job';
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { authFetch } from '@/services/auth';
import { endpoints } from '@/lib/config';
import { PipelineTimeline } from '@/components/job/PipelineTimeline';
import { ClipGallery } from '@/components/job/ClipGallery';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

interface JobDetailPageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function JobDetailPage({ params }: JobDetailPageProps) {
    const router = useRouter();
    const { id } = use(params);
    const {
        job,
        isLoading,
        error: storeError,
        setJob,
        setError,
        setLoading,
        reset
    } = useJobStore();

    // Local state for initial fetch status to handle 403/404 explicitly
    const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [fetchError, setFetchError] = useState<{ code: number; message: string } | null>(null);

    // 1. REST First: Fetch job data
    useEffect(() => {
        // Clear previous job state before fetching new job
        reset();

        async function fetchJob() {
            setFetchStatus('loading');
            setLoading(true);
            try {
                const response = await authFetch(endpoints.jobs.get(id));

                if (!response.ok) {
                    const status = response.status;
                    if (status === 403) {
                        throw { code: 403, message: 'This job does not belong to you.' };
                    } else if (status === 404) {
                        throw { code: 404, message: 'Job not found.' };
                    } else {
                        throw { code: status, message: 'Failed to load job.' };
                    }
                }

                const data = await response.json();
                setJob(data);
                setFetchStatus('success');
            } catch (err: any) {
                console.error('Job fetch error:', err);
                const errorObj = err.code ? err : { code: 500, message: err.message || 'An error occurred' };
                setFetchError(errorObj);
                setError(errorObj.message);
                setFetchStatus('error');
            } finally {
                setLoading(false);
            }
        }

        fetchJob();
    }, [id, setJob, setError, setLoading, reset]);

    // 2. WebSocket: Connect ONLY if job exists and is active
    // We conditionally render the hook or pass a flag? 
    // Hooks can't be conditional. We pass the ID only if we want to connect.
    // If job is completed/failed, we don't need WS.
    const shouldConnect = fetchStatus === 'success' && job && job.status !== 'completed' && job.status !== 'failed';

    // We pass null to hook to disable connection if not needed
    useJobWebSocket(shouldConnect ? id : '');

    if (fetchStatus === 'loading') {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Loading job details...</p>
            </div>
        );
    }

    // 3. Ownership Boundary: Explicit Error UI
    if (fetchStatus === 'error' && fetchError) {
        return (
            <div className={styles.errorContainer}>
                <div className={styles.errorCard}>
                    <h2 className={styles.errorCode}>{fetchError.code}</h2>
                    <p className={styles.errorMessage}>{fetchError.message}</p>
                    <Button onClick={() => router.push('/dashboard/jobs')} variant="secondary">
                        Back to Jobs
                    </Button>
                </div>
            </div>
        );
    }

    if (!job) return null;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/dashboard/jobs')}
                        className={styles.backButton}
                    >
                        ← Back
                    </Button>
                    <h1 className={styles.title}>Job #{job.id.slice(0, 8)}</h1>
                </div>
                <div className={styles.headerRight}>
                    <span className={`${styles.status} ${styles[job.status]}`}>
                        {job.status}
                    </span>
                </div>
            </div>

            <div className={styles.content}>
                <PipelineTimeline />
                <ClipGallery />
            </div>
        </div>
    );
}
