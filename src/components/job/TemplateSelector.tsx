'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { useTemplates } from '@/hooks/useTemplates';
import { Template } from '@/types/job';
import { cn } from '@/lib/utils';
import { staggerContainer, listItemVariants } from '@/lib/animations';
import styles from './TemplateSelector.module.css';

interface TemplateSelectorProps {
  selectedTemplate: string | null; // template_ref
  onSelect: (templateRef: string) => void;
  error?: string;
}

export function TemplateSelector({
  selectedTemplate,
  onSelect,
  error,
}: TemplateSelectorProps) {
  const { templates, isLoading, error: fetchError } = useTemplates();

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Select Template</h3>
        </div>
        <div className={styles.grid}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      </div>
    );
  }

  // Group templates by category
  const groupedTemplates = templates.reduce(
    (acc, template) => {
      const category = template.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(template);
      return acc;
    },
    {} as Record<string, Template[]>
  );

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>Select Template</h3>
        <p className={styles.subtitle}>Choose a template for your clips</p>
        {selectedTemplate && <span className={styles.selectedCount}>1 selected</span>}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {fetchError && <div className={styles.warning}>Using demo templates</div>}

      {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
        <div key={category} className={styles.categorySection}>
          <h4 className={styles.categoryTitle}>{category}</h4>
          <motion.div
            className={styles.grid}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {categoryTemplates.map(template => {
              const isSelected = selectedTemplate === template.template_ref;
              return (
                <motion.button
                  key={template.template_ref}
                  type="button"
                  className={cn(styles.card, isSelected && styles.cardSelected)}
                  onClick={() => onSelect(template.template_ref)}
                  variants={listItemVariants}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={styles.cardPreview}>
                    {template.thumbnailUrl ? (
                      <Image src={template.thumbnailUrl} alt={template.name} width={200} height={150} unoptimized />
                    ) : (
                      <div className={styles.cardPlaceholder}>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 15l6-6 3 3 6-6" />
                          <circle cx="17" cy="7" r="1.5" />
                        </svg>
                      </div>
                    )}
                    {template.aspect_ratio && (
                      <span className={styles.aspectRatio}>{template.aspect_ratio}</span>
                    )}
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardName}>{template.name}</span>
                    {template.description && (
                      <span className={styles.cardDesc}>{template.description}</span>
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
