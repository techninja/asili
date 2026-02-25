import { Debug } from '@asili/debug';

export class TraitManifestLoader {
  constructor() {
    this.manifest = null;
    this.loading = false;
  }

  async loadManifest() {
    if (this.manifest) return this.manifest;
    if (this.loading) {
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (this.manifest) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
      return this.manifest;
    }

    this.loading = true;
    Debug.log(1, 'TraitManifestLoader', 'Loading trait manifest...');

    try {
      const response = await fetch('/data/trait_manifest.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      this.manifest = await response.json();
      Debug.log(1, 'TraitManifestLoader', `Loaded ${Object.keys(this.manifest.traits).length} traits`);
      return this.manifest;
    } catch (error) {
      Debug.error('TraitManifestLoader', 'Failed to load manifest:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  async getAllTraits() {
    const manifest = await this.loadManifest();
    return Object.values(manifest.traits).map(trait => ({
      id: trait.trait_id,
      name: trait.name,
      description: trait.description,
      categories: trait.categories,
      expected_variants: trait.expected_variants,
      estimated_unique_variants: trait.estimated_unique_variants,
      pgs_count: trait.pgs_count,
      file_path: trait.file_path
    }));
  }

  async getTraitById(traitId) {
    const manifest = await this.loadManifest();
    const trait = manifest.traits[traitId];
    if (!trait) return null;

    return {
      id: trait.trait_id,
      name: trait.name,
      description: trait.description,
      categories: trait.categories,
      expected_variants: trait.expected_variants,
      estimated_unique_variants: trait.estimated_unique_variants,
      pgs_count: trait.pgs_count,
      file_path: trait.file_path
    };
  }

  async getTraitDetails(traitId) {
    Debug.log(2, 'TraitManifestLoader', `Fetching details for ${traitId}`);
    
    try {
      const response = await fetch(`/api/traits/${traitId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const details = await response.json();
      Debug.log(2, 'TraitManifestLoader', `Loaded ${details.pgs_scores?.length || 0} PGS scores for ${traitId}`);
      return details;
    } catch (error) {
      Debug.error('TraitManifestLoader', `Failed to load details for ${traitId}:`, error);
      throw error;
    }
  }
}

export const traitManifestLoader = new TraitManifestLoader();
