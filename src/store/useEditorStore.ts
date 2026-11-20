import { create } from 'zustand';
import type { PhotoAsset } from '../types/editor';

type EditorState = {
  photo: PhotoAsset | null;
  setPhoto: (photo: PhotoAsset | null) => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  photo: null,
  setPhoto: (photo) => set({ photo }),
}));
