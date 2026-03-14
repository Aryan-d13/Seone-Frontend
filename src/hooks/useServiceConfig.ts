// ============================================
// SERVICE CONFIG STORE
// Real-time Firebase RTDB listener for kill switch
// ============================================

import { create } from 'zustand';
import { ref, onValue, type DatabaseReference } from 'firebase/database';
import { rtdb } from '@/config/firebase';

interface ServiceConfigState {
  killSwitch: boolean;
  message: string | null;
  isLoading: boolean;

  // Actions
  subscribe: () => () => void;
}

const CONFIG_PATH = 'config';

export const useServiceConfig = create<ServiceConfigState>(set => ({
  // Fail-open: default to healthy until RTDB says otherwise
  killSwitch: false,
  message: null,
  isLoading: true,

  subscribe: () => {
    let configRef: DatabaseReference;

    try {
      configRef = ref(rtdb, CONFIG_PATH);
    } catch {
      // Firebase not configured — fail open
      set({ isLoading: false, killSwitch: false });
      return () => {};
    }

    const unsubscribe = onValue(
      configRef,
      snapshot => {
        if (!snapshot.exists()) {
          // No config node yet — fail open
          set({ isLoading: false, killSwitch: false, message: null });
          return;
        }

        const data = snapshot.val();

        set({
          killSwitch: Boolean(data.kill_switch),
          message: data.message || null,
          isLoading: false,
        });
      },
      _error => {
        // RTDB error — fail open
        set({ isLoading: false, killSwitch: false, message: null });
      }
    );

    return unsubscribe;
  },
}));
