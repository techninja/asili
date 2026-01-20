/**
 * Streams trait manifest from DuckDB file using DuckDB-WASM
 */

import { Debug } from './utils/debug.js';

export class TraitManifestLoader {
  constructor(conn) {
    this.conn = conn;
    this.traits = {};
    this.loaded = 0;
    this.total = 0;
  }

  async *streamTraits(dbPath, batchSize = 10) {
    try {
      const url = dbPath.startsWith('http') 
        ? dbPath 
        : `${window.location.origin}${dbPath}`;
      
      Debug.log(2, 'TraitManifestLoader', `Streaming traits from: ${url}`);
      
      let offset = 0;
      let hasMore = true;
      const startTime = performance.now();
      
      // Attach the database
      await this.conn.query(`ATTACH '${url}' AS manifest (READ_ONLY)`);
      
      while (hasMore) {
        const queryStart = performance.now();
        const batch = await this.conn.query(`
          SELECT * FROM manifest.traits
          LIMIT ${batchSize} OFFSET ${offset}
        `);
        const queryTime = performance.now() - queryStart;
        
        if (offset === 0) {
          Debug.log(2, 'TraitManifestLoader', `First query took ${queryTime.toFixed(0)}ms`);
        }
        
        if (batch.numRows === 0) {
          hasMore = false;
          break;
        }
        
        const batchTraits = this._batchToTraits(batch);
        this.loaded += batchTraits.length;
        
        yield {
          traits: batchTraits,
          loaded: this.loaded,
          progress: null
        };
        
        offset += batchSize;
        
        if (batch.numRows < batchSize) {
          hasMore = false;
        }
      }
      
      this.total = this.loaded;
      const totalTime = performance.now() - startTime;
      Debug.log(2, 'TraitManifestLoader', `Loaded ${this.loaded} traits in ${totalTime.toFixed(0)}ms`);
    } catch (error) {
      Debug.log(1, 'TraitManifestLoader', 'Failed to stream traits:', error);
      throw error;
    }
  }

  _batchToTraits(table) {
    const traits = [];
    
    for (let i = 0; i < table.numRows; i++) {
      const row = {};
      for (let j = 0; j < table.schema.fields.length; j++) {
        const field = table.schema.fields[j];
        const col = table.getChildAt(j);
        const val = col?.get(i);
        row[field.name] = typeof val === 'bigint' ? Number(val) : val;
      }
      
      const id = row.mondo_id || row.id || row.trait_id;
      if (id) {
        // Parse JSON fields
        const categories = row.categories ? JSON.parse(row.categories) : [];
        const pgs_ids = row.pgs_ids ? JSON.parse(row.pgs_ids) : [];
        const pgs_metadata = row.pgs_metadata ? JSON.parse(row.pgs_metadata) : {};
        const excluded_pgs = row.excluded_pgs ? JSON.parse(row.excluded_pgs) : [];
        
        const trait = {
          id,
          name: row.name || row.trait_name || id,
          description: row.description || '',
          categories,
          file_path: row.file_path || '',
          variant_count: row.variant_count || 0,
          last_updated: row.last_updated || '',
          pgs_ids,
          pgs_metadata,
          excluded_pgs
        };
        traits.push(trait);
        this.traits[id] = trait;
      }
    }
    
    return traits;
  }

  getTraits() {
    return this.traits;
  }
}
