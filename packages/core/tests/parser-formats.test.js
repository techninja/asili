import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse23andMe, parseAncestryDNA, parseMyHeritage,
  parseFamilyTreeDNA, parseVCF,
} from '../src/parser/formats.js';

describe('parse23andMe', () => {
  it('parses a standard line', () => {
    const v = parse23andMe('rs12345\t1\t12345\tAG');
    assert.deepEqual(v, { rsid: 'rs12345', chromosome: '1', position: 12345, allele1: 'A', allele2: 'G' });
  });

  it('handles homozygous genotype', () => {
    const v = parse23andMe('rs99\t2\t500\tAA');
    assert.equal(v.allele1, 'A');
    assert.equal(v.allele2, 'A');
  });

  it('skips comment lines', () => {
    assert.equal(parse23andMe('# rsid\tchromosome\tposition\tgenotype'), null);
  });

  it('skips header line', () => {
    assert.equal(parse23andMe('rsid\tchromosome\tposition\tgenotype'), null);
  });

  it('skips MT chromosome', () => {
    assert.equal(parse23andMe('rs1\tMT\t100\tAG'), null);
  });

  it('skips invalid position', () => {
    assert.equal(parse23andMe('rs1\t1\t0\tAG'), null);
  });
});

describe('parseAncestryDNA', () => {
  it('parses a standard line', () => {
    const v = parseAncestryDNA('rs12345\t1\t12345\tA\tG');
    assert.deepEqual(v, { rsid: 'rs12345', chromosome: '1', position: 12345, allele1: 'A', allele2: 'G' });
  });

  it('skips header', () => {
    assert.equal(parseAncestryDNA('rsid\tchromosome\tposition\tallele1\tallele2'), null);
  });

  it('skips short lines', () => {
    assert.equal(parseAncestryDNA('rs1\t1\t100'), null);
  });
});

describe('parseMyHeritage', () => {
  it('parses CSV format', () => {
    const v = parseMyHeritage('"rs12345","1","12345","AG"');
    assert.deepEqual(v, { rsid: 'rs12345', chromosome: '1', position: 12345, allele1: 'A', allele2: 'G' });
  });

  it('parses TSV format', () => {
    const v = parseMyHeritage('rs12345\t1\t12345\tAG');
    assert.deepEqual(v, { rsid: 'rs12345', chromosome: '1', position: 12345, allele1: 'A', allele2: 'G' });
  });

  it('skips header', () => {
    assert.equal(parseMyHeritage('RSID,CHROMOSOME,POSITION,RESULT'), null);
  });
});

describe('parseFamilyTreeDNA', () => {
  it('parses a standard line', () => {
    const v = parseFamilyTreeDNA('rs12345\t1\t12345\tA\tG');
    assert.deepEqual(v, { rsid: 'rs12345', chromosome: '1', position: 12345, allele1: 'A', allele2: 'G' });
  });

  it('skips header', () => {
    assert.equal(parseFamilyTreeDNA('RSID\tCHROMOSOME\tPOSITION\tALLELE1\tALLELE2'), null);
  });
});

describe('parseVCF', () => {
  it('parses a standard VCF line', () => {
    const line = '1\t12345\trs99\tA\tG\t30\tPASS\t.\tGT\t0/1';
    const v = parseVCF(line);
    assert.equal(v.chromosome, '1');
    assert.equal(v.position, 12345);
    assert.equal(v.allele1, 'A');
    assert.equal(v.allele2, 'G');
  });

  it('handles homozygous alt', () => {
    const line = '2\t500\t.\tC\tT\t30\tPASS\t.\tGT\t1/1';
    const v = parseVCF(line);
    assert.equal(v.allele1, 'T');
    assert.equal(v.allele2, 'T');
  });

  it('generates rsid from position when missing', () => {
    const line = '3\t999\t.\tA\tG\t30\tPASS\t.\tGT\t0/1';
    const v = parseVCF(line);
    assert.equal(v.rsid, '3:999');
  });

  it('skips header lines', () => {
    assert.equal(parseVCF('##fileformat=VCFv4.2'), null);
    assert.equal(parseVCF('#CHROM\tPOS\tID'), null);
  });
});
