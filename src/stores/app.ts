// ============================================
// APP STORE
// Global UI state management
// ============================================

import { create } from 'zustand';

interface AppState {
    // Inspector state
    isInspectorOpen: boolean;
    toggleInspector: () => void;
    setInspectorOpen: (open: boolean) => void;

    // Sidebar state (for mobile)
    isSidebarOpen: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;

    // Current job context
    activeJobId: string | null;
    setActiveJobId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
    // Inspector
    isInspectorOpen: true,
    toggleInspector: () => set((state) => ({ isInspectorOpen: !state.isInspectorOpen })),
    setInspectorOpen: (open) => set({ isInspectorOpen: open }),

    // Sidebar
    isSidebarOpen: false,
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setSidebarOpen: (open) => set({ isSidebarOpen: open }),

    // Active job
    activeJobId: null,
    setActiveJobId: (id) => set({ activeJobId: id }),
}));
