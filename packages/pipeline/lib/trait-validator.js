/**
 * @fileoverview Asili Trait Validation Library
 * Standalone module for validating trait data ingestion and PGS filtering
 */

// Ontology URI mappings
const ONTOLOGY_URIS = {
  TRAIT: 'https://monarchinitiative.org/disease/',
  EFO: 'https://www.ebi.ac.uk/efo/',
  HP: 'https://hpo.jax.org/app/browse/term/',
  OBA: 'http://purl.obolibrary.org/obo/',
  PATO: 'http://purl.obolibrary.org/obo/'
};

// Known problematic PGS (manually curated)
const EXCLUDED_PGS_IDS = ['PGS002724']; // GIGASTROKE

// Legitimate modern methods that may have "NR" weight type
const LEGITIMATE_NR_METHODS = [
  'sparssnp', 'snpnet', 'penalized regression', 'lasso', 'ridge regression',
  'elastic net', 'ldpred', 'ldpred2', 'prsice', 'lassosum', 'bigstatsr', 'bigsnpr'
];

// Integrative/meta method keywords to exclude
const INTEGRATIVE_METHOD_KEYWORDS = [
  'integrative', 'meta-analysis', 'meta analysis', 'component', 'composite',
  'combined', 'ensemble', 'multi-trait', 'multitrait', 'cross-trait', 'crosstrait'
];

/**
 * Validates a trait ID format
 * @param {string} traitId - The trait ID to validate
 * @returns {Object} Validation result with type and canonical format
 */
function validateTraitId(traitId) {
  const patterns = {
    TRAIT: /^TRAIT:[0-9]{7}$/,
    EFO: /^EFO_[0-9]{7}$/,
    HP: /^HP_[0-9]{7}$/,
    OBA_VT: /^OBA_VT[0-9]{7}$/,
    OBA: /^OBA_[0-9]{7}$/,
    PATO: /^PATO_[0-9]{7}$/
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(traitId)) {
      return {
        valid: true,
        type,
        canonical: traitId,
        uri: generateCanonicalURI(traitId)
      };
    }
  }

  return { valid: false, reason: 'Invalid trait ID format' };
}

/**
 * Generates canonical URI for a trait ID
 * @param {string} traitId - The trait ID
 * @returns {string|null} Canonical URI or null if unsupported
 */
function generateCanonicalURI(traitId) {
  if (traitId.startsWith('TRAIT:')) {
    return ONTOLOGY_URIS.TRAIT + traitId;
  } else if (traitId.startsWith('EFO_')) {
    return ONTOLOGY_URIS.EFO + traitId;
  } else if (traitId.startsWith('HP_')) {
    return ONTOLOGY_URIS.HP + traitId;
  } else if (traitId.startsWith('OBA_')) {
    return ONTOLOGY_URIS.OBA + traitId;
  } else if (traitId.startsWith('PATO_')) {
    return ONTOLOGY_URIS.PATO + traitId;
  }
  return null;
}

/**
 * Validates PGS score for inclusion/exclusion
 * @param {string} pgsId - PGS identifier
 * @param {Object} scoreData - PGS metadata from API
 * @returns {Object} Validation result with exclude flag and reason
 */
function validatePGSScore(pgsId, scoreData) {
  // 1. Known problematic PGS
  if (EXCLUDED_PGS_IDS.includes(pgsId)) {
    return { exclude: true, reason: 'Known integrative PGS' };
  }
  
  const methodName = (scoreData.method_name || '').toLowerCase();
  const weightType = scoreData.weight_type || '';
  
  // 2. Check for integrative methods
  for (const keyword of INTEGRATIVE_METHOD_KEYWORDS) {
    if (methodName.includes(keyword)) {
      return { exclude: true, reason: `Integrative method: ${keyword}` };
    }
  }
  
  // 3. Smart handling of "NR" weight type
  if (weightType === 'NR') {
    // Allow legitimate modern methods
    for (const legitMethod of LEGITIMATE_NR_METHODS) {
      if (methodName.includes(legitMethod)) {
        return { exclude: false, reason: `Legitimate modern method: ${legitMethod}` };
      }
    }
    // Only exclude if no method specified
    if (!methodName || methodName.trim() === '') {
      return { exclude: true, reason: 'No method specified with NR weight type' };
    }
    return { exclude: false, reason: 'NR weight type but method specified' };
  }
  
  return { exclude: false, reason: 'Standard PGS score' };
}

/**
 * Validates trait data structure
 * @param {Object} traitData - Trait data object
 * @returns {Object} Validation result
 */
function validateTraitData(traitData) {
  const required = ['title', 'trait_id', 'pgs_ids', 'expected_variants', 'last_updated'];
  const missing = required.filter(field => !(field in traitData));
  
  if (missing.length > 0) {
    return { valid: false, errors: [`Missing required fields: ${missing.join(', ')}`] };
  }
  
  const errors = [];
  
  // Validate trait ID
  const idValidation = validateTraitId(traitData.trait_id);
  if (!idValidation.valid) {
    errors.push(`Invalid trait_id: ${idValidation.reason}`);
  }
  
  // Validate PGS IDs
  if (!Array.isArray(traitData.pgs_ids)) {
    errors.push('pgs_ids must be an array');
  } else {
    const invalidPgs = traitData.pgs_ids.filter(id => !/^PGS[0-9]{6}$/.test(id));
    if (invalidPgs.length > 0) {
      errors.push(`Invalid PGS IDs: ${invalidPgs.join(', ')}`);
    }
  }
  
  // Validate variant counts
  if (typeof traitData.expected_variants !== 'number' || traitData.expected_variants < 0) {
    errors.push('expected_variants must be a non-negative number');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Generates trait summary statistics
 * @param {Object} catalog - Trait catalog
 * @returns {Object} Summary statistics
 */
function generateCatalogStats(catalog) {
  const traits = Object.values(catalog.traits || {});
  
  const stats = {
    total_traits: traits.length,
    total_pgs_scores: 0,
    total_variants: 0,
    excluded_pgs_count: 0,
    ontology_breakdown: {},
    method_breakdown: {}
  };
  
  traits.forEach(trait => {
    stats.total_pgs_scores += trait.pgs_ids.length;
    stats.total_variants += trait.expected_variants || 0;
    
    if (trait.excluded_pgs) {
      stats.excluded_pgs_count += trait.excluded_pgs.length;
      
      trait.excluded_pgs.forEach(excluded => {
        const method = excluded.method || 'Unknown';
        stats.method_breakdown[method] = (stats.method_breakdown[method] || 0) + 1;
      });
    }
    
    // Count ontology types
    const ontologyType = trait.trait_id.split(/[_:]/)[0];
    stats.ontology_breakdown[ontologyType] = (stats.ontology_breakdown[ontologyType] || 0) + 1;
  });
  
  return stats;
}

// Export functions for use as standalone library
export {
  validateTraitId,
  generateCanonicalURI,
  validatePGSScore,
  validateTraitData,
  generateCatalogStats,
  ONTOLOGY_URIS,
  LEGITIMATE_NR_METHODS,
  INTEGRATIVE_METHOD_KEYWORDS,
  EXCLUDED_PGS_IDS
};