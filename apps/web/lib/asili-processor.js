/**
 * Integration example showing how to use @asili/core in the web app
 * This demonstrates the unified progress tracking and genomic processing
 */

import {
  createBrowserProcessor,
  createBrowserStorage,
  createRiskCalculator,
  PROGRESS_STAGES
} from '@asili/core';
import { Debug } from '@asili/debug';

export class AsiliProcessor {
  constructor() {
    this.processor = null;
    this.storage = null;
    this.calculator = null;
    this.progressTracker = null;
    this.progressListeners = new Set();
  }

  async initialize() {
    // Create processor with progress tracking
    const { processor, progressTracker } = await createBrowserProcessor({
      cacheSize: '256MB',
      enableOptimizations: true
    });

    this.processor = processor;
    this.progressTracker = progressTracker;

    // Create storage and calculator
    this.storage = await createBrowserStorage({
      dbName: 'asili-genomic-data',
      version: 1
    });

    this.calculator = await createRiskCalculator({
      populationMean: 0,
      populationStd: 1
    });

    // Load trait manifest
    await this.loadTraitManifest();

    // Subscribe to progress updates
    this.progressTracker.subscribe(status => {
      this.progressListeners.forEach(listener => listener(status));
    });
  }

  async loadTraitManifest() {
    try {
      const response = await fetch('/data/trait_manifest.json');
      this.traitManifest = await response.json();

      // Convert new manifest structure to flat trait list
      this.availableTraits = [];

      if (!this.traitManifest.traits) {
        throw new Error('Invalid manifest: missing traits');
      }

      // Process traits directly from the keyed structure
      Object.entries(this.traitManifest.traits).forEach(([mondoId, trait]) => {
        this.availableTraits.push({
          id: mondoId,
          name: trait.name,
          description:
            trait.description || `Polygenic risk score for ${trait.name}`,
          categories: trait.categories || ['Other Conditions'],
          file_path: trait.file_path,
          pgs_metadata: trait.pgs_metadata || {},
          variant_count: trait.variant_count || 0,
          last_updated: trait.last_updated
        });
      });
    } catch (error) {
      Debug.log(1, 'AsiliProcessor', 'Failed to load trait manifest:', error);
      this.traitManifest = { traits: {} };
      this.availableTraits = [];
    }
  }

  // Get available trait categories
  getTraitCategories() {
    const categories = new Set();
    this.availableTraits.forEach(trait => {
      trait.categories?.forEach(cat => categories.add(cat));
    });
    return Array.from(categories).sort();
  }

  // Get traits for a specific category
  getTraitsForCategory(categoryName) {
    return this.availableTraits.filter(trait =>
      trait.categories?.includes(categoryName)
    );
  }

  // Get all available traits
  getAllTraits() {
    return this.availableTraits || [];
  }

