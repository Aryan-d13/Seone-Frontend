'use client';

import { motion } from 'framer-motion';
import { SubmitPanel } from '@/components/job/SubmitPanel';
import { TemplateSelector } from '@/components/job/TemplateSelector';
import { DashboardCanvasLoading } from '@/components/layout/DashboardCanvasLoading';
import { useJobSubmit } from '@/hooks/useJobSubmit';
import { useServiceConfig } from '@/hooks/useServiceConfig';
import { useTemplates } from '@/hooks/useTemplates';
import { Button } from '@/components/ui';
import { pageVariants, pageTransition } from '@/lib/animations';
import styles from './page.module.css';

export default function NewJobPage() {
  const { formData, errors, state, updateField, selectTemplate, submit, reset } =
    useJobSubmit();
  const { killSwitch } = useServiceConfig();
  const { isLoading: isLoadingTemplates } = useTemplates();

  if (isLoadingTemplates) {
    return <DashboardCanvasLoading variant="newJob" />;
  }

  return (
    <motion.div
      className={styles.page}
      initial="initial"
      animate="animate"
      variants={pageVariants}
      transition={pageTransition}
    >
      <div className={styles.header}>
        <h1 className={styles.title}>New Job</h1>
        <p className={styles.subtitle}>Create AI-powered clips from YouTube content</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.column}>
          <SubmitPanel formData={formData} errors={errors} onUpdateField={updateField} />
        </div>

        <div className={styles.column}>
          <TemplateSelector
            selectedTemplate={formData.selectedTemplate}
            onSelect={selectTemplate}
            error={errors.selectedTemplate}
          />
        </div>
      </div>

      <div className={styles.actions}>
        {killSwitch && (
          <div className={styles.submitError}>
            Service is currently in read-only mode for maintenance.
          </div>
        )}
        {state.error && <div className={styles.submitError}>{state.error}</div>}
        {Object.values(errors).some(Boolean) && (
          <div className={styles.submitError}>
            {errors.selectedTemplate
              ? 'Please select a template'
              : 'Please fix the errors above'}
          </div>
        )}
        <Button
          variant="secondary"
          onClick={reset}
          disabled={state.isSubmitting || killSwitch}
        >
          Reset
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={submit}
          isLoading={state.isSubmitting}
          disabled={killSwitch}
        >
          {state.isSubmitting ? 'Creating Job...' : 'Create Job'}
        </Button>
      </div>
    </motion.div>
  );
}
