import { AgencyData } from '../entities/Agency';
import { Streamer, StreamerData } from '../entities/Streamer';
import { CONFIG, PlatformKey, GenreKey } from '../config';
import { EventBus, EVENTS } from './EventBus';
import { WorldState, WorldStateData } from '../world/WorldState';

const SAVE_KEY = 'streamlord_save';
const CURRENT_VERSION = 6;

export interface SaveData {
  version: number;
  agency: AgencyData;
  world?: WorldStateData;  // Added in v5
  timestamp: number;
}

// Platform name migration map
const PLATFORM_MIGRATION: Record<string, string> = {
  TWITCH: 'SWITCH',
  YOUTUBE: 'YETUBE',
  FANSLY: 'OHFANS',
};

// Niche to Genre migration map
const NICHE_TO_GENRE: Record<string, GenreKey> = {
  // Old niche names
  'Just Chatting': 'VARIETY',
  'Variety Gaming': 'GAMING',
  'FPS Sweat': 'GAMING',
  'ASMR': 'ASMR',
  'IRL': 'IRL',
  'Speedrunning': 'GAMING',
  'Cozy Games': 'GAMING',
  'Horror': 'GAMING',
  'VTuber': 'VTUBER',
  'Hot Tub': 'IRL',
  'Music': 'MUSIC',
  'Art': 'CREATIVE',
  'Cooking': 'CREATIVE',
  // Genre names (if saves somehow have these)
  'Gaming': 'GAMING',
  'Reaction': 'REACTION',
  'Educational': 'EDUCATIONAL',
  'Fitness': 'FITNESS',
  'Creative': 'CREATIVE',
  'Variety': 'VARIETY',
};

// Type for migration function
type MigrationFn = (agency: AgencyData, generatePool: (day: number) => StreamerData[]) => AgencyData;

// Migration registry - each migration transforms from version N to N+1
const MIGRATIONS: Record<number, { description: string; migrate: MigrationFn }> = {
  1: {
    description: 'Platform renames (TWITCH→SWITCH, etc.)',
    migrate: (agency) => {
      // Migrate roster streamer platforms
      if (agency.roster) {
        agency.roster = agency.roster.map(s => ({
          ...s,
          platform: (PLATFORM_MIGRATION[s.platform] || s.platform) as PlatformKey,
        }));
      }
      // Migrate unlocked platforms
      if (agency.unlockedPlatforms) {
        agency.unlockedPlatforms = agency.unlockedPlatforms.map(
          p => PLATFORM_MIGRATION[p] || p
        );
      }
      return agency;
    },
  },

  2: {
    description: 'Add scouting level and streamer pool',
    migrate: (agency, generatePool) => {
      if (agency.scoutingLevel === undefined) {
        agency.scoutingLevel = 0;
      }
      if (!agency.streamerPool || agency.streamerPool.length === 0) {
        agency.streamerPool = generatePool(agency.currentDay || 1);
      }
      return agency;
    },
  },

  3: {
    description: 'Add new stats, genres, traits, burnout',
    migrate: (agency) => {
      const migrateStreamer = (s: Partial<StreamerData> & { niche?: string }): StreamerData => {
        const randStat = () => Math.floor(Math.random() * 10) + 1;
        const genre: GenreKey = s.genre || NICHE_TO_GENRE[s.niche || ''] || 'VARIETY';
        const stats = {
          charisma: s.stats?.charisma ?? randStat(),
          consistency: s.stats?.consistency ?? randStat(),
          dramaRisk: s.stats?.dramaRisk ?? randStat(),
          skill: s.stats?.skill ?? randStat(),
          adaptability: s.stats?.adaptability ?? randStat(),
          loyalty: s.stats?.loyalty ?? randStat(),
          ambition: s.stats?.ambition ?? randStat(),
        };
        return {
          ...s,
          genre,
          stats,
          traits: s.traits || [],
          burnout: s.burnout ?? Math.floor(Math.random() * 20),
        } as StreamerData;
      };

      if (agency.roster) {
        agency.roster = agency.roster.map(migrateStreamer);
      }
      if (agency.streamerPool) {
        agency.streamerPool = agency.streamerPool.map(migrateStreamer);
      }
      return agency;
    },
  },

  4: {
    description: 'Add world state',
    migrate: (agency) => {
      // World state will be generated fresh when GameManager initializes
      return agency;
    },
  },

  5: {
    description: 'Add weekly progression system',
    migrate: (agency) => {
      // Calculate currentWeek from currentDay
      const currentDay = agency.currentDay || 1;
      agency.currentWeek = Math.ceil(currentDay / 7);

      // Calculate weeksInDebt from daysInDebt
      const daysInDebt = agency.daysInDebt || 0;
      agency.weeksInDebt = Math.floor(daysInDebt / 7);

      // Initialize empty weeklySchedules
      agency.weeklySchedules = {};

      // Add age and experienceYears to streamers
      const migrateStreamerAge = (s: StreamerData): StreamerData => {
        if (s.age === undefined) {
          const ageRoll = Math.random();
          if (ageRoll < 0.4) {
            s.age = 18 + Math.floor(Math.random() * 7);
          } else if (ageRoll < 0.75) {
            s.age = 25 + Math.floor(Math.random() * 10);
          } else if (ageRoll < 0.95) {
            s.age = 35 + Math.floor(Math.random() * 10);
          } else {
            s.age = 45 + Math.floor(Math.random() * 11);
          }
        }

        if (s.experienceYears === undefined) {
          const followers = s.followers || 0;
          if (followers < 1000) {
            s.experienceYears = Math.floor(Math.random() * 3);
          } else if (followers < 10000) {
            s.experienceYears = 1 + Math.floor(Math.random() * 4);
          } else if (followers < 50000) {
            s.experienceYears = 2 + Math.floor(Math.random() * 5);
          } else {
            s.experienceYears = 3 + Math.floor(Math.random() * 8);
          }
        }
        return s;
      };

      if (agency.roster) {
        agency.roster = agency.roster.map(migrateStreamerAge);
      }
      if (agency.streamerPool) {
        agency.streamerPool = agency.streamerPool.map(migrateStreamerAge);
      }
      return agency;
    },
  },
};

