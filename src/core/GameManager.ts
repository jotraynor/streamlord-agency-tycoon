import { Agency, AgencyData } from '../entities/Agency';
import { Streamer } from '../entities/Streamer';
import { EventBus, EVENTS } from './EventBus';
import { SaveManager } from './SaveManager';
import { PlatformKey } from '../config';
import { WorldState } from '../world/WorldState';
import { WorldSimulator, WeeklySimulationResult } from '../world/WorldSimulator';
import { WeeklySchedule } from '../entities/WeeklySchedule';
import { AgencyWeeklyResult } from '../entities/WeeklyResults';

class GameManagerClass {
  private agency: Agency | null = null;
  private initialized = false;

  // Getters for safe access
  get isInitialized(): boolean {
    return this.initialized;
  }

  get currentAgency(): Agency {
    if (!this.agency) {
      throw new Error('GameManager not initialized. Call newGame() or loadGame() first.');
    }
    return this.agency;
  }

  // Game flow
  newGame(): void {
    try {
      // Reset world state for new game
      WorldState.reset();

      this.agency = new Agency();
      // Initialize the streamer pool for new games
      this.agency.initializeStreamerPool();

      // Initialize the world state with 500+ streamers
      WorldState.initialize();

      // Validate world state initialized correctly
      if (!WorldState.isInitialized) {
        console.error('[GameManager] WorldState failed to initialize');
        throw new Error('World initialization failed');
      }

      this.initialized = true;
      this.autoSave();
      EventBus.emit(EVENTS.GAME_STARTED);
      EventBus.emit(EVENTS.STATE_CHANGED);

      console.log('[GameManager] New game started successfully');
    } catch (error) {
      console.error('[GameManager] Failed to start new game:', error);
      this.initialized = false;
      throw error;
    }
  }

  // Get agency for direct access (used by UI components)
  getAgency(): Agency {
    return this.currentAgency;
  }

  // Get world state for UI components
  getWorldState(): typeof WorldState {
    return WorldState;
  }

  loadGame(): boolean {
    try {
      const result = SaveManager.load();
      if (!result) {
        console.log('[GameManager] No save data found');
        return false;
      }

      this.agency = Agency.fromData(result.agency);

      // Load or initialize world state
      if (result.world) {
        try {
          WorldState.deserialize(result.world);
        } catch (worldError) {
          console.warn('[GameManager] Failed to load world state, generating fresh:', worldError);
          WorldState.reset();
          WorldState.initialize();
        }
      } else {
        // Migration from v4: generate world state for existing save
        console.log('[GameManager] No world data in save, initializing fresh');
        WorldState.reset();
        WorldState.initialize();
      }

      // Validate world state
      if (!WorldState.isInitialized) {
        console.warn('[GameManager] WorldState not initialized after load, initializing');
        WorldState.reset();
        WorldState.initialize();
      }

      this.initialized = true;
      EventBus.emit(EVENTS.GAME_LOADED);
      EventBus.emit(EVENTS.STATE_CHANGED);

      console.log('[GameManager] Game loaded successfully');
      return true;
    } catch (error) {
      console.error('[GameManager] Failed to load game:', error);
      this.initialized = false;
      return false;
    }
  }

  hasSave(): boolean {
    return SaveManager.hasSave();
  }

  /**
   * @deprecated Use advanceWeek() instead. This method is kept for save compatibility only.
   * The game now uses weekly progression exclusively.
   */
  advanceDay(): {
    revenue: number;
    isBankrupt: boolean;
    expiredContracts: Streamer[];
    expiringContracts: Streamer[];
    newlyUnlockedPlatforms: string[];
    weeklySimulation?: WeeklySimulationResult;
  } {
    console.warn('[GameManager] advanceDay() is deprecated. Use advanceWeek() instead.');
    const result = this.currentAgency.advanceDay();

    // Advance the world calendar
    const worldAdvance = WorldState.advanceDay();

    EventBus.emit(EVENTS.DAY_ADVANCED, this.currentAgency.currentDay);
    EventBus.emit(EVENTS.MONEY_CHANGED, this.currentAgency.money);

    if (result.isBankrupt) {
      EventBus.emit(EVENTS.GAME_OVER, 'bankruptcy');
    }

    // Run weekly simulation at end of week (Sunday)
    let weeklySimulation: WeeklySimulationResult | undefined;
    if (worldAdvance.isEndOfWeek && WorldState.isInitialized) {
      weeklySimulation = WorldSimulator.simulateWeek();
      EventBus.emit(EVENTS.WEEK_ENDED, weeklySimulation);
    }

    this.autoSave();
    EventBus.emit(EVENTS.STATE_CHANGED);

    return { ...result, weeklySimulation };
  }

  // ============================================
  // WEEKLY SYSTEM METHODS
  // ============================================

  /**
   * Advance the game by one week - the new main game loop
   * This replaces daily progression with weekly strategic gameplay
   */
  advanceWeek(): AgencyWeeklyResult & { worldSimulation?: WeeklySimulationResult } {
    // Run agency's weekly simulation
    const result = this.currentAgency.advanceWeek();

    // Advance world calendar by a full week
    for (let i = 0; i < 7; i++) {
      WorldState.advanceDay();
    }

    // Run world simulation (AI agencies, retirements, etc.)
    let worldSimulation: WeeklySimulationResult | undefined;
    if (WorldState.isInitialized) {
      worldSimulation = WorldSimulator.simulateWeek();
      EventBus.emit(EVENTS.WEEK_ENDED, worldSimulation);
    }

    // Emit events
    EventBus.emit(EVENTS.WEEK_ADVANCED, this.currentAgency.currentWeek);
    EventBus.emit(EVENTS.MONEY_CHANGED, this.currentAgency.money);

    // Check for bankruptcy
    if (this.currentAgency.isBankrupt()) {
      EventBus.emit(EVENTS.GAME_OVER, 'bankruptcy');
    }

    this.autoSave();
    EventBus.emit(EVENTS.STATE_CHANGED);

    return { ...result, worldSimulation };
  }