  // Subscribe to progress updates
  onProgress(callback) {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  // Import DNA file and store variants
  async importDNA(
    dnaFile,
    individualId,
    individualName,
    emoji = '👤',
    progressCallback
  ) {
    if (!this.storage) {
      throw new Error('Storage not initialized');
    }

    try {
      // Add individual if not exists
      if (individualId && individualName) {
        await this.storage.addIndividual(
          individualId,
          individualName,
          'self',
          emoji
        );
      }

      // Parse and store DNA file
      const dnaData = await this.parseDNAFile(
        dnaFile,
        individualId,
        progressCallback
      );

      return {
        individualId,
        variantCount: dnaData.variants.length,
        metadata: dnaData.metadata
      };
    } catch (error) {
      this.progressTracker.setError(error);
      throw error;
    }
  }

  // Calculate risk for a single trait using real DNA processing
  async calculateTraitRisk(traitId, individualId, progressCallback) {
    Debug.log(
      1,
      'AsiliProcessor',
      `Starting risk calculation for trait: ${traitId}, individual: ${individualId}`
    );

    if (!this.storage || !this.processor) {
      throw new Error('Processor not initialized');
    }

    try {
      // Get trait information
      const trait = this.availableTraits.find(t => t.id === traitId);
      if (!trait) {
        Debug.error(
          'AsiliProcessor',
          `Trait ${traitId} not found in available traits`
        );
        throw new Error(`Trait ${traitId} not found`);
      }

      Debug.log(
        2,
        'AsiliProcessor',
        `Found trait: ${trait.name} with ${trait.variant_count} variants`
      );

      if (!trait.file_path) {
        Debug.error(
          'AsiliProcessor',
          `No data file available for trait ${trait.name}`
        );
        throw new Error(`No data file available for trait ${trait.name}`);
      }

      // Get user DNA data
      progressCallback?.('Loading user DNA...', 0);
      Debug.log(
        2,
        'AsiliProcessor',
        `Loading DNA variants for individual: ${individualId}`
      );
      const userDNA = await this.storage.getVariants(individualId);
      if (!userDNA || userDNA.length === 0) {
        Debug.error(
          'AsiliProcessor',
          `No DNA data found for individual: ${individualId}`
        );
        throw new Error('No DNA data found for individual');
      }

      Debug.log(
        2,
        'AsiliProcessor',
        `Loaded ${userDNA.length} DNA variants for processing`
      );

      // Build trait URL
      progressCallback?.('Loading trait data...', 5);
      const traitUrl = `/data/${trait.file_path}`;
      Debug.log(2, 'AsiliProcessor', `Using trait data URL: ${traitUrl}`);

      // Use the real DuckDB processor for calculation
      const result = await this.processor.calculateRisk(
        traitUrl,
        userDNA,
        (message, percent) => {
          Debug.log(
            3,
            'AsiliProcessor',
            `Risk calculation progress: ${message} (${percent}%)`
          );
          progressCallback?.(message, percent);
        },
        trait.pgs_metadata
      );

      Debug.log(
        1,
        'AsiliProcessor',
        `Risk calculation complete. Score: ${result.riskScore}, PGS breakdown: ${Object.keys(result.pgsBreakdown || {}).length} scores`
      );

      // Format result with additional metadata (include compact pgsDetails with top variants)
      const riskData = {
        riskScore: result.riskScore,
        pgsBreakdown: result.pgsBreakdown,
        pgsDetails: result.pgsDetails, // Now contains only top 20 variants per PGS
        matchedVariants: userDNA.length,
        totalVariants: trait.variant_count,
        traitLastUpdated: trait.last_updated,
        calculatedAt: new Date().toISOString()
      };

      // Cache the result with compact pgsDetails
      Debug.log(
        2,
        'AsiliProcessor',
        `Caching risk result for ${traitId} with ${Object.keys(result.pgsDetails || {}).length} PGS summaries`
      );
      await this.storage.storeRiskScore(individualId, traitId, riskData);

      return riskData;
    } catch (error) {
      Debug.error(
        'AsiliProcessor',
        `Risk calculation failed for ${traitId}:`,
        error.message
      );
      this.progressTracker?.setError(error);
      throw error;
    }
  }

  async parseDNAFile(file, individualId, progressCallback) {
    Debug.log(
      1,
      'AsiliProcessor',
      `Starting DNA file parsing: ${file.name} (${file.size} bytes)`
    );
    this.progressTracker.setStage(
      PROGRESS_STAGES.PROCESSING_DNA,
      'Parsing DNA file...'
    );

    const text = await file.text();
    const lines = text.split('\n');
    const dataLines = lines.filter(
      line => line.trim() && !line.startsWith('#') && !line.startsWith('rsid')
    );

    Debug.log(
      2,
      'AsiliProcessor',
      `Found ${dataLines.length} data lines from ${lines.length} total lines`
    );

    const variants = [];

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim();
      if (!line) continue;

      const columns = line.split('\t');
      if (columns.length >= 4) {
        const position = parseInt(columns[2], 10);
        if (!isNaN(position)) {
          const genotype = columns[3].trim();
          if (genotype !== '--' && genotype !== '00') {
            variants.push({
              rsid: columns[0].trim(),
              chromosome: columns[1].trim(),
              position,
              allele1: genotype[0] || '',
              allele2: genotype[1] || genotype[0] || ''
            });
          }
        }
      }

      // Update progress periodically
      if (i % 10000 === 0) {
        const progress = Math.round((i / dataLines.length) * 100);
        const message = `Parsed ${variants.length} variants`;
        this.progressTracker.setProgress(progress, message);
        progressCallback?.(message, progress);
      }
    }

    Debug.log(
      1,
      'AsiliProcessor',
      `Parsed ${variants.length} valid variants from DNA file`
    );

    // Store variants in database
    if (individualId) {
      Debug.log(
        2,
        'AsiliProcessor',
        `Storing variants for individual: ${individualId}`
      );
      await this.storage.storeVariants(
        individualId,
        variants,
        (current, total) => {
          const progress = Math.round((current / total) * 100);
          const message = `Stored ${current}/${total} variants`;
          this.progressTracker.setProgress(progress, message);
          progressCallback?.(message, progress);
        }
      );
    }

    this.progressTracker.complete(`Imported ${variants.length} variants`);
    Debug.log(
      1,
      'AsiliProcessor',
      `DNA file processing complete: ${variants.length} variants stored`
    );

    return {
      format: 'generic',
      variants,
      metadata: {
        filename: file.name,
        size: file.size,
        variantCount: variants.length,
        parsedAt: new Date().toISOString()
      }
    };
  }

  // Get cached results
  async getCachedResults(individualId) {
    const keys = await this.storage.list();
    const resultKeys = keys.filter(
      key => key.startsWith('risk_') && key.endsWith(`_${individualId}`)
    );

    const results = [];
    for (const key of resultKeys) {
      const data = await this.storage.retrieve(key);
      if (data) {
        const traitId = key
          .replace('risk_', '')
          .replace(`_${individualId}`, '');
        results.push({ traitId, ...data });
      }
    }

    return results;
  }

  // Get cached result for specific trait
  async getCachedResult(individualId, traitId) {
    return await this.storage.getCachedRiskScore(individualId, traitId);
  }

  // Clear cached results for individual
  async clearCachedResults(individualId) {
    const keys = await this.storage.list();
    const resultKeys = keys.filter(
      key => key.startsWith('risk_') && key.endsWith(`_${individualId}`)
    );

    for (const key of resultKeys) {
      await this.storage.delete(key);
    }
  }

  // Clear all cached data
  async clearCache() {
    await this.storage.clear();
  }

  // Get current progress status
  getProgressStatus() {
    return this.progressTracker?.getStatus() || null;
  }

  // Cleanup resources
  async cleanup() {
    if (this.processor) {
      await this.processor.cleanup();
    }
    this.progressListeners.clear();
  }
}

// Example usage:
/*
const asili = new AsiliProcessor();
await asili.initialize();

// Subscribe to progress updates
asili.onProgress((status) => {
// Debug.log(1, 'AsiliProcessor', `Stage: ${status.stage}, Progress: ${status.progress}%, Message: ${status.message}`);
// Debug.log(1, 'AsiliProcessor', 'Risk scores:', results);
*/
