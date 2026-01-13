'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';
import { pageVariants, pageTransition } from '@/lib/animations';
import styles from './page.module.css';

export default function Home() {
  const router = useRouter();
  return (
    <motion.main
      className={styles.main}
      initial="initial"
      animate="animate"
      variants={pageVariants}
      transition={pageTransition}
    >
      {/* Hero Section */}
      <div className={styles.hero}>
        <div className={styles.heroGlow} />

        <motion.div
          className={styles.badge}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          ✨ AI-Powered Video Pipeline
        </motion.div>

        <motion.h1
          className={styles.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <span className="gradient-text">Seone</span>
        </motion.h1>

        <motion.p
          className={styles.subtitle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Transform YouTube videos into stunning short-form content
          <br />
          with the power of AI.
        </motion.p>

        <motion.div
          className={styles.actions}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            size="lg"
            onClick={() => router.push('/dashboard/new')}
          >
            Get Started
          </Button>
          <Button variant="secondary" size="lg">
            Learn More
          </Button>
        </motion.div>
      </div>

      {/* Features Grid */}
      <motion.div
        className={styles.features}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <FeatureCard
          icon="🎬"
          title="Smart Clipping"
          description="AI analyzes your video and extracts the most engaging moments automatically."
        />
        <FeatureCard
          icon="📝"
          title="Intelligent Copy"
          description="Generate scroll-stopping captions and titles optimized for each platform."
        />
        <FeatureCard
          icon="⚡"
          title="Real-Time Pipeline"
          description="Watch your content transform with live progress updates and previews."
        />
        <FeatureCard
          icon="🎨"
          title="Premium Templates"
          description="Choose from professionally designed templates for stunning results."
        />
      </motion.div>
    </motion.main>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <motion.div
      className={styles.featureCard}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <span className={styles.featureIcon}>{icon}</span>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDescription}>{description}</p>
    </motion.div>
  );
}