  /**
   * Get a streamer's weekly schedule
   */
  getStreamerSchedule(streamerId: string): WeeklySchedule {
    return this.currentAgency.getStreamerSchedule(streamerId);
  }

  /**
   * Set a streamer's weekly schedule
   */
  setStreamerSchedule(streamerId: string, schedule: WeeklySchedule): void {
    this.currentAgency.setStreamerSchedule(streamerId, schedule);
    EventBus.emit(EVENTS.SCHEDULE_CHANGED, { streamerId, schedule });
    this.autoSave();
  }

  /**
   * Get all weekly schedules for roster streamers
   */
  getAllSchedules(): Map<string, WeeklySchedule> {
    return this.currentAgency.getAllSchedules();
  }

  /**
   * Get estimated weekly revenue based on current schedules
   */
  getEstimatedWeeklyRevenue(): number {
    return this.currentAgency.getEstimatedWeeklyRevenue();
  }

  /**
   * Get current week number
   */
  getCurrentWeek(): number {
    return this.currentAgency.currentWeek;
  }

  /**
   * Get weeks in debt
   */
  getWeeksInDebt(): number {
    return this.currentAgency.weeksInDebt;
  }

  getUnlockedPlatforms(): string[] {
    return this.currentAgency.getUnlockedPlatforms();
  }

  signStreamer(streamer: Streamer): boolean {
    const success = this.currentAgency.signStreamer(streamer);
    if (success) {
      EventBus.emit(EVENTS.ROSTER_CHANGED, this.currentAgency.roster);
      EventBus.emit(EVENTS.MONEY_CHANGED, this.currentAgency.money);
      this.autoSave();
      EventBus.emit(EVENTS.STATE_CHANGED);
    }
    return success;
  }

  dropStreamer(streamerId: string): void {
    this.currentAgency.dropStreamer(streamerId);
    EventBus.emit(EVENTS.ROSTER_CHANGED, this.currentAgency.roster);
    this.autoSave();
    EventBus.emit(EVENTS.STATE_CHANGED);
  }

  addMoney(amount: number): void {
    this.currentAgency.addMoney(amount);
    EventBus.emit(EVENTS.MONEY_CHANGED, this.currentAgency.money);
    this.autoSave();
    EventBus.emit(EVENTS.STATE_CHANGED);
  }

  spendMoney(amount: number): boolean {
    const success = this.currentAgency.spendMoney(amount);
    if (success) {
      EventBus.emit(EVENTS.MONEY_CHANGED, this.currentAgency.money);
      this.autoSave();
      EventBus.emit(EVENTS.STATE_CHANGED);
    }
    return success;
  }

  modifyStreamer(streamerId: string, modifications: Partial<Streamer>): void {
    const streamer = this.currentAgency.getStreamer(streamerId);
    if (streamer) {
      Object.assign(streamer, modifications);
      EventBus.emit(EVENTS.ROSTER_CHANGED, this.currentAgency.roster);
      this.autoSave();
      EventBus.emit(EVENTS.STATE_CHANGED);
    }
  }

  switchStreamerPlatform(streamerId: string, newPlatform: PlatformKey): boolean {
    const streamer = this.currentAgency.getStreamer(streamerId);
    if (!streamer) return false;

    // Can only switch to unlocked platforms
    if (!this.currentAgency.unlockedPlatforms.has(newPlatform)) return false;

    // Can't switch to same platform
    if (streamer.platform === newPlatform) return false;

    streamer.switchPlatform(newPlatform);
    EventBus.emit(EVENTS.ROSTER_CHANGED, this.currentAgency.roster);
    this.autoSave();
    EventBus.emit(EVENTS.STATE_CHANGED);
    return true;
  }

  // Convenience getters
  getMoney(): number {
    return this.currentAgency.money;
  }

  getCurrentDay(): number {
    return this.currentAgency.currentDay;
  }

  getRoster(): Streamer[] {
    return this.currentAgency.roster;
  }

  /**
   * @deprecated Use getWeeksInDebt() instead
   */
  getDaysInDebt(): number {
    return this.currentAgency.daysInDebt;
  }

  /**
   * @deprecated Use getEstimatedWeeklyRevenue() instead
   */
  getDailyRevenue(): number {
    return this.currentAgency.getDailyRevenue();
  }

  isUnlocked(platform: string): boolean {
    return this.currentAgency.unlockedPlatforms.has(platform);
  }

  // Save management
  private autoSave(): void {
    if (SaveManager.isAutoSaveEnabled() && this.agency) {
      SaveManager.save(this.agency.toData());
    }
  }

  forceSave(): void {
    if (this.agency) {
      SaveManager.save(this.agency.toData());
    }
  }

  deleteSave(): void {
    SaveManager.deleteSave();
  }

  // For debugging
  getState(): AgencyData | null {
    return this.agency?.toData() ?? null;
  }
}

// Singleton instance
export const GameManager = new GameManagerClass();
