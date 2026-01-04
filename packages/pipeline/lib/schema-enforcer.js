/**
 * Enforces standardized schema for all output parquet files
 */

export const STANDARD_SCHEMA = {
    variant_id: 'VARCHAR',
    chr_name: 'VARCHAR', 
    chr_position: 'BIGINT',
    effect_allele: 'VARCHAR',
    other_allele: 'VARCHAR',
    effect_weight: 'DOUBLE',
    pgs_id: 'VARCHAR'
};

export function enforceStandardSchema(db, tableName) {
    const columns = Object.entries(STANDARD_SCHEMA)
        .map(([col, type]) => `${col} ${type}`)
        .join(', ');
    
    return db.exec(`
        CREATE OR REPLACE TABLE ${tableName}_standardized AS
        SELECT 
            COALESCE(variant_id, '') as variant_id,
            COALESCE(chr_name, '') as chr_name,
            COALESCE(chr_position, NULL) as chr_position,
            COALESCE(effect_allele, '') as effect_allele,
            COALESCE(other_allele, '') as other_allele,
            COALESCE(effect_weight, 0.0) as effect_weight,
            COALESCE(pgs_id, '') as pgs_id
        FROM ${tableName}
        WHERE variant_id IS NOT NULL AND variant_id != ''
          AND effect_allele IS NOT NULL AND effect_allele != ''
          AND effect_weight IS NOT NULL;
    `);
}