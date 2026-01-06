import { GameManager } from '../core/GameManager';
import { CONFIG, TraitKey } from '../config';
import { Streamer } from '../entities/Streamer';
import eventsData from '../data/events.json';

// Stat effects that can be applied
export interface StatEffects {
  money?: number;
  followers?: number;
  reputation?: number;
  // Core stats
  charisma?: number;
  consistency?: number;
  dramaRisk?: number;
  // New stats
  skill?: number;
  adaptability?: number;
  loyalty?: number;
  ambition?: number;
  burnout?: number;
}

// Stat check for a choice - determines success/failure
export interface StatCheck {
  stat: keyof Streamer['stats'] | 'burnout';
  target: number;  // Need to meet or exceed this value
  // Optional modifiers based on traits
  traitBonus?: { trait: TraitKey; bonus: number };
}

export interface EventChoice {
  text: string;
  // Simple effects (always applied if no stat check)
  effects?: StatEffects;
  // Stat check (if present, determines success/fail)
  statCheck?: StatCheck;
  successEffects?: StatEffects;
  failEffects?: StatEffects;
  // Trait grants
  grantsTrait?: TraitKey;
  grantsTraitOnSuccess?: TraitKey;
  grantsTraitOnFail?: TraitKey;
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  weight: number;
  platforms?: string[];   // Platform filter (SWITCH, YETUBE, OHFANS)
  genres?: string[];      // Genre filter (GAMING, VTUBER, etc.)
  // Minimum stat requirements for event to trigger
  minStats?: Partial<Record<keyof Streamer['stats'], number>>;
  maxStats?: Partial<Record<keyof Streamer['stats'], number>>;
  // Trait requirements
  requiresTraits?: TraitKey[];
  excludesTraits?: TraitKey[];
  choices: EventChoice[];
}

// Result of applying a choice
export interface ChoiceResult {
  success: boolean | null;  // null if no stat check
  statChecked?: string;
  rollValue?: number;
  targetValue?: number;
  effectsApplied: StatEffects;
  traitGranted?: TraitKey;
}

class EventSystemClass {
  private events: GameEvent[] = [];

  constructor() {
    this.loadEvents();
  }

  private loadEvents(): void {
    this.events = eventsData.events as GameEvent[];
  }

