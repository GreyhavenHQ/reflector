import { create } from 'zustand';

interface PlayerStore {
  isPlaying: boolean;
  currentTime: number;
  activeChapterId: string | null;
  setPlaying: (v: boolean) => void;
  setCurrentTime: (t: number) => void;
  setActiveChapter: (id: string | null) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  isPlaying: false,
  currentTime: 0,
  activeChapterId: null,
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setActiveChapter: (activeChapterId) => set({ activeChapterId }),
}));
