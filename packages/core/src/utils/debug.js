/**
 * Shared debug utility for Asili core package
 * Provides timestamped logging with configurable levels
 */

export class Debug {
  static get level() {
    return (typeof window !== 'undefined' && window.DEBUG_LEVEL) || 0;
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