  /**
   * Check if a streamer meets the requirements for an event
   */
  private streamerMeetsRequirements(streamer: Streamer, event: GameEvent): boolean {
    // Check platform
    if (event.platforms && event.platforms.length > 0) {
      if (!event.platforms.includes(streamer.platform)) {
        return false;
      }
    }

    // Check genre
    if (event.genres && event.genres.length > 0) {
      if (!event.genres.includes(streamer.genre)) {
        return false;
      }
    }

    // Check minimum stats
    if (event.minStats) {
      for (const [stat, minValue] of Object.entries(event.minStats)) {
        const streamerValue = streamer.stats[stat as keyof typeof streamer.stats];
        if (streamerValue < minValue) {
          return false;
        }
      }
    }

    // Check maximum stats
    if (event.maxStats) {
      for (const [stat, maxValue] of Object.entries(event.maxStats)) {
        const streamerValue = streamer.stats[stat as keyof typeof streamer.stats];
        if (streamerValue > maxValue) {
          return false;
        }
      }
    }

    // Check required traits
    if (event.requiresTraits && event.requiresTraits.length > 0) {
      for (const trait of event.requiresTraits) {
        if (!streamer.hasTrait(trait)) {
          return false;
        }
      }
    }

    // Check excluded traits
    if (event.excludesTraits && event.excludesTraits.length > 0) {
      for (const trait of event.excludesTraits) {
        if (streamer.hasTrait(trait)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Roll for an event for a specific streamer
   */
  rollForEvent(targetPlatform?: string, targetStreamer?: Streamer): GameEvent | null {
    // Check if we should trigger an event
    if (Math.random() > CONFIG.EVENT_CHANCE_PER_DAY) {
      return null;
    }

    // Need at least one streamer for most events
    if (GameManager.getRoster().length === 0) {
      return null;
    }

    // Filter events based on streamer requirements
    const eligibleEvents = this.events.filter(e => {
      // If we have a target streamer, check all requirements
      if (targetStreamer) {
        return this.streamerMeetsRequirements(targetStreamer, e);
      }

      // Fallback: just check platform
      if (e.platforms && e.platforms.length > 0 && targetPlatform) {
        return e.platforms.includes(targetPlatform);
      }

      return true;
    });

    if (eligibleEvents.length === 0) {
      return null;
    }

    // Weighted random selection
    const totalWeight = eligibleEvents.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const event of eligibleEvents) {
      roll -= event.weight;
      if (roll <= 0) {
        return event;
      }
    }

    return eligibleEvents[0]; // Fallback
  }

  /**
   * Perform a stat check for a choice
   */
  performStatCheck(choice: EventChoice, streamer: Streamer): { success: boolean; roll: number; target: number } {
    if (!choice.statCheck) {
      return { success: true, roll: 0, target: 0 };
    }

    const check = choice.statCheck;
    let statValue: number;

    if (check.stat === 'burnout') {
      // For burnout, lower is better - invert the check
      statValue = 100 - streamer.burnout;
    } else {
      statValue = streamer.stats[check.stat];
    }

    // Add trait bonus if applicable
    if (check.traitBonus && streamer.hasTrait(check.traitBonus.trait)) {
      statValue += check.traitBonus.bonus;
    }

    // Add some randomness (roll 1-3, so even low stats can sometimes succeed)
    const roll = statValue + Math.floor(Math.random() * 3) + 1;
    const success = roll >= check.target;

    return { success, roll, target: check.target };
  }

  /**
   * Apply effects from a choice
   */
  private applyEffects(effects: StatEffects, streamer: Streamer | null): void {
    // Apply agency-level effects
    if (effects.money) {
      GameManager.addMoney(effects.money);
    }

    if (effects.reputation) {
      const agency = GameManager.currentAgency;
      agency.reputation = Math.max(0, Math.min(100, agency.reputation + effects.reputation));
    }

    // Apply streamer-level effects
    if (streamer) {
      if (effects.followers) {
        streamer.followers = Math.max(10, streamer.followers + effects.followers);
      }
      if (effects.charisma) {
        streamer.stats.charisma = Math.max(1, Math.min(10, streamer.stats.charisma + effects.charisma));
      }
      if (effects.consistency) {
        streamer.stats.consistency = Math.max(1, Math.min(10, streamer.stats.consistency + effects.consistency));
      }
      if (effects.dramaRisk) {
        streamer.stats.dramaRisk = Math.max(1, Math.min(10, streamer.stats.dramaRisk + effects.dramaRisk));
      }
      if (effects.skill) {
        streamer.stats.skill = Math.max(1, Math.min(10, streamer.stats.skill + effects.skill));
      }
      if (effects.adaptability) {
        streamer.stats.adaptability = Math.max(1, Math.min(10, streamer.stats.adaptability + effects.adaptability));
      }
      if (effects.loyalty) {
        streamer.stats.loyalty = Math.max(1, Math.min(10, streamer.stats.loyalty + effects.loyalty));
      }
      if (effects.ambition) {
        streamer.stats.ambition = Math.max(1, Math.min(10, streamer.stats.ambition + effects.ambition));
      }
      if (effects.burnout) {
        streamer.burnout = Math.max(0, Math.min(100, streamer.burnout + effects.burnout));
      }
    }
  }

  /**
   * Apply a choice and return the result
   */
  applyChoice(choice: EventChoice, streamerId: string | null): ChoiceResult {
    const streamer = streamerId ? GameManager.currentAgency.getStreamer(streamerId) : null;
    const result: ChoiceResult = {
      success: null,
      effectsApplied: {}
    };

    // Check if there's a stat check
    if (choice.statCheck && streamer) {
      const checkResult = this.performStatCheck(choice, streamer);
      result.success = checkResult.success;
      result.statChecked = choice.statCheck.stat;
      result.rollValue = checkResult.roll;
      result.targetValue = checkResult.target;

      // Apply success or fail effects
      if (checkResult.success) {
        if (choice.successEffects) {
          this.applyEffects(choice.successEffects, streamer);
          result.effectsApplied = choice.successEffects;
        }
        if (choice.grantsTraitOnSuccess && streamer) {
          streamer.addTrait(choice.grantsTraitOnSuccess);
          result.traitGranted = choice.grantsTraitOnSuccess;
        }
      } else {
        if (choice.failEffects) {
          this.applyEffects(choice.failEffects, streamer);
          result.effectsApplied = choice.failEffects;
        }
        if (choice.grantsTraitOnFail && streamer) {
          streamer.addTrait(choice.grantsTraitOnFail);
          result.traitGranted = choice.grantsTraitOnFail;
        }
      }
    } else {
      // No stat check - apply effects directly
      if (choice.effects) {
        this.applyEffects(choice.effects, streamer ?? null);
        result.effectsApplied = choice.effects;
      }
    }

    // Apply unconditional trait grant
    if (choice.grantsTrait && streamer) {
      streamer.addTrait(choice.grantsTrait);
      result.traitGranted = choice.grantsTrait;
    }

    // Trigger save
    GameManager.forceSave();

    return result;
  }

  // For adding events at runtime (future feature)
  addEvent(event: GameEvent): void {
    this.events.push(event);
  }

  getEventCount(): number {
    return this.events.length;
  }

  // Get all events (for debugging/testing)
  getAllEvents(): GameEvent[] {
    return [...this.events];
  }
}

export const EventSystem = new EventSystemClass();
