'use client';

import { motion } from 'framer-motion';
import { SubmitPanel } from '@/components/job/SubmitPanel';
import { TemplateSelector } from '@/components/job/TemplateSelector';
import { useJobSubmit } from '@/hooks/useJobSubmit';
import { Button } from '@/components/ui';
import { pageVariants, pageTransition } from '@/lib/animations';
import styles from './page.module.css';

export default function NewJobPage() {
    const { formData, errors, state, updateField, togglePage, submit, reset } = useJobSubmit();

    return (
        <motion.div
            className={styles.page}
            initial="initial"
            animate="animate"
            variants={pageVariants}
            transition={pageTransition}
        >
            {/* Page Header */}
            <div className={styles.header}>
                <h1 className={styles.title}>New Job</h1>
                <p className={styles.subtitle}>
                    Create AI-powered clips from YouTube content
                </p>
            </div>

            {/* Two Column Layout */}
            <div className={styles.grid}>
                {/* Left: Submit Panel */}
                <div className={styles.column}>
                    <SubmitPanel
                        formData={formData}
                        errors={errors}
                        isSubmitting={state.isSubmitting}
                        onUpdateField={updateField}
                        onSubmit={submit}
                    />
                </div>

                {/* Right: Template Selector */}
                <div className={styles.column}>
                    <TemplateSelector
                        selectedPages={formData.selectedPages}
                        onToggle={togglePage}
                        error={errors.selectedPages}
                    />
                </div>
            </div>

            {/* Submit Button */}
            <div className={styles.actions}>
                {state.error && (
                    <div className={styles.submitError}>{state.error}</div>
                )}
                {Object.keys(errors).length > 0 && (
                    <div className={styles.submitError}>
                        {errors.selectedPages ? 'Please select a template' : 'Please fix the errors above'}
                    </div>
                )}
                <Button
                    variant="secondary"
                    onClick={reset}
                    disabled={state.isSubmitting}
                >
                    Reset
                </Button>
                <Button
                    variant="primary"
                    size="lg"
                    onClick={submit}
                    isLoading={state.isSubmitting}
                >
                    {state.isSubmitting ? 'Creating Job...' : 'Create Job'}
                </Button>
            </div>
        </motion.div>
    );
}
