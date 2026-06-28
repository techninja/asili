/**
 * Gene table column definitions and value resolvers.
 * @module components/organisms/gene-table/gene-table-columns
 */

export const ALL_COLS = [
  { id: 'symbol', label: 'Gene', on: true },
  { id: 'chr', label: 'Chr', on: true },
  { id: 'category', label: 'Category', on: true },
  { id: 'publications', label: 'Studies', on: true },
  { id: 'exon_count', label: 'Exons', on: false },
  { id: 'map_location', label: 'Band', on: false },
  { id: 'variants', label: 'Variants', on: true },
  { id: 'nonref', label: 'Non-ref', on: true },
  { id: 'genotyped', label: 'Genotyped', on: false },
];

export function cellValue(gene, colId, stats) {
  const s = stats?.[gene.symbol];
  switch (colId) {
    case 'symbol':
      return `${gene.emoji || ''} ${gene.symbol}`;
    case 'chr':
      return gene.chr;
    case 'category':
      return gene.category;
    case 'publications':
      return gene.publications?.toLocaleString() || '\u2014';
    case 'exon_count':
      return gene.exon_count || '\u2014';
    case 'map_location':
      return gene.map_location || '\u2014';
    case 'variants':
      return s?.total?.toLocaleString() || '\u2014';
    case 'nonref':
      return s?.nonref?.toLocaleString() || '\u2014';
    case 'genotyped':
      return s?.genotyped?.toLocaleString() || '\u2014';
    default:
      return '\u2014';
  }
}

export function sortValue(gene, colId, stats) {
  const s = stats?.[gene.symbol];
  switch (colId) {
    case 'symbol':
      return gene.symbol;
    case 'chr':
      return (gene.chr === 'X' ? 23 : +gene.chr) * 1e9 + gene.start;
    case 'category':
      return gene.category;
    case 'publications':
      return gene.publications || 0;
    case 'exon_count':
      return gene.exon_count || 0;
    case 'map_location':
      return gene.map_location || '';
    case 'variants':
      return s?.total || 0;
    case 'nonref':
      return s?.nonref || 0;
    case 'genotyped':
      return s?.genotyped || 0;
    default:
      return 0;
  }
}

export function isNumeric(colId) {
  return ['publications', 'exon_count', 'variants', 'nonref', 'genotyped'].includes(colId);
}

/** Column picker dropdown. */
export function colPicker(host, html) {
  return html`
    <div class="gene-table__col-picker">
      ${host.columns.map(
        (col, i) => html`
          <label class="gene-table__col-option">
            <input
              type="checkbox"
              checked="${col.on}"
              onchange="${(h, e) => {
                const cols = [...h.columns];
                cols[i] = { ...cols[i], on: e.target.checked };
                h.columns = cols;
              }}"
            />
            ${col.label}
          </label>
        `,
      )}
    </div>
  `;
}
