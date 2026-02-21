'use client';

import { motion } from 'framer-motion';
import { useJobStore } from '@/stores/job';
import { getMediaUrl } from '@/lib/config';
import { staggerContainer, listItemVariants } from '@/lib/animations';
import styles from './ClipGallery.module.css';

export function ClipGallery() {
  const job = useJobStore(state => state.job);
  const liveClips = useJobStore(state => state.liveClips);

  // Prioritize liveClips if present (incremental updates), otherwise fall back to job output
  const clips = liveClips.length > 0 ? liveClips : job?.output?.clips || [];

  if (clips.length === 0) {
    if (job?.status === 'failed' || job?.status === 'completed') {
      return (
        <div
          className={styles.emptyError}
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--error)',
            background: 'var(--error-bg)',
            borderRadius: 'var(--radius-md)',
            marginTop: '1rem',
          }}
        >
          <p>No clips were generated for this job.</p>
        </div>
      );
    }
    return null; // Still in-progress, no clips yet is normal
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Generated Clips</h3>
        <span className={styles.count}>{clips.length} clips ready</span>
      </div>

      <motion.div
        className={styles.grid}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {clips.map(clip => {
          const videoUrl = getMediaUrl(clip.url);

          return (
            <motion.div
              key={clip.index}
              className={styles.card}
              variants={listItemVariants}
            >
              <div className={styles.videoWrapper}>
                <video
                  src={videoUrl}
                  controls
                  className={styles.video}
                  preload="metadata"
                />
              </div>
              <div className={styles.overlay}>
                <div className={styles.overlayContent}>
                  <span className={styles.filename} title={clip.filename}>
                    {clip.filename}
                  </span>
                  <button
                    className={styles.downloadButton}
                    onClick={() => window.open(videoUrl, '_blank')}
                    title="Download Video"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
