import { createStore } from '/deps/zustand.js';

export const useAppStore = createStore((set, get) => ({
  // Core state
  selectedIndividual: null,
  individualReady: true,
  individuals: [],
  uploadState: 'idle', // idle, importing, deleting
  uploadProgress: '',
  importingIndividual: null, // { name, emoji } for the individual being imported
  cancelImport: false,
  manifestReady: false,
  traitsLoaded: false,
  totalAvailableTraits: 0,
  completedTraitsCount: 0,

  // Actions
  setSelectedIndividual: (id, ready = true) =>
    set({ selectedIndividual: id, individualReady: ready }),

  setIndividualReady: ready => set({ individualReady: ready }),

  setIndividuals: individuals => set({ individuals }),

  setUploadState: (state, progress = '', importingIndividual = null) =>
    set({ uploadState: state, uploadProgress: progress, importingIndividual }),

  setCancelImport: () => set({ cancelImport: true }),

  setManifestReady: ready => set({ manifestReady: ready }),

  setTraitsLoaded: loaded => set({ traitsLoaded: loaded }),

  setTotalAvailableTraits: count => set({ totalAvailableTraits: count }),

  setCompletedTraitsCount: count => set({ completedTraitsCount: count }),

  // Computed getters
  hasIndividuals: () => get().individuals.length > 0,

  isReady: () => {
    const state = get();
    return (
      state.selectedIndividual &&
      state.individualReady &&
      state.uploadState === 'idle'
    );
  },

  canCalculateRisk: () => {
    const state = get();
    return (
      state.manifestReady &&
      state.selectedIndividual &&
      state.uploadState === 'idle'
    );
  }
}));
