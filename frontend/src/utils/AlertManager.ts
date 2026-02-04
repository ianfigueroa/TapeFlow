/**
 * AlertManager - Centralized alert system for TapeFlow
 * 
 * Handles:
 * - Sound alerts using Web Audio API (no external files needed)
 * - Desktop notifications via Notification API
 * - Alert cooldowns to prevent spam
 * - Visual highlighting signals
 */

import { useSettingsStore } from '../stores/useSettingsStore';

export type AlertType = 'whale' | 'break' | 'velocity' | 'wall' | 'spoof' | 'generic';

interface AlertConfig {
  frequency: number;
  duration: number;
  oscillatorType: OscillatorType;
}

// Sound configurations for different alert types
const ALERT_CONFIGS: Record<AlertType, AlertConfig> = {
  whale: { frequency: 600, duration: 300, oscillatorType: 'sine' },      // Deep tone for whale
  break: { frequency: 1200, duration: 150, oscillatorType: 'square' },   // Sharp tone for price break
  velocity: { frequency: 900, duration: 200, oscillatorType: 'sine' },   // Medium tone for velocity
  wall: { frequency: 400, duration: 400, oscillatorType: 'triangle' },   // Low rumble for wall
  spoof: { frequency: 1500, duration: 100, oscillatorType: 'sawtooth' }, // Quick chirp for spoof
  generic: { frequency: 800, duration: 200, oscillatorType: 'sine' },    // Standard alert
};

class AlertManager {
  private audioContext: AudioContext | null = null;
  private lastAlertTimes: Map<string, number> = new Map();
  
  /**
   * Get or create the AudioContext (lazy init to comply with browser policies)
   */
  private getAudioContext(): AudioContext | null {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (err) {
        console.warn('[AlertManager] Failed to create AudioContext:', err);
        return null;
      }
    }
    return this.audioContext;
  }
  
  /**
   * Check if enough time has passed since the last alert of this type
   */
  private checkCooldown(alertKey: string): boolean {
    const settings = useSettingsStore.getState().visualization;
    const cooldownMs = settings.alertCooldownSeconds * 1000;
    const lastTime = this.lastAlertTimes.get(alertKey) || 0;
    const now = Date.now();
    
    if (now - lastTime < cooldownMs) {
      return false; // Still in cooldown
    }
    
    this.lastAlertTimes.set(alertKey, now);
    return true;
  }
  
  /**
   * Play a beep sound using Web Audio API
   */
  playSound(type: AlertType = 'generic', bypassCooldown = false): void {
    const settings = useSettingsStore.getState().visualization;
    
    // Check if sound alerts are enabled
    if (!settings.enableSoundAlerts) return;
    
    // Check cooldown (unless bypassed)
    if (!bypassCooldown && !this.checkCooldown(`sound_${type}`)) return;
    
    const ctx = this.getAudioContext();
    if (!ctx) return;
    
    // Resume context if suspended (browser policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    try {
      const config = ALERT_CONFIGS[type];
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = config.frequency;
      oscillator.type = config.oscillatorType;
      
      const volume = settings.alertVolume || 0.5;
      const now = ctx.currentTime;
      const duration = config.duration / 1000;
      
      // Envelope: quick attack, sustain, decay
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume * 0.4, now + 0.01); // Quick attack
      gainNode.gain.setValueAtTime(volume * 0.4, now + duration * 0.5); // Sustain
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration); // Decay
      
      oscillator.start(now);
      oscillator.stop(now + duration);
      
      // Cleanup
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    } catch (err) {
      console.warn('[AlertManager] Sound playback failed:', err);
    }
  }
  
  /**
   * Play a double-beep pattern for urgent alerts
   */
  playUrgentSound(type: AlertType = 'generic'): void {
    this.playSound(type, true);
    setTimeout(() => this.playSound(type, true), 150);
  }
  
  /**
   * Show a desktop notification
   */
  showDesktopNotification(title: string, body: string, type: AlertType = 'generic'): void {
    const settings = useSettingsStore.getState().visualization;
    
    // Check if desktop notifications are enabled
    if (!settings.enableDesktopNotifications) return;
    
    // Check cooldown
    if (!this.checkCooldown(`notification_${type}`)) return;
    
    // Check if Notifications are supported
    if (!('Notification' in window)) {
      console.warn('[AlertManager] Notifications not supported');
      return;
    }
    
    // Check permission
    if (Notification.permission === 'granted') {
      this.createNotification(title, body);
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          this.createNotification(title, body);
        }
      });
    }
  }
  
  private createNotification(title: string, body: string): void {
    try {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'tapeflow-alert', // Replace existing notifications
        requireInteraction: false,
        silent: true, // We handle our own sounds
      });
      
      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
      
      // Focus window on click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (err) {
      console.warn('[AlertManager] Notification creation failed:', err);
    }
  }
  
  /**
   * Combined alert - plays sound and shows notification
   */
  triggerAlert(
    title: string, 
    message: string, 
    type: AlertType = 'generic',
    options?: { urgent?: boolean; soundOnly?: boolean; notificationOnly?: boolean }
  ): void {
    if (!options?.notificationOnly) {
      if (options?.urgent) {
        this.playUrgentSound(type);
      } else {
        this.playSound(type);
      }
    }
    
    if (!options?.soundOnly) {
      this.showDesktopNotification(title, message, type);
    }
  }
  
  /**
   * Request notification permission (call this on app startup)
   */
  requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) {
      return Promise.resolve('unsupported');
    }
    
    if (Notification.permission === 'granted') {
      return Promise.resolve('granted');
    }
    
    if (Notification.permission === 'denied') {
      return Promise.resolve('denied');
    }
    
    return Notification.requestPermission();
  }
  
  /**
   * Clear cooldown timers (for testing or reset)
   */
  clearCooldowns(): void {
    this.lastAlertTimes.clear();
  }
  
  /**
   * Test the alert system (plays a sound immediately)
   */
  testAlert(type: AlertType = 'generic'): void {
    this.playSound(type, true); // Bypass cooldown for testing
  }
}

// Singleton instance
export const alertManager = new AlertManager();

// Export for direct usage
export default alertManager;
