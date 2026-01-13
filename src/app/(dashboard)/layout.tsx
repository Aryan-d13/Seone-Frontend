import { AuthGuard, AppShell } from '@/components/layout';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthGuard requireAuth={true} redirectTo="/login">
            <AppShell>{children}</AppShell>
        </AuthGuard>
    );
}
