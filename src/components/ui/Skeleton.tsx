import { cn } from '@/lib/utils';
import styles from './Skeleton.module.css';

interface SkeletonProps {
    className?: string;
    variant?: 'rect' | 'circle' | 'text';
    width?: string | number;
    height?: string | number;
}

export function Skeleton({
    className,
    variant = 'rect',
    width,
    height
}: SkeletonProps) {
    return (
        <div
            className={cn(
                styles.skeleton,
                styles[variant],
                className
            )}
            style={{
                width: typeof width === 'number' ? `${width}px` : width,
                height: typeof height === 'number' ? `${height}px` : height
            }}
        />
    );
}
