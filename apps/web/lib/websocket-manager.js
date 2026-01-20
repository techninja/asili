/**
 * WebSocket manager for persistent connection to calculation server
 */

import { Debug } from '@asili/debug';

export class WebSocketManager {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const wsUrl = this.serverUrl.replace(/^http/, 'ws');
      Debug.log(2, 'WebSocketManager', `Connecting to: ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        Debug.log(2, 'WebSocketManager', 'Connected to server');
        this.reconnectAttempts = 0;
        // Request current queue state on connect
        this.send({ type: 'queue-state-request' });
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          Debug.log(3, 'WebSocketManager', 'Received message:', data);
          this.handleMessage(data);
        } catch (error) {
          Debug.log(1, 'WebSocketManager', 'Failed to parse message:', error);
        }
      };

      this.ws.onclose = (event) => {
        Debug.log(2, 'WebSocketManager', 'Connection closed:', event.code);
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => this.reconnect(), this.reconnectDelay);
        }
      };

      this.ws.onerror = (error) => {
        Debug.log(1, 'WebSocketManager', 'Connection error:', error);
        reject(error);
      };
    });
  }

  reconnect() {
    this.reconnectAttempts++;
    Debug.log(2, 'WebSocketManager', `Reconnecting... attempt ${this.reconnectAttempts}`);
    this.connect().catch(() => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => this.reconnect(), this.reconnectDelay * this.reconnectAttempts);
      }
    });
  }

  handleMessage(data) {
    const listeners = this.listeners.get(data.type) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        Debug.log(1, 'WebSocketManager', 'Listener error:', error);
      }
    });
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
  }

  off(eventType, callback) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  addToQueue(traitId, individualId) {
    this.send({
      type: 'queue-add',
      traitId,
      individualId
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
  }
}