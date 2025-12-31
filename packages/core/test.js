/**
 * Simple test for @asili/core library
 * Tests progress tracking and basic interfaces
 */

import { ProgressTracker, PROGRESS_STAGES, PROGRESS_SUBSTAGES } from './src/progress/index.js';
import { BasicRiskCalculator } from './src/risk-calculator/basic.js';

async function testProgressTracker() {
  console.log('Testing ProgressTracker...');
  
  const tracker = new ProgressTracker();
  const updates = [];
  
  // Subscribe to updates
  const unsubscribe = tracker.subscribe((status) => {
    updates.push({ ...status });
    console.log(`Progress: ${status.stage} - ${status.message} (${status.progress}%)`);
  });
  
  // Test progress updates
  tracker.setStage(PROGRESS_STAGES.INITIALIZING, 'Starting up...');
  tracker.setProgress(25, 'Loading components...');
  tracker.setSubstage(PROGRESS_SUBSTAGES.FETCHING_TRAITS, 'Fetching trait data...');
  tracker.setProgress(50, 'Processing data...');
  tracker.complete('All done!');
  
  unsubscribe();
  
  console.log(`✓ ProgressTracker test passed (${updates.length} updates received)`);
  return true;
}

async function testRiskCalculator() {
  console.log('Testing BasicRiskCalculator...');
  
  const calculator = new BasicRiskCalculator({
    populationMean: 0,
    populationStd: 1
  });
  
  // Mock DNA data
  const dnaData = {
    format: 'test',
    variants: [
      { rsid: 'rs123', genotype: 'AA', chromosome: '1', position: 1000 },
      { rsid: 'rs456', genotype: 'AG', chromosome: '2', position: 2000 },
      { rsid: 'rs789', genotype: 'GG', chromosome: '3', position: 3000 }
    ],
    metadata: { source: 'test' }
  };
  
  // Mock trait
  const trait = {
    id: 'test_trait',
    name: 'Test Trait',
    category: 'test',
    pgsIds: ['PGS000001']
  };
  
  // Mock PGS data
  const pgsData = {
    id: 'test_pgs',
    type: 'pgs',
    variants: [
      { rsid: 'rs123', effectAllele: 'A', effectWeight: 0.5 },
      { rsid: 'rs456', effectAllele: 'G', effectWeight: -0.3 },
      { rsid: 'rs789', effectAllele: 'G', effectWeight: 0.8 }
    ],
    metadata: { source: 'test' }
  };
  
  const result = await calculator.calculateRisk(dnaData, trait, pgsData);
  
  console.log('Risk calculation result:', result);
  
  // Verify result structure
  if (result.traitId === trait.id && 
      typeof result.score === 'number' && 
      typeof result.percentile === 'number' &&
      result.interpretation &&
      result.metadata) {
    console.log('✓ BasicRiskCalculator test passed');
    return true;
  } else {
    console.error('✗ BasicRiskCalculator test failed - invalid result structure');
    return false;
  }
}

async function runTests() {
  console.log('Running @asili/core tests...\n');
  
  const results = [];
  
  try {
    results.push(await testProgressTracker());
  } catch (error) {
    console.error('✗ ProgressTracker test failed:', error);
    results.push(false);
  }
  
  try {
    results.push(await testRiskCalculator());
  } catch (error) {
    console.error('✗ BasicRiskCalculator test failed:', error);
    results.push(false);
  }
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\nTest Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };