import { Inter, Manrope } from 'next/font/google';
import '@/features/editor/index.css';
import '@/features/editor/App.css';

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${editorDisplay.variable} ${editorBody.variable} editor-shell`}>
      {children}
    </div>
  );
}
