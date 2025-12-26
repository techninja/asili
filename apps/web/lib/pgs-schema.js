// Shared schema definitions for PGS data formats
export const PGS_FORMATS = {
    STANDARD_SNP: {
        name: 'Standard SNP',
        columns: {
            chr_name: 'UTF8',
            chr_position: 'INT64', 
            effect_allele: 'UTF8',
            other_allele: 'UTF8',
            effect_weight: 'DOUBLE',
            pgs_id: 'UTF8',
            source_family: 'UTF8',
            source_type: 'UTF8',
            source_subtype: 'UTF8',
            source_weight: 'DOUBLE',
            weight_type: 'UTF8'
        },
        matchingStrategy: 'position',
        getMatchingQuery: () => `SELECT chr_name, chr_position, effect_allele, effect_weight, pgs_id FROM {table}`
    },
    
    HLA_ALLELE: {
        name: 'HLA Allele',
        columns: {
            variant_id: 'UTF8',
            effect_allele: 'UTF8', 
            effect_weight: 'DOUBLE',
            is_interaction: 'BOOLEAN',
            is_haplotype: 'BOOLEAN',
            locus_name: 'UTF8',
            variant_type: 'UTF8',
            pgs_id: 'UTF8',
            source_family: 'UTF8',
            source_type: 'UTF8',
            source_subtype: 'UTF8',
            source_weight: 'DOUBLE',
            weight_type: 'UTF8'
        },
        matchingStrategy: 'variant_id',
        getMatchingQuery: () => `SELECT variant_id, effect_allele, effect_weight, pgs_id FROM {table}`
    },
    
    RSID_ONLY: {
        name: 'rsID Only',
        columns: {
            rsid: 'UTF8',
            effect_allele: 'UTF8',
            other_allele: 'UTF8', 
            effect_weight: 'DOUBLE',
            pgs_id: 'UTF8',
            source_family: 'UTF8',
            source_type: 'UTF8',
            source_subtype: 'UTF8',
            source_weight: 'DOUBLE',
            weight_type: 'UTF8'
        },
        matchingStrategy: 'rsid',
        getMatchingQuery: () => `SELECT rsid, effect_allele, effect_weight, pgs_id FROM {table}`
    },
    
    RSID_CHR: {
        name: 'rsID + Chr',
        columns: {
            rsid: 'UTF8',
            chr_name: 'UTF8',
            effect_allele: 'UTF8',
            effect_weight: 'DOUBLE',
            locus_name: 'UTF8',
            pgs_id: 'UTF8',
            source_family: 'UTF8',
            source_type: 'UTF8', 
            source_subtype: 'UTF8',
            source_weight: 'DOUBLE',
            weight_type: 'UTF8'
        },
        matchingStrategy: 'rsid',
        getMatchingQuery: () => `SELECT rsid, effect_allele, effect_weight, pgs_id FROM {table}`
    }
};

export function getFormatFromColumns(columns) {
    for (const [formatKey, format] of Object.entries(PGS_FORMATS)) {
        const requiredCols = Object.keys(format.columns);
        if (requiredCols.every(col => columns.includes(col))) {
            return { key: formatKey, format };
        }
    }
    return null;
}

export function getMatchingDataForFormat(formatKey, tableName) {
    const format = PGS_FORMATS[formatKey];
    if (!format) return null;
    
    return format.getMatchingQuery().replace('{table}', tableName);
}