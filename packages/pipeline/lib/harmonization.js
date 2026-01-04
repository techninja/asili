/**
 * PGS file format detection and harmonization utilities
 */

export const FORMAT_TYPES = {
    STANDARD_SNP: 'STANDARD_SNP',
    STANDARD_SNP_NO_RSID: 'STANDARD_SNP_NO_RSID', 
    HLA_ALLELE: 'HLA_ALLELE',
    RSID_ONLY: 'RSID_ONLY',
    RSID_CHR: 'RSID_CHR'
};

/**
 * Detect PGS file format based on column headers
 */
export function detectFormat(columns) {
    if (columns.includes('chr_name') && columns.includes('chr_position') && columns.includes('rsID')) {
        return FORMAT_TYPES.STANDARD_SNP;
    } else if (columns.includes('chr_name') && columns.includes('chr_position') && !columns.includes('rsID')) {
        return FORMAT_TYPES.STANDARD_SNP_NO_RSID;
    } else if (columns.includes('rsID') && columns.includes('is_haplotype')) {
        return FORMAT_TYPES.HLA_ALLELE;
    } else if (columns.includes('rsID') && !columns.includes('chr_name') && !columns.includes('is_haplotype')) {
        return FORMAT_TYPES.RSID_ONLY;
    } else if (columns.includes('rsID') && columns.includes('chr_name') && !columns.includes('chr_position')) {
        return FORMAT_TYPES.RSID_CHR;
    }
    return null;
}

/**
 * Get column reference helper for DuckDB queries
 */
export function getColumnRef(columns, colName) {
    const idx = columns.indexOf(colName);
    return idx !== -1 ? `column${idx}` : "''";
}

/**
 * Generate harmonized column expressions for DuckDB based on format type
 */
export function generateColumnExpressions(formatType, columns) {
    const getCol = (colName) => getColumnRef(columns, colName);
    
    switch (formatType) {
        case FORMAT_TYPES.STANDARD_SNP:
        case FORMAT_TYPES.STANDARD_SNP_NO_RSID: {
            const chrNameCol = getCol('chr_name');
            const chrPosCol = getCol('chr_position');
            const effectAlleleCol = getCol('effect_allele');
            const otherAlleleCol = getCol('other_allele');
            const effectWeightCol = getCol('effect_weight');
            
            return {
                variant_id: `CONCAT(REPLACE(${chrNameCol}, 'chr', ''), ':', COALESCE(${chrPosCol}::TEXT, ''), ':', ${effectAlleleCol}, ':', ${otherAlleleCol})`,
                chr_name: `REPLACE(${chrNameCol}, 'chr', '')`,
                chr_position: `TRY_CAST(${chrPosCol} AS BIGINT)`,
                effect_allele: effectAlleleCol,
                other_allele: otherAlleleCol,
                effect_weight: `TRY_CAST(${effectWeightCol} AS DOUBLE)`
            };
        }
        
        case FORMAT_TYPES.HLA_ALLELE: {
            const rsIdCol = getCol('rsID');
            const effectAlleleCol = getCol('effect_allele');
            const effectWeightCol = getCol('effect_weight');
            
            return {
                variant_id: `CASE WHEN ${rsIdCol} IS NOT NULL AND ${rsIdCol} != '' THEN ${rsIdCol} ELSE ${effectAlleleCol} END`,
                chr_name: "''",
                chr_position: "NULL",
                effect_allele: effectAlleleCol,
                other_allele: "''",
                effect_weight: `TRY_CAST(${effectWeightCol} AS DOUBLE)`
            };
        }
        
        case FORMAT_TYPES.RSID_ONLY:
        case FORMAT_TYPES.RSID_CHR:
        default: {
            const rsIdCol = getCol('rsID');
            const effectAlleleCol = getCol('effect_allele');
            const otherAlleleCol = getCol('other_allele');
            const effectWeightCol = getCol('effect_weight');
            const chrNameCol = formatType === FORMAT_TYPES.RSID_CHR ? `REPLACE(${getCol('chr_name')}, 'chr', '')` : "''";
            
            return {
                variant_id: rsIdCol,
                chr_name: chrNameCol,
                chr_position: "NULL",
                effect_allele: effectAlleleCol,
                other_allele: otherAlleleCol,
                effect_weight: `TRY_CAST(${effectWeightCol} AS DOUBLE)`
            };
        }
    }
}

/**
 * Generate DuckDB column definitions for CSV reading
 */
export function generateColumnDefinitions(columns) {
    return columns.map((col, idx) => `'column${idx}': 'VARCHAR'`).join(', ');
}

/**
 * Generate complete DuckDB INSERT statement for harmonized data
 */
export function generateInsertSQL(formatType, columns, dataPath, pgsId, config, traitName) {
    const expressions = generateColumnExpressions(formatType, columns);
    const columnDefs = generateColumnDefinitions(columns);
    const effectWeightCol = getColumnRef(columns, 'effect_weight');
    
    return `
        INSERT INTO pgs_staging 
        SELECT 
            ${expressions.variant_id} as variant_id,
            ${expressions.chr_name} as chr_name,
            ${expressions.chr_position} as chr_position,
            ${expressions.effect_allele} as effect_allele,
            ${expressions.other_allele} as other_allele,
            ${expressions.effect_weight} as effect_weight,
            '${pgsId}' as pgs_id,
            '${config.source_family || traitName}' as source_family,
            '${config.source_type || 'trait'}' as source_type,
            '${config.source_subtype || 'mondo'}' as source_subtype,
            ${config.weight || 1.0} as source_weight,
            'log_odds' as weight_type,
            '${formatType}' as format_type
        FROM read_csv('${dataPath}', delim='\\t', header=false, columns={${columnDefs}})
        WHERE ${expressions.effect_allele} IS NOT NULL 
          AND ${expressions.effect_allele} != ''
          AND ${effectWeightCol} IS NOT NULL
          AND ${effectWeightCol} != '';
    `;
}