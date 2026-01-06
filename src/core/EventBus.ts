// Simple pub/sub event bus for decoupled communication

type EventCallback = (...args: unknown[]) => void;

// Subscription handle for easy cleanup
export interface EventSubscription {
  unsubscribe: () => void;
}

class EventBusClass {
  private events: Map<string, Set<EventCallback>> = new Map();
  private listenerGroups: Map<string, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event
   * @returns Subscription handle with unsubscribe method
   */
  on(event: string, callback: EventCallback): EventSubscription {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);

    return {
      unsubscribe: () => this.off(event, callback),
    };
  }

  /**
   * Subscribe to an event with a group identifier for batch cleanup
   */
  onWithGroup(event: string, callback: EventCallback, groupId: string): EventSubscription {
    const subscription = this.on(event, callback);

    // Track callback in group for batch cleanup
    if (!this.listenerGroups.has(groupId)) {
      this.listenerGroups.set(groupId, new Set());
    }
    this.listenerGroups.get(groupId)!.add(callback);

    return subscription;
  }

  /**
   * Unsubscribe a callback from an event
   */
  off(event: string, callback: EventCallback): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Remove all listeners for a specific group (e.g., scene cleanup)
   */
  offGroup(groupId: string): void {
    const groupCallbacks = this.listenerGroups.get(groupId);
    if (!groupCallbacks) return;

    // Remove each callback from all events
    for (const [, eventCallbacks] of this.events) {
      for (const callback of groupCallbacks) {
        eventCallbacks.delete(callback);
      }
    }

    this.listenerGroups.delete(groupId);
  }

  /**
   * Emit an event with error handling
   */
  emit(event: string, ...args: unknown[]): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`[EventBus] Error in listener for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Clear all event listeners
   */
  clear(): void {
    this.events.clear();
    this.listenerGroups.clear();
  }

  /**
   * Get listener count for debugging
   */
  getListenerCount(event?: string): number {
    if (event) {
      return this.events.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const callbacks of this.events.values()) {
      total += callbacks.size;
    }
    return total;
  }
}

// Singleton instance
export const EventBus = new EventBusClass();

// Event type constants
export const EVENTS = {
  // State changes
  STATE_CHANGED: 'state:changed',
  MONEY_CHANGED: 'money:changed',
  WEEK_ADVANCED: 'week:advanced',
  ROSTER_CHANGED: 'roster:changed',
  SCHEDULE_CHANGED: 'schedule:changed',

  // Game flow
  GAME_STARTED: 'game:started',
  GAME_LOADED: 'game:loaded',
  GAME_SAVED: 'game:saved',
  GAME_OVER: 'game:over',
  WEEK_ENDED: 'world:weekEnded',

  // Events system
  EVENT_TRIGGERED: 'event:triggered',
  EVENT_RESOLVED: 'event:resolved',

  // UI
  SHOW_EVENT_MODAL: 'ui:showEventModal',
  HIDE_EVENT_MODAL: 'ui:hideEventModal',
  UPDATE_HUD: 'ui:updateHud',
  UPDATE_ROSTER: 'ui:updateRoster',
  PRE_WEEK_SETUP: 'ui:preWeekSetup',
  WEEK_RESULTS: 'ui:weekResults',

  // @deprecated - Legacy daily events (kept for backwards compatibility)
  /** @deprecated Use WEEK_ADVANCED instead */
  DAY_ADVANCED: 'day:advanced',
} as const;
