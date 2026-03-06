'use client';

import { forwardRef, useRef } from 'react';
import styles from './DualRangeSlider.module.css';
import { cn } from '@/lib/utils';

interface DualRangeSliderProps {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  step?: number;
  label?: string;
  formatValue?: (value: number) => string;
  onChange: (min: number, max: number) => void;
  className?: string;
}

export const DualRangeSlider = forwardRef<HTMLDivElement, DualRangeSliderProps>(
  (
    { min, max, minValue, maxValue, step = 1, label, formatValue, onChange, className },
    ref
  ) => {
    const trackRef = useRef<HTMLDivElement>(null);

    // Default formatter
    const format = formatValue || (v => `${v}s`);

    // Calculate percentages
    const minPercent = ((minValue - min) / (max - min)) * 100;
    const maxPercent = ((maxValue - min) / (max - min)) * 100;

    const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMin = Math.min(Number(e.target.value), maxValue - step);
      onChange(newMin, maxValue);
    };

    const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMax = Math.max(Number(e.target.value), minValue + step);
      onChange(minValue, newMax);
    };

    return (
      <div ref={ref} className={cn(styles.container, className)}>
        {label && <label className={styles.label}>{label}</label>}

        <div className={styles.sliderContainer}>
          <div className={styles.track} ref={trackRef}>
            <div
              className={styles.range}
              style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }}
            />
          </div>

          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={minValue}
            onChange={handleMinChange}
            className={cn(styles.thumb, styles.thumbMin)}
          />

          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={maxValue}
            onChange={handleMaxChange}
            className={cn(styles.thumb, styles.thumbMax)}
          />
        </div>

        <div className={styles.values}>
          <span className={styles.value}>{format(minValue)}</span>
          <span className={styles.separator}>—</span>
          <span className={styles.value}>{format(maxValue)}</span>
        </div>
      </div>
    );
  }
);

DualRangeSlider.displayName = 'DualRangeSlider';