class SaveManagerClass {
  private autoSaveEnabled = true;

  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  save(agency: AgencyData): void {
    const saveData: SaveData = {
      version: CURRENT_VERSION,
      agency,
      world: WorldState.isInitialized ? WorldState.serialize() : undefined,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
      EventBus.emit(EVENTS.GAME_SAVED);
    } catch (e) {
      console.error('Failed to save game:', e);
    }
  }

  load(): { agency: AgencyData; world?: WorldStateData } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;

      const saveData: SaveData = JSON.parse(raw);

      // Run migrations
      const migrated = this.migrate(saveData);

      EventBus.emit(EVENTS.GAME_LOADED);
      return {
        agency: migrated.agency,
        world: migrated.world,
      };
    } catch (e) {
      console.error('Failed to load game:', e);
      return null;
    }
  }

  /**
   * Migrate save data through versions using the migration registry
   */
  private migrate(saveData: SaveData): SaveData {
    let { version, agency } = saveData;

    // Run migrations sequentially from current version to CURRENT_VERSION
    while (version < CURRENT_VERSION) {
      const migration = MIGRATIONS[version];
      if (!migration) {
        console.error(`[SaveManager] No migration found for version ${version}`);
        break;
      }

      console.log(`[SaveManager] Migrating v${version} → v${version + 1}: ${migration.description}`);

      try {
        agency = migration.migrate(agency, (day) => this.generateInitialPool(day));
        version++;
      } catch (error) {
        console.error(`[SaveManager] Migration failed at v${version}:`, error);
        break;
      }
    }

    return { ...saveData, version, agency };
  }

  /**
   * Generate initial streamer pool for migration
   */
  private generateInitialPool(currentDay: number): AgencyData['streamerPool'] {
    const pool: AgencyData['streamerPool'] = [];
    const count = CONFIG.INITIAL_POOL_SIZE;

    // Distribution: 60% Switch, 25% YeTube, 15% OhFans
    const distribution: { platform: PlatformKey; count: number }[] = [
      { platform: 'SWITCH', count: Math.floor(count * 0.6) },
      { platform: 'YETUBE', count: Math.floor(count * 0.25) },
      { platform: 'OHFANS', count: Math.floor(count * 0.15) },
    ];

    for (const { platform, count: num } of distribution) {
      for (let i = 0; i < num; i++) {
        pool.push(Streamer.generateRandom(currentDay, platform).toData());
      }
    }

    return pool;
  }

  deleteSave(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  getSaveInfo(): { exists: boolean; timestamp?: number } {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { exists: false };

      const saveData: SaveData = JSON.parse(raw);
      return { exists: true, timestamp: saveData.timestamp };
    } catch {
      return { exists: false };
    }
  }

  enableAutoSave(): void {
    this.autoSaveEnabled = true;
  }

  disableAutoSave(): void {
    this.autoSaveEnabled = false;
  }

  isAutoSaveEnabled(): boolean {
    return this.autoSaveEnabled;
  }
}

export const SaveManager = new SaveManagerClass();
