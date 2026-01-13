'use client';

import { motion } from 'framer-motion';
import { usePages } from '@/hooks/usePages';
import { Page } from '@/types/job';
import { cn } from '@/lib/utils';
import { staggerContainer, listItemVariants } from '@/lib/animations';
import styles from './TemplateSelector.module.css';

interface TemplateSelectorProps {
    selectedPages: string[];
    onToggle: (pageId: string) => void;
    error?: string;
}

export function TemplateSelector({ selectedPages, onToggle, error }: TemplateSelectorProps) {
    const { pages, isLoading, error: fetchError } = usePages();

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Select Templates</h3>
                </div>
                <div className={styles.grid}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className={styles.skeleton} />
                    ))}
                </div>
            </div>
        );
    }

    // Group pages by category
    const groupedPages = pages.reduce((acc, page) => {
        const category = page.category || 'Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(page);
        return acc;
    }, {} as Record<string, Page[]>);

    return (
        <motion.div
            className={styles.container}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
        >
            <div className={styles.header}>
                <h3 className={styles.title}>Select Templates</h3>
                <p className={styles.subtitle}>
                    Choose one or more templates for your clips
                </p>
                {selectedPages.length > 0 && (
                    <span className={styles.selectedCount}>
                        {selectedPages.length} selected
                    </span>
                )}
            </div>

            {error && <div className={styles.error}>{error}</div>}
            {fetchError && <div className={styles.warning}>Using demo templates</div>}

            {Object.entries(groupedPages).map(([category, categoryPages]) => (
                <div key={category} className={styles.categorySection}>
                    <h4 className={styles.categoryTitle}>{category}</h4>
                    <motion.div
                        className={styles.grid}
                        variants={staggerContainer}
                        initial="initial"
                        animate="animate"
                    >
                        {categoryPages.map((page) => {
                            const isSelected = selectedPages.includes(page.id);
                            return (
                                <motion.button
                                    key={page.id}
                                    type="button"
                                    className={cn(
                                        styles.card,
                                        isSelected && styles.cardSelected
                                    )}
                                    onClick={() => onToggle(page.id)}
                                    variants={listItemVariants}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className={styles.cardPreview}>
                                        {page.thumbnailUrl ? (
                                            <img src={page.thumbnailUrl} alt={page.name} />
                                        ) : (
                                            <div className={styles.cardPlaceholder}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                                    <path d="M3 15l6-6 3 3 6-6" />
                                                    <circle cx="17" cy="7" r="1.5" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.cardInfo}>
                                        <span className={styles.cardName}>{page.name}</span>
                                        {page.description && (
                                            <span className={styles.cardDesc}>{page.description}</span>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <div className={styles.checkmark}>
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                            </svg>
                                        </div>
                                    )}
                                </motion.button>
                            );
                        })}
                    </motion.div>
                </div>
            ))}
        </motion.div>
    );
}
