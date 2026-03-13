'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useJobStore } from '@/stores/job';
import { getMediaUrl } from '@/lib/config';
import { staggerContainer, listItemVariants } from '@/lib/animations';
import { openPlugEdit } from './EditDropZone';
import { cn, formatDuration } from '@/lib/utils';
import styles from './ClipGallery.module.css';

interface ClipPlayerProps {
  url: string;
  filename: string;
  index: number;
}

function ClipPlayer({ url, filename, index }: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = (e: React.MouseEvent) => {
    // Prevent triggering play when clicking action buttons
    if ((e.target as HTMLElement).closest(`.${styles.overlayActions}`)) return;

    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;

    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <motion.div
      className={styles.card}
      variants={listItemVariants}
      draggable
      onDragStart={e => {
        const de = e as unknown as React.DragEvent;
        de.dataTransfer.setData('text/x-clip-url', url);
        de.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div className={styles.videoWrapper} onClick={togglePlay}>
        <video
          ref={videoRef}
          src={url}
          className={cn(styles.video, isFullscreen && styles.videoFullscreen)}
          preload="metadata"
          playsInline
          loop
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Play/Pause Overlay */}
        <div className={styles.playerOverlay}>
          {!isPlaying && (
            <div className={styles.playIcon}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      <div className={styles.overlay}>
        <div className={styles.overlayContent}>
          <span className={styles.filename} title={filename}>
            {filename}
          </span>
          <div className={styles.overlayActions}>
            <button
              className={styles.actionButton}
              onClick={toggleFullscreen}
              title="Fullscreen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
            <button
              className={styles.actionButton}
              onClick={() => openPlugEdit(url)}
              title="Edit in Plug & Edit"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
            <button
              className={styles.actionButton}
              onClick={() => window.open(url, '_blank')}
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
      </div>
    </motion.div>
  );
}

export function ClipGallery() {
  const job = useJobStore(state => state.job);
  const liveClips = useJobStore(state => state.liveClips);

  // Prioritize liveClips if present (incremental updates), otherwise fall back to job output
  const clips = liveClips.length > 0 ? liveClips : job?.output?.clips || [];

  if (clips.length === 0) {
    if (job?.status === 'failed' || job?.status === 'completed') {
      return (
        <div className={styles.emptyError}>
          <p>Sequence yielded zero clips.</p>
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
        {clips.map(clip => (
          <ClipPlayer
            key={clip.index}
            url={getMediaUrl(clip.url)}
            filename={clip.filename}
            index={clip.index}
          />
        ))}
      </motion.div>
    </div>
  );
}
