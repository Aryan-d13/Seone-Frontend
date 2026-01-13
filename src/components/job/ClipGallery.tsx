'use client';

import { motion } from 'framer-motion';
import { useJobStore } from '@/stores/job';
import { getMediaUrl } from '@/lib/config';
import { staggerContainer, listItemVariants } from '@/lib/animations';
import { Button } from '@/components/ui/Button';
import styles from './ClipGallery.module.css';

export function ClipGallery() {
    const job = useJobStore(state => state.job);
    const liveClips = useJobStore(state => state.liveClips);

    // Prioritize liveClips if present (incremental updates), otherwise fall back to job output
    const clips = liveClips.length > 0 ? liveClips : (job?.output?.clips || []);

    if (clips.length === 0) return null;

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
                {clips.map((clip) => {
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
                            <div className={styles.actions}>
                                <div className={styles.info}>
                                    <span className={styles.filename}>{clip.filename}</span>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => window.open(videoUrl, '_blank')}
                                >
                                    Download
                                </Button>
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>
        </div>
    );
}
