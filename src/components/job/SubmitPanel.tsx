'use client';

import { motion } from 'framer-motion';
import { Input } from '@/components/ui';
import { DualRangeSlider } from '@/components/ui/DualRangeSlider';
import {
  SubmissionFormData,
  FormErrors,
  DURATION_MIN,
  DURATION_MAX,
  CLIP_COUNT_MIN,
  CLIP_COUNT_MAX,
} from '@/types/job';
import { formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';
import styles from './SubmitPanel.module.css';

interface SubmitPanelProps {
  formData: SubmissionFormData;
  errors: FormErrors;
  onUpdateField: <K extends keyof SubmissionFormData>(
    field: K,
    value: SubmissionFormData[K]
  ) => void;
}

const contentLanguageOptions = [
  { value: 'hi', label: 'Hindi' },
  { value: 'en', label: 'English' },
  { value: 'auto', label: 'Auto-detect' },
];

const copyLanguageOptions = [
  { value: 'hi', label: 'Hindi' },
  { value: 'en', label: 'English' },
];

export function SubmitPanel({ formData, errors, onUpdateField }: SubmitPanelProps) {
  return (
    <motion.div
      className={styles.panel}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Create New Job</h2>
        <p className={styles.description}>
          Enter a YouTube URL and configure your clip settings
        </p>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <Input
            label="YouTube URL"
            placeholder="https://youtube.com/watch?v=..."
            value={formData.youtubeUrl}
            onChange={e => onUpdateField('youtubeUrl', e.target.value)}
            error={errors.youtubeUrl}
            leftIcon={
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            }
          />
        </div>

        <div className={styles.field}>
          <DualRangeSlider
            label="Clip Duration Range"
            min={DURATION_MIN}
            max={DURATION_MAX}
            minValue={formData.minDuration}
            maxValue={formData.maxDuration}
            step={15}
            formatValue={formatDuration}
            onChange={(min, max) => {
              onUpdateField('minDuration', min);
              onUpdateField('maxDuration', max);
            }}
          />
          {errors.duration && <span className={styles.error}>{errors.duration}</span>}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Number of Clips</label>
          <div className={styles.clipCounter}>
            <button
              type="button"
              className={styles.counterBtn}
              onClick={() =>
                onUpdateField(
                  'clipCount',
                  Math.max(CLIP_COUNT_MIN, formData.clipCount - 1)
                )
              }
              disabled={formData.clipCount <= CLIP_COUNT_MIN}
            >
              -
            </button>
            <span className={styles.counterValue}>{formData.clipCount}</span>
            <button
              type="button"
              className={styles.counterBtn}
              onClick={() =>
                onUpdateField(
                  'clipCount',
                  Math.min(CLIP_COUNT_MAX, formData.clipCount + 1)
                )
              }
              disabled={formData.clipCount >= CLIP_COUNT_MAX}
            >
              +
            </button>
          </div>
          {errors.clipCount && <span className={styles.error}>{errors.clipCount}</span>}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Content Language (Input)</label>
          <div className={styles.optionGroup}>
            {contentLanguageOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  styles.optionBtn,
                  formData.language === option.value && styles.optionActive
                )}
                onClick={() =>
                  onUpdateField('language', option.value as typeof formData.language)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Copy Language (Output)</label>
          <div className={styles.optionGroup}>
            {copyLanguageOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  styles.optionBtn,
                  formData.copyLanguage === option.value && styles.optionActive
                )}
                onClick={() => onUpdateField('copyLanguage', option.value as 'hi' | 'en')}
              >
                {option.label}
              </button>
            ))}
          </div>
          {errors.copyLanguage && (
            <span className={styles.error}>{errors.copyLanguage}</span>
          )}
        </div>

        {errors.general && <div className={styles.generalError}>{errors.general}</div>}
      </div>
    </motion.div>
  );
}
