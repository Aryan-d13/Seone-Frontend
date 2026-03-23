'use client';

import Link from 'next/link';
import { TemplateBuilderFeature } from '@/features/editor';

const shellStyle: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-primary)',
};

const topbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border-default)',
  background: 'rgba(9, 9, 11, 0.9)',
  backdropFilter: 'blur(14px)',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  color: 'var(--accent-primary)',
  fontSize: '12px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '13px',
};

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  color: 'var(--text-secondary)',
  fontSize: '13px',
};

export default function StudioPage() {
  return (
    <div style={shellStyle}>
      <header style={topbarStyle}>
        <div>
          <div style={eyebrowStyle}>Seone Studio</div>
          <div style={titleStyle}>Studio Canvas</div>
          <div style={subtitleStyle}>
            Build reusable templates and layouts without leaving Seone.
          </div>
        </div>
        <Link href="/dashboard" style={backLinkStyle}>
          Back to dashboard
        </Link>
      </header>
      <div style={contentStyle}>
        <TemplateBuilderFeature previewEnabled={false} />
      </div>
    </div>
  );
}
