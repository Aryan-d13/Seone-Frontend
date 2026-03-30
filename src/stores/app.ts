// ============================================
// APP STORE
// Global UI state management
// ============================================

import { create } from 'zustand';

interface AppState {
  // Sidebar state (for mobile)
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>(set => ({
  // Sidebar
  isSidebarOpen: false,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: open => set({ isSidebarOpen: open }),
}));
