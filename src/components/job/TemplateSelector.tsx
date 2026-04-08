'use client';

import { useState, useMemo } from 'react';
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
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Derive unique tags across all templates
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const t of templates) {
      for (const tag of t.show_tags ?? []) {
        const key = tag.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tags.push(tag);
        }
      }
    }
    return tags;
  }, [templates]);

  // Filter templates by active tag
  const filteredTemplates = useMemo(() => {
    if (!activeTag) return templates;
    const key = activeTag.toLowerCase();
    return templates.filter(t =>
      (t.show_tags ?? []).some(tag => tag.toLowerCase() === key)
    );
  }, [templates, activeTag]);

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

  // Group filtered templates by category
  const groupedTemplates = filteredTemplates.reduce(
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

      {allTags.length > 0 && (
        <div className={styles.tagFilterBar}>
          <button
            type="button"
            className={cn(styles.tagPill, !activeTag && styles.tagPillActive)}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              type="button"
              className={cn(
                styles.tagPill,
                activeTag?.toLowerCase() === tag.toLowerCase() && styles.tagPillActive
              )}
              onClick={() =>
                setActiveTag(prev =>
                  prev?.toLowerCase() === tag.toLowerCase() ? null : tag
                )
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}

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
                <motion.div
                  key={template.template_ref}
                  className={cn(styles.avatarCard, isSelected && styles.avatarSelected)}
                  onClick={() => onSelect(template.template_ref)}
                  title={`${template.name} - ${template.description || 'Standard Sequence'}`}
                  variants={listItemVariants}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className={styles.avatar}>
                    {template.thumbnailUrl ? (
                      <Image
                        src={template.thumbnailUrl}
                        alt={template.name}
                        width={50}
                        height={50}
                        unoptimized
                        className={styles.thumbnailImage}
                      />
                    ) : (
                      <div className={styles.typographicAnchor}>
                        {template.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className={styles.avatarLabel}>{template.name}</span>
                  {isSelected && (
                    <div className={styles.checkmark}>
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      ))}
    </motion.div>
  );
}
