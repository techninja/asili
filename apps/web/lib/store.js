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
  duckdbReady: false,
  traitsLoaded: false,
  
  // Actions
  setSelectedIndividual: (id, ready = true) => set({ selectedIndividual: id, individualReady: ready }),
  
  setIndividualReady: (ready) => set({ individualReady: ready }),
  
  setIndividuals: (individuals) => set({ individuals }),
  
  setUploadState: (state, progress = '', importingIndividual = null) => set({ uploadState: state, uploadProgress: progress, importingIndividual }),
  
  setCancelImport: () => set({ cancelImport: true }),
  
  setDuckDBReady: (ready) => set({ duckdbReady: ready }),
  
  setTraitsLoaded: (loaded) => set({ traitsLoaded: loaded }),
  
  // Computed getters
  hasIndividuals: () => get().individuals.length > 0,
  
  isReady: () => {
    const state = get();
    return state.selectedIndividual && state.individualReady && state.uploadState === 'idle';
  },
  
  canCalculateRisk: () => {
    const state = get();
    return state.duckdbReady && state.selectedIndividual && state.uploadState === 'idle';
  }
}));