/**
 * Unified progress status system for genomic processing
 * Works across browser, mobile, and server environments
 */

export const PROGRESS_STAGES = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  LOADING_DATA: 'loading_data',
  PROCESSING_DNA: 'processing_dna',
  CALCULATING_PGS: 'calculating_pgs',
  FINALIZING: 'finalizing',
  COMPLETE: 'complete',
  ERROR: 'error'
};

export const PROGRESS_SUBSTAGES = {
  // Loading data substages
  FETCHING_TRAITS: 'fetching_traits',
  LOADING_PGS_FILES: 'loading_pgs_files',
  PREPARING_DATABASE: 'preparing_database',
  
  // Processing DNA substages
  PARSING_DNA_FILE: 'parsing_dna_file',
  VALIDATING_FORMAT: 'validating_format',
  NORMALIZING_DATA: 'normalizing_data',
  
  // Calculating PGS substages
  MATCHING_VARIANTS: 'matching_variants',
  COMPUTING_SCORES: 'computing_scores',
  AGGREGATING_RESULTS: 'aggregating_results'
};

export class ProgressTracker {
  constructor() {
    this.listeners = new Set();
    this.currentStatus = {
      stage: PROGRESS_STAGES.IDLE,
      substage: null,
      progress: 0,
      message: '',
      details: null,
      timestamp: Date.now()
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  update(updates) {
    this.currentStatus = {
      ...this.currentStatus,
      ...updates,
      timestamp: Date.now()
    };
    
    this.listeners.forEach(callback => {
      try {
        callback(this.currentStatus);
      } catch (error) {
        console.error('Progress listener error:', error);
      }
    });
  }

  setStage(stage, message = '', progress = 0) {
    this.update({ stage, message, progress, substage: null });
  }

  setSubstage(substage, message = '', progress = null) {
    this.update({ 
      substage, 
      message, 
      ...(progress !== null && { progress })
    });
  }

  setProgress(progress, message = '') {
    this.update({ progress, ...(message && { message }) });
  }

  setError(error, details = null) {
    this.update({
      stage: PROGRESS_STAGES.ERROR,
      message: error.message || error,
      details: details || error.stack,
      progress: 0
    });
  }

  complete(message = 'Processing complete') {
    this.update({
      stage: PROGRESS_STAGES.COMPLETE,
      message,
      progress: 100,
      substage: null
    });
  }

  reset() {
    this.update({
      stage: PROGRESS_STAGES.IDLE,
      substage: null,
      progress: 0,
      message: '',
      details: null
    });
  }

  getStatus() {
    return { ...this.currentStatus };
  }
}