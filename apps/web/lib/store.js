import { createStore } from 'zustand';

export const useAppStore = createStore((set, get) => ({
  // Core state
  selectedIndividual: null,
  individualReady: true,
  individuals: [],
  uploadState: 'idle', // idle, importing, deleting
  duckdbReady: false,
  traitsLoaded: false,
  
  // Actions
  setSelectedIndividual: (id, ready = true) => set({ selectedIndividual: id, individualReady: ready }),
  
  setIndividualReady: (ready) => set({ individualReady: ready }),
  
  setIndividuals: (individuals) => set({ individuals }),
  
  setUploadState: (state) => set({ uploadState: state }),
  
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