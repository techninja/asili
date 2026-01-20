#!/usr/bin/env node

/**
 * Settings generator for Asili configuration
 * Writes settings.json to data_out folder for frontend consumption
 */

import { promises as fs } from 'fs';
import path from 'path';

class SettingsGenerator {
  constructor(options = {}) {
    this.dataOutDir = options.dataOutDir || './data_out';
    this.calculationServer = options.calculationServer || process.env.CALCULATION_SERVER || '';
    this.cacheServer = options.cacheServer || process.env.CACHE_SERVER || '';
    this.mode = options.mode || process.env.ASILI_MODE || 'hybrid'; // 'local', 'server', 'hybrid'
  }

  async generateSettings() {
    const settings = {
      version: '1.0.0',
      mode: this.mode,
      
      // Server configuration
      servers: {
        calculation: this.calculationServer,
        cache: this.cacheServer
      },
      
      // Processing configuration
      processing: {
        enableLocalProcessing: this.mode === 'local' || this.mode === 'hybrid',
        enableServerProcessing: this.mode === 'server' || this.mode === 'hybrid',
        preferServer: this.mode === 'server',
        fallbackToLocal: this.mode === 'hybrid'
      },
      
      // Cache configuration
      cache: {
        enableDuckDBCache: true,
        cacheUrl: `${this.cacheServer}/cache`,
        syncInterval: 30000, // 30 seconds
        maxCacheAge: 86400000 // 24 hours
      },
      
      // Data sources
      data: {
        traitManifest: '/data/trait_manifest.json',
        traitData: '/data',
        cacheData: '/cache'
      },
      
      // Feature flags
      features: {
        queueProcessing: true,
        backgroundSync: this.mode !== 'local',
        realTimeUpdates: this.mode !== 'local',
        exportCache: true,
        importCache: true
      },
      
      // Development settings
      development: {
        debugLevel: process.env.DEBUG_LEVEL || 2,
        enableMockData: process.env.ENABLE_MOCK_DATA === 'true',
        skipCacheValidation: process.env.SKIP_CACHE_VALIDATION === 'true'
      },
      
      // Generated metadata
      generated: {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
      }
    };

    return settings;
  }

  async writeSettings() {
    // Ensure data_out directory exists
    await fs.mkdir(this.dataOutDir, { recursive: true });
    
    const settings = await this.generateSettings();
    const settingsPath = path.join(this.dataOutDir, 'settings.json');
    
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    
    console.log(`✅ Settings written to ${settingsPath}`);
    console.log(`   Mode: ${settings.mode}`);
    console.log(`   Calculation Server: ${settings.servers.calculation}`);
    console.log(`   Cache Server: ${settings.servers.cache}`);
    
    return settingsPath;
  }

  async validateSettings() {
    const settingsPath = path.join(this.dataOutDir, 'settings.json');
    
    try {
      const content = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(content);
      
      console.log('📋 Current settings:');
      console.log(`   Mode: ${settings.mode}`);
      console.log(`   Calculation Server: ${settings.servers?.calculation || 'Not set'}`);
      console.log(`   Cache Server: ${settings.servers?.cache || 'Not set'}`);
      console.log(`   Generated: ${settings.generated?.timestamp || 'Unknown'}`);
      
      return settings;
    } catch (error) {
      console.log('❌ No valid settings found');
      return null;
    }
  }
}

// CLI usage
async function main() {
  const command = process.argv[2];
  
  const generator = new SettingsGenerator({
    dataOutDir: process.argv[3] || './data_out',
    calculationServer: process.env.CALCULATION_SERVER || '',
    mode: process.env.ASILI_MODE || 'hybrid'
  });
  
  switch (command) {
    case 'generate':
    case 'write':
      await generator.writeSettings();
      break;
      
    case 'validate':
    case 'check':
      await generator.validateSettings();
      break;
      
    case 'show':
      const settings = await generator.generateSettings();
      console.log(JSON.stringify(settings, null, 2));
      break;
      
    default:
      console.log('Usage: node settings-generator.js <command> [data_out_dir]');
      console.log('Commands:');
      console.log('  generate  - Write settings.json to data_out folder');
      console.log('  validate  - Check existing settings.json');
      console.log('  show      - Display generated settings without writing');
      console.log('');
      console.log('Environment variables:');
      console.log('  CALCULATION_SERVER - Server URL (default: same origin)');
      console.log('  ASILI_MODE         - Mode: local, server, hybrid (default: hybrid)');
      console.log('  DEBUG_LEVEL        - Debug level 0-3 (default: 2)');
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SettingsGenerator };