import { Inter, Manrope } from 'next/font/google';
import '@/features/editor/index.css';
import '@/features/editor/App.css';
import { AuthGuard } from '@/components/layout';

const editorDisplay = Manrope({
  variable: '--font-editor-display',
  subsets: ['latin'],
  display: 'swap',
});

const editorBody = Inter({
  variable: '--font-editor-body',
  subsets: ['latin'],
  display: 'swap',
});

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAuth={true} redirectTo="/login">
      <div className={`${editorDisplay.variable} ${editorBody.variable} editor-shell`}>
        {children}
      </div>
    </AuthGuard>
  );
}
