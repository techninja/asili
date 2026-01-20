/**
 * Server API client for communicating with calculation server
 * Handles DNA storage, processing requests, and cache synchronization
 */

import { Debug } from '@asili/debug';

export class ServerAPIClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = 30000; // 30 seconds default timeout
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    Debug.log(3, 'ServerAPIClient', `${config.method || 'GET'} ${url}`);

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      Debug.log(1, 'ServerAPIClient', `Request failed: ${error.message}`);
      throw error;
    }
  }

  // Health and status
  async checkHealth() {
    try {
      const response = await this.request('/health');
      return { healthy: true, ...response };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async getStatus() {
    return await this.request('/status');
  }

  // Individual management
  async createIndividual(individualData) {
    return await this.request('/individuals', {
      method: 'POST',
      body: JSON.stringify(individualData)
    });
  }

  async getIndividuals() {
    return await this.request('/individuals');
  }

  async getIndividual(individualId) {
    return await this.request(`/individuals/${individualId}`);
  }

  async deleteIndividual(individualId) {
    return await this.request(`/individuals/${individualId}`, {
      method: 'DELETE'
    });
  }

  // DNA data management
  async uploadDNA(dnaFile, individualId, individualName, emoji = '👤', progressCallback) {
    const dnaContent = await dnaFile.text();
    
    Debug.log(1, 'ServerAPIClient', `Uploading DNA for ${individualName} (${individualId})`);

    // Subscribe to WebSocket progress updates if callback provided
    let wsUnsubscribe = null;
    if (progressCallback) {
      wsUnsubscribe = this.subscribeToUpdates(individualId, (data) => {
        if (data.type === 'upload-progress') {
          progressCallback(data.message, data.progress);
        }
      });
    }

    try {
      const response = await fetch(`${this.baseUrl}/dna/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dnaContent,
          individualId,
          individualName,
          emoji
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      Debug.log(1, 'ServerAPIClient', `DNA upload complete: ${result.variantCount} variants`);
      
      return result;
    } catch (error) {
      Debug.log(1, 'ServerAPIClient', `DNA upload failed: ${error.message}`);
      throw error;
    } finally {
      // Clean up WebSocket subscription
      if (wsUnsubscribe) {
        wsUnsubscribe();
      }
    }
  }

  async getDNAStatus(individualId) {
    return await this.request(`/dna/${individualId}/status`);
  }

  // Risk calculation with progress tracking
  async calculateRisk(traitId, individualId, progressCallback) {
    Debug.log(2, 'ServerAPIClient', `Requesting risk calculation: ${individualId}:${traitId}`);
    
    const response = await this.request('/calculate/risk', {
      method: 'POST',
      body: JSON.stringify({ individualId, traitId })
    });

    // If progressCallback provided, subscribe to progress updates
    if (progressCallback && response.jobId) {
      const unsubscribe = this.subscribeToProgress(response.jobId, progressCallback);
      
      // Return both result and unsubscribe function
      return { ...response, unsubscribe };
    }

    return response;
  }

  async calculateAllRisks(individualId, progressCallback) {
    Debug.log(1, 'ServerAPIClient', `Requesting batch risk calculation for ${individualId}`);
    
    const response = await this.request('/calculate/batch', {
      method: 'POST',
      body: JSON.stringify({ individualId })
    });

    if (progressCallback && response.jobId) {
      const unsubscribe = this.subscribeToProgress(response.jobId, progressCallback);
      return { ...response, unsubscribe };
    }

    return response;
  }

  // Queue management
  async getQueueStatus() {
    return await this.request('/queue/status');
  }

  async queueRiskCalculation(individualId, traitId, priority = 2) {
    return await this.request('/queue/add', {
      method: 'POST',
      body: JSON.stringify({
        type: 'risk_calculation',
        individualId,
        traitId,
        priority
      })
    });
  }

  async queueBatchCalculation(individualId, priority = 2) {
    return await this.request('/queue/add-batch', {
      method: 'POST',
      body: JSON.stringify({
        individualId,
        priority
      })
    });
  }

  async cancelJob(jobId) {
    return await this.request(`/queue/cancel/${jobId}`, {
      method: 'POST'
    });
  }

  // Results and cache
  async getResults(individualId) {
    return await this.request(`/results/${individualId}`);
  }

  async getResult(individualId, traitId) {
    return await this.request(`/results/${individualId}/${traitId}`);
  }

  async getCacheStats() {
    return await this.request('/cache/stats');
  }

  async exportCache(format = 'parquet') {
    const response = await fetch(`${this.baseUrl}/cache/export?format=${format}`);
    if (!response.ok) {
      throw new Error(`Cache export failed: ${response.status}`);
    }
    return response.blob();
  }

  async clearCache(individualId = null) {
    const endpoint = individualId ? `/cache/clear/${individualId}` : '/cache/clear';
    return await this.request(endpoint, { method: 'POST' });
  }

  // Real-time updates via WebSocket
  subscribeToUpdates(individualId, callback) {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/ws/${individualId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callback(data);
      } catch (error) {
        Debug.log(2, 'ServerAPIClient', 'Failed to parse WS data:', error);
      }
    };

    ws.onerror = (error) => {
      Debug.log(2, 'ServerAPIClient', 'WebSocket error:', error);
    };

    return () => ws.close();
  }

  // Subscribe to progress updates for specific operations
  subscribeToProgress(jobId, callback) {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/ws/progress/${jobId}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress') {
          callback(data.message, data.percent);
        }
      } catch (error) {
        Debug.log(2, 'ServerAPIClient', 'Failed to parse progress data:', error);
      }
    };

    return () => ws.close();
  }

  // Batch operations
  async batchRequest(requests) {
    return await this.request('/batch', {
      method: 'POST',
      body: JSON.stringify({ requests })
    });
  }

  // File downloads
  async downloadFile(path) {
    const response = await fetch(`${this.baseUrl}/files/${path}`);
    if (!response.ok) {
      throw new Error(`File download failed: ${response.status}`);
    }
    return response.blob();
  }
}

// Factory function with settings integration
export async function createServerClient(settings) {
  const calculationServer = settings.getCalculationServer();
  
  // Use current origin if no server specified (same-origin requests)
  const serverUrl = calculationServer || window.location.origin;
  
  const client = new ServerAPIClient(serverUrl);
  
  // Test connection
  const health = await client.checkHealth();
  if (!health.healthy) {
    throw new Error(`Server not available: ${health.error}`);
  }

  Debug.log(1, 'ServerAPIClient', `Connected to server: ${serverUrl}`);
  return client;
}