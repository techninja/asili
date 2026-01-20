import { createStore } from '/deps/zustand.js';

// Create a trait-specific store that manages individual trait states
export const useTraitStore = createStore((set, get) => ({
  // Map of traitId -> trait state
  traits: new Map(),
  
  // Get trait state by ID
  getTraitState: (traitId) => {
    return get().traits.get(traitId) || {
      cached: null,
      queueItem: null,
      selectedPgsId: null,
      pgsNavigation: null,
      loading: false
    };
  },
  
  // Batch update trait cache data
  setTraitCacheBatch: (updates) => set(state => {
    const newTraits = new Map(state.traits);
    updates.forEach(({ traitId, cached }) => {
      const current = newTraits.get(traitId) || {};
      newTraits.set(traitId, { ...current, cached });
    });
    return { traits: newTraits };
  }),
  
  // Set loading state
  setTraitLoading: (traitId, loading) => set(state => {
    const newTraits = new Map(state.traits);
    const current = newTraits.get(traitId) || {};
    newTraits.set(traitId, { ...current, loading });
    return { traits: newTraits };
  }),
  
  // Update trait cache data
  setTraitCache: (traitId, cached) => set(state => {
    const newTraits = new Map(state.traits);
    const current = newTraits.get(traitId) || {};
    newTraits.set(traitId, { ...current, cached });
    return { traits: newTraits };
  }),
  
  // Update trait queue status
  setTraitQueue: (traitId, queueItem) => set(state => {
    const newTraits = new Map(state.traits);
    const current = newTraits.get(traitId) || {};
    // Clear cached results when item is queued/processing
    const updates = { ...current, queueItem };
    if (queueItem && (queueItem.status === 'pending' || queueItem.status === 'processing')) {
      updates.cached = null;
    }
    newTraits.set(traitId, updates);
    return { traits: newTraits };
  }),
  
  // Set selected PGS for breakdown view
  setSelectedPgs: (traitId, pgsId, navigation = null) => set(state => {
    const newTraits = new Map(state.traits);
    const current = newTraits.get(traitId) || {};
    newTraits.set(traitId, { 
      ...current, 
      selectedPgsId: pgsId,
      pgsNavigation: navigation 
    });
    return { traits: newTraits };
  }),
  
  // Clear trait state (when individual changes)
  clearTraitState: (traitId) => set(state => {
    const newTraits = new Map(state.traits);
    newTraits.delete(traitId);
    return { traits: newTraits };
  }),
  
  // Clear all trait states
  clearAllTraits: () => set({ traits: new Map() })
}));