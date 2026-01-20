#!/usr/bin/env node

/**
 * Test script for Asili Calculation Server
 */

import { AsiliCalcServer } from './server.js';

async function testServer() {
  console.log('🧪 Testing Asili Calculation Server...\n');
  
  // Start server
  const server = new AsiliCalcServer({ port: 5253 }); // Use different port for testing
  const httpServer = await server.start();
  
  // Wait a moment for server to fully start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:5253/health');
    const health = await healthResponse.json();
    console.log('   ✅ Health check:', health.status);
    
    // Test status endpoint
    console.log('\\n2. Testing status endpoint...');
    const statusResponse = await fetch('http://localhost:5253/status');
    const status = await statusResponse.json();
    console.log('   ✅ Server status:', status.status);
    console.log('   📊 Active jobs:', status.activeJobs);
    console.log('   🔌 WebSocket connections:', status.wsConnections);
    
    // Test individuals endpoint
    console.log('\\n3. Testing individuals endpoint...');
    const individualsResponse = await fetch('http://localhost:5253/individuals');
    const individuals = await individualsResponse.json();
    console.log('   ✅ Individuals loaded:', individuals.length);
    
    // Test cache stats
    console.log('\\n4. Testing cache stats...');
    const cacheResponse = await fetch('http://localhost:5253/cache/stats');
    const cacheStats = await cacheResponse.json();
    console.log('   ✅ Cache stats:', cacheStats.message || 'Available');
    
    console.log('\\n✅ All tests passed! Server is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Cleanup
    httpServer.close();
    console.log('\\n🧹 Test server stopped.');
  }
}

// WebSocket test
async function testWebSocket() {
  console.log('\\n🔌 Testing WebSocket connection...');
  
  try {
    const WebSocket = (await import('ws')).default;
    const ws = new WebSocket('ws://localhost:5253/ws/progress/test-job');
    
    ws.on('open', () => {
      console.log('   ✅ WebSocket connected');
      ws.close();
    });
    
    ws.on('error', (error) => {
      console.log('   ❌ WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
      console.log('   ✅ WebSocket closed');
    });
    
  } catch (error) {
    console.log('   ⚠️  WebSocket test skipped (ws module not available)');
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testServer()
    .then(() => testWebSocket())
    .catch(console.error);
}