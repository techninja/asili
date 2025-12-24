// Debug logging utility
// Set window.DEBUG_LEVEL = 1 for basic logs, 2 for verbose logs
export class Debug {
  static get level() {
    return window.DEBUG_LEVEL || 0;
  }

  static log(level, component, ...args) {
    if (this.level >= level) {
      console.log(`[${new Date().toISOString()}] [${component}]`, ...args);
    }
  }

  static error(component, ...args) {
    console.error(`[${new Date().toISOString()}] [${component}]`, ...args);
  }
}