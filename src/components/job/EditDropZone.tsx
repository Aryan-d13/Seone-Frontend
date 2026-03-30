'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { openClipStudioTab, type StudioDragPayload } from '@/features/editor/lib/routes';
import styles from './EditDropZone.module.css';

/**
 * Fixed-position drop target that routes a generated clip into the in-app studio.
 */
function readStudioDragPayload(
  dataTransfer: DataTransfer | null
): StudioDragPayload | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData('text/x-seone-clip');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StudioDragPayload>;
    if (
      typeof parsed.jobId === 'string' &&
      typeof parsed.clipIndex === 'number' &&
      typeof parsed.url === 'string' &&
      typeof parsed.filename === 'string'
    ) {
      return parsed as StudioDragPayload;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * A fixed-position drop target that becomes visible whenever the user
 * drags a clip card. On drop, routes into the internal Seone studio.
 */
export function EditDropZone() {
  const [visible, setVisible] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── Global drag listeners: show/hide the zone ──

  useEffect(() => {
    let depth = 0;

    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('text/x-seone-clip')) return;
      depth++;
      if (depth === 1) setVisible(true);
    };

    const onLeave = () => {
      depth--;
      if (depth <= 0) {
        depth = 0;
        setVisible(false);
        setDragOver(false);
      }
    };

    const onDrop = () => {
      depth = 0;
      requestAnimationFrame(() => {
        setVisible(false);
        setDragOver(false);
      });
    };

    const onEnd = () => {
      depth = 0;
      setVisible(false);
      setDragOver(false);
    };

    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', onEnd);

    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragend', onEnd);
    };
  }, []);

  // ── Zone-specific handlers ──

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const payload = readStudioDragPayload(e.dataTransfer);
    if (!payload) return;

    openClipStudioTab(payload.jobId, payload.clipIndex);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <motion.div
            className={`${styles.zone} ${dragOver ? styles.dragOver : ''}`}
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={styles.zoneIcon}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <span className={styles.zoneLabel}>
              {dragOver ? 'Release to edit' : 'Open in Studio'}
            </span>
            <span className={styles.zoneSublabel}>Keeps editing inside Seone</span>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
