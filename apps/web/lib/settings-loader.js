/**
 * Settings loader for frontend configuration
 * Reads settings.json and configures processing mode
 */

import { Debug } from '@asili/debug';

export class SettingsLoader {
  constructor() {
    this.settings = null;
    this.loaded = false;
  }

  async loadSettings() {
    if (this.loaded) return this.settings;

    try {
      const response = await fetch('/data/settings.json');
      if (!response.ok) {
        throw new Error(`Settings not found: ${response.status}`);
      }

      this.settings = await response.json();
      this.loaded = true;

      Debug.log(1, 'SettingsLoader', `Loaded settings - Mode: ${this.settings.mode}`);
      Debug.log(2, 'SettingsLoader', `Calculation server: ${this.settings.servers?.calculation}`);

      return this.settings;
    } catch (error) {
      Debug.log(1, 'SettingsLoader', 'Failed to load settings, using defaults:', error.message);
      
      // Fallback to local-only mode
      this.settings = this.getDefaultSettings();
      this.loaded = true;
      return this.settings;
    }
  }

  getDefaultSettings() {
    return {
      version: '1.0.0',
      mode: 'local',
      servers: {
        calculation: null,
        cache: null
      },
      processing: {
        enableLocalProcessing: true,
        enableServerProcessing: false,
        preferServer: false,
        fallbackToLocal: false
      },
      cache: {
        enableDuckDBCache: false,
        cacheUrl: null,
        syncInterval: 30000,
        maxCacheAge: 86400000
      },
      data: {
        traitManifest: '/data/packs/trait_manifest.json',
        traitData: '/data/packs',
        cacheData: '/cache'
      },
      features: {
        queueProcessing: true,
        backgroundSync: false,
        realTimeUpdates: false,
        exportCache: false,
        importCache: false
      },
      development: {
        debugLevel: 2,
        enableMockData: false,
        skipCacheValidation: false
      }
    };
  }

  getMode() {
    return this.settings?.mode || 'local';
  }

  isLocalProcessingEnabled() {
    return this.settings?.processing?.enableLocalProcessing !== false;
  }

  isServerProcessingEnabled() {
    return this.settings?.processing?.enableServerProcessing === true;
  }

  shouldPreferServer() {
    return this.settings?.processing?.preferServer === true;
  }

  shouldFallbackToLocal() {
    return this.settings?.processing?.fallbackToLocal === true;
  }

  getCalculationServer() {
    return this.settings?.servers?.calculation;
  }

  getCacheServer() {
    return this.settings?.servers?.cache;
  }

  getCacheUrl() {
    return this.settings?.cache?.cacheUrl;
  }

  isDuckDBCacheEnabled() {
    return this.settings?.cache?.enableDuckDBCache === true;
  }

  isFeatureEnabled(feature) {
    return this.settings?.features?.[feature] === true;
  }

  getDebugLevel() {
    return this.settings?.development?.debugLevel || 2;
  }

  // Server communication helpers
  async testServerConnection() {
    const server = this.getCalculationServer();
    if (!server) return false;

    try {
      const response = await fetch(`${server}/health`, {
        method: 'GET',
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      Debug.log(2, 'SettingsLoader', `Server connection test failed: ${error.message}`);
      return false;
    }
  }

  async getServerStatus() {
    const server = this.getCalculationServer();
    if (!server) return null;

    try {
      const response = await fetch(`${server}/status`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      Debug.log(2, 'SettingsLoader', `Failed to get server status: ${error.message}`);
    }
    return null;
  }

  // Cache synchronization
  async syncWithServer() {
    if (!this.isFeatureEnabled('backgroundSync')) return false;

    const cacheServer = this.getCacheServer();
    if (!cacheServer) return false;

    try {
      // Check if server has newer cache
      const response = await fetch(`${cacheServer}/cache-stats`);
      if (response.ok) {
        const serverStats = await response.json();
        Debug.log(2, 'SettingsLoader', `Server cache stats:`, serverStats);
        return true;
      }
    } catch (error) {
      Debug.log(2, 'SettingsLoader', `Cache sync failed: ${error.message}`);
    }
    return false;
  }

  // Configuration validation
  validateSettings() {
    if (!this.settings) return false;

    const required = ['mode', 'processing', 'data'];
    for (const field of required) {
      if (!this.settings[field]) {
        Debug.log(1, 'SettingsLoader', `Missing required field: ${field}`);
        return false;
      }
    }

    if (this.settings.mode === 'server' && !this.getCalculationServer()) {
      Debug.log(1, 'SettingsLoader', 'Server mode requires calculation server URL');
      return false;
    }

    return true;
  }

  // Dynamic mode switching
  async switchToServerMode() {
    if (!this.settings) return false;

    const serverAvailable = await this.testServerConnection();
    if (serverAvailable) {
      this.settings.processing.preferServer = true;
      this.settings.processing.enableServerProcessing = true;
      Debug.log(1, 'SettingsLoader', 'Switched to server mode');
      return true;
    }
    return false;
  }

  switchToLocalMode() {
    if (!this.settings) return false;

    this.settings.processing.preferServer = false;
    this.settings.processing.enableLocalProcessing = true;
    Debug.log(1, 'SettingsLoader', 'Switched to local mode');
    return true;
  }
}

// Global settings instance
let globalSettings = null;

export async function getSettings() {
  if (!globalSettings) {
    globalSettings = new SettingsLoader();
    await globalSettings.loadSettings();
  }
  return globalSettings;
}

export async function reloadSettings() {
  globalSettings = new SettingsLoader();
  await globalSettings.loadSettings();
  return globalSettings;
}