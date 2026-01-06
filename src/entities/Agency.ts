import { CONFIG, SCOUTING_TIERS, PlatformKey } from '../config';
import { Streamer, StreamerData } from './Streamer';
import { WeeklySchedule, createDefaultSchedule, serializeSchedule, deserializeSchedule } from './WeeklySchedule';
import {
  AgencyWeeklyResult,
  StreamerWeeklyResult,
  createEmptyAgencyResult,
  createEmptyStreamerResult,
} from './WeeklyResults';
import { generateWeeklySponsors, getTotalSponsorshipValue } from '../systems/SponsorshipSystem';
import { NegotiationState } from './Contract';

export interface SavedNegotiationState {
  streamerId: string;
  platform: PlatformKey;
  negotiation: NegotiationState;
}

export interface AgencyData {
  name: string;
  money: number;
  reputation: number;
  currentDay: number;
  currentWeek: number;         // NEW: Week counter
  daysInDebt: number;          // Legacy - kept for compatibility
  weeksInDebt: number;         // NEW: Weeks in debt counter
  totalRevenue: number;
  roster: StreamerData[];
  unlockedPlatforms: string[];
  scoutingLevel: number;
  streamerPool: StreamerData[];
  weeklySchedules?: Record<string, object>; // NEW: Serialized weekly schedules
  activeNegotiation?: SavedNegotiationState; // Persisted negotiation state
}

export class Agency {
  public name: string;
  public money: number;
  public reputation: number;
  public currentDay: number;
  public currentWeek: number;
  public daysInDebt: number;
  public weeksInDebt: number;
  public totalRevenue: number;
  public roster: Streamer[];
  public unlockedPlatforms: Set<string>;
  public scoutingLevel: number;
  public streamerPool: Streamer[];
  public weeklySchedules: Map<string, WeeklySchedule>;
  public activeNegotiation: SavedNegotiationState | null;

  constructor(data?: Partial<AgencyData>) {
    this.name = data?.name ?? 'StreamLord Agency';
    this.money = data?.money ?? CONFIG.STARTING_MONEY;
    this.reputation = data?.reputation ?? 50;
    this.currentDay = data?.currentDay ?? 1;
    this.currentWeek = data?.currentWeek ?? Math.ceil((data?.currentDay ?? 1) / 7);
    this.daysInDebt = data?.daysInDebt ?? 0;
    this.weeksInDebt = data?.weeksInDebt ?? Math.floor((data?.daysInDebt ?? 0) / 7);
    this.totalRevenue = data?.totalRevenue ?? 0;
    this.roster = data?.roster?.map(Streamer.fromData) ?? [];
    this.unlockedPlatforms = new Set(data?.unlockedPlatforms ?? ['SWITCH']);
    this.scoutingLevel = data?.scoutingLevel ?? 0;
    this.streamerPool = data?.streamerPool?.map(Streamer.fromData) ?? [];

    // Deserialize weekly schedules
    this.weeklySchedules = new Map();
    if (data?.weeklySchedules) {
      for (const [streamerId, scheduleData] of Object.entries(data.weeklySchedules)) {
        const streamer = this.roster.find(s => s.id === streamerId);
        const fallbackPlatform = streamer?.platform ?? 'SWITCH';
        this.weeklySchedules.set(streamerId, deserializeSchedule(scheduleData, streamerId, fallbackPlatform));
      }
    }

    // Restore active negotiation if any
    this.activeNegotiation = data?.activeNegotiation ?? null;
  }

  addMoney(amount: number): void {
    this.money += amount;
    if (amount > 0) {
      this.totalRevenue += amount;
    }
  }

  spendMoney(amount: number): boolean {
    if (this.money >= amount) {
      this.money -= amount;
      return true;
    }
    return false;
  }

  signStreamer(streamer: Streamer): boolean {
    const cost = Streamer.getSigningCost(streamer);
    if (this.spendMoney(cost)) {
      this.roster.push(streamer);
      return true;
    }
    return false;
  }

  dropStreamer(streamerId: string): void {
    this.roster = this.roster.filter((s) => s.id !== streamerId);
  }

  getStreamer(streamerId: string): Streamer | undefined {
    return this.roster.find((s) => s.id === streamerId);
  }

  /**
   * @deprecated Use getEstimatedWeeklyRevenue() instead
   */
  getDailyRevenue(): number {
    return this.roster.reduce((sum, streamer) => sum + streamer.getDailyRevenue(), 0);
  }

  /**
   * @deprecated Use advanceWeek() instead. Kept for save migration compatibility.
   */
  advanceDay(): {
    revenue: number;
    isBankrupt: boolean;
    expiredContracts: Streamer[];
    expiringContracts: Streamer[];
    newlyUnlockedPlatforms: string[];
  } {
    this.currentDay++;

    // Collect revenue (only from active contracts)
    const activeStreamers = this.roster.filter(s => s.contractEndDay > this.currentDay);
    const revenue = activeStreamers.reduce((sum, s) => sum + s.getDailyRevenue(), 0);
    this.addMoney(revenue);

    // Apply platform-specific follower growth
    for (const streamer of this.roster) {
      streamer.applyDailyGrowth();
    }

    // Check for expired contracts (contract ended today)
    const expiredContracts = this.roster.filter(s => s.contractEndDay === this.currentDay);

    // Check for expiring soon (7 days warning)
    const expiringContracts = this.roster.filter(s => {
      const daysLeft = s.contractEndDay - this.currentDay;
      return daysLeft === 7; // Warn exactly 7 days before
    });

    // Check bankruptcy
    if (this.money < 0) {
      this.daysInDebt++;
    } else {
      this.daysInDebt = 0;
    }

    const isBankrupt = this.daysInDebt >= CONFIG.DAYS_IN_DEBT_BEFORE_GAME_OVER;

    // Check platform unlocks
    const newlyUnlockedPlatforms = this.checkPlatformUnlocks();

    // Refresh streamer pool periodically
    if (this.currentDay % CONFIG.POOL_REFRESH_INTERVAL === 0) {
      this.refreshPool();
    }

    return { revenue, isBankrupt, expiredContracts, expiringContracts, newlyUnlockedPlatforms };
  }

  // ============================================
  // WEEKLY SYSTEM METHODS
  // ============================================

  /**
   * Get or create a weekly schedule for a streamer
   */
  getStreamerSchedule(streamerId: string): WeeklySchedule {
    if (this.weeklySchedules.has(streamerId)) {
      return this.weeklySchedules.get(streamerId)!;
    }

    // Create default schedule
    const streamer = this.roster.find(s => s.id === streamerId);
    if (streamer) {
      const schedule = createDefaultSchedule(streamerId, streamer.platform);
      this.weeklySchedules.set(streamerId, schedule);
      return schedule;
    }

    // Fallback for unknown streamer
    return createDefaultSchedule(streamerId, 'SWITCH');
  }

  /**
   * Set a streamer's weekly schedule
   */
  setStreamerSchedule(streamerId: string, schedule: WeeklySchedule): void {
    this.weeklySchedules.set(streamerId, schedule);
  }

  /**
   * Get all weekly schedules
   */
  getAllSchedules(): Map<string, WeeklySchedule> {
    // Ensure all roster streamers have schedules
    for (const streamer of this.roster) {
      if (!this.weeklySchedules.has(streamer.id)) {
        this.weeklySchedules.set(streamer.id, createDefaultSchedule(streamer.id, streamer.platform));
      }
    }
    return this.weeklySchedules;
  }

  /**
   * Get estimated weekly revenue based on current schedules
   */
  getEstimatedWeeklyRevenue(): number {
    let total = 0;
    for (const streamer of this.roster) {
      if (streamer.contractEndDay > this.currentDay) {
        const schedule = this.getStreamerSchedule(streamer.id);
        total += streamer.getWeeklyStreamingRevenue(schedule);
      }
    }
    return total;
  }

  /**
   * Advance the game by one week - the main game loop
   */
  advanceWeek(): AgencyWeeklyResult {
    const moneyBefore = this.money;
    this.currentWeek++;
    this.currentDay += 7; // Advance 7 days

    const result = createEmptyAgencyResult(this.currentWeek, moneyBefore);
    const streamerResults: StreamerWeeklyResult[] = [];

    // Process each roster streamer
    for (const streamer of this.roster) {
      // Skip streamers with expired contracts
      if (streamer.contractEndDay <= this.currentDay - 7) {
        continue;
      }

      const schedule = this.getStreamerSchedule(streamer.id);

      // Create streamer result
      const streamerResult = createEmptyStreamerResult(
        streamer.id,
        streamer.name,
        streamer.followers,
        streamer.burnout,
        schedule.takingBreak
      );

      // Calculate streaming revenue
      const streamingRevenue = streamer.getWeeklyStreamingRevenue(schedule);
      streamerResult.totalStreamingRevenue = streamingRevenue;

      // Generate sponsorships
      const sponsorships = generateWeeklySponsors(streamer, schedule);
      streamerResult.sponsorships = sponsorships;
      const sponsorTotals = getTotalSponsorshipValue(sponsorships);
      streamerResult.totalSponsorshipRevenue = sponsorTotals.agencyCut;

      // Calculate total agency revenue from this streamer
      streamerResult.totalRevenue = streamingRevenue + sponsorTotals.totalValue;
      streamerResult.agencyRevenue = streamingRevenue + sponsorTotals.agencyCut;

      // Apply weekly changes (growth, burnout)
      const growthResult = streamer.applyWeeklyChanges(schedule);
      streamerResult.totalViews = growthResult.viewsGenerated;
      streamerResult.followersAfter = growthResult.followersAfter;
      streamerResult.totalNewFollowers = growthResult.followerChange;
      streamerResult.burnoutAfter = growthResult.burnoutAfter;
      streamerResult.burnoutChange = growthResult.burnoutChange;

      // Get platform breakdown for detailed results
      const platformBreakdown = streamer.getWeeklyPlatformBreakdown(schedule);
      for (const pb of platformBreakdown) {
        streamerResult.platformResults.push({
          platform: pb.platform,
          hoursStreamed: pb.hoursStreamed,
          viewsGenerated: pb.views,
          newFollowers: pb.followerChange,
          streamingRevenue: pb.revenue,
        });
      }

      streamerResults.push(streamerResult);

      // Add to agency totals
      result.streamingRevenue += streamingRevenue;
      result.sponsorshipRevenue += sponsorTotals.agencyCut;
      result.totalRevenue += streamerResult.agencyRevenue;
    }

    // Add revenue to agency
    this.addMoney(result.totalRevenue);
    result.netProfit = result.totalRevenue - result.expenses;
    result.moneyAfter = this.money;
    result.streamerResults = streamerResults;

    // Check for expired contracts (contract ended this week)
    result.contractsExpired = this.roster
      .filter(s => s.contractEndDay <= this.currentDay && s.contractEndDay > this.currentDay - 7)
      .map(s => s.id);

    // Check for expiring soon (next week)
    result.contractsExpiringSoon = this.roster
      .filter(s => {
        const daysLeft = s.contractEndDay - this.currentDay;
        return daysLeft > 0 && daysLeft <= 7;
      })
      .map(s => s.id);

    // Check bankruptcy (weeks in debt)
    if (this.money < 0) {
      this.weeksInDebt++;
      this.daysInDebt += 7; // Keep legacy counter in sync
    } else {
      this.weeksInDebt = 0;
      this.daysInDebt = 0;
    }

    // Check platform unlocks
    const newlyUnlocked = this.checkPlatformUnlocks();
    if (newlyUnlocked.length > 0) {
      result.worldNewsHighlights.push(...newlyUnlocked.map(p => `New platform unlocked: ${p}`));
    }

    // Refresh streamer pool
    this.refreshPool();

    return result;
  }

  /**
   * Check if agency is bankrupt (too many weeks in debt)
   */
  isBankrupt(): boolean {
    return this.weeksInDebt >= CONFIG.WEEKS_IN_DEBT_BEFORE_GAME_OVER;
  }

  private checkPlatformUnlocks(): string[] {
    const newlyUnlocked: string[] = [];

    if (
      !this.unlockedPlatforms.has('YETUBE') &&
      (this.totalRevenue >= CONFIG.YETUBE_UNLOCK_REVENUE || this.roster.length >= CONFIG.YETUBE_UNLOCK_ROSTER)
    ) {
      this.unlockedPlatforms.add('YETUBE');
      newlyUnlocked.push('YETUBE');
    }

    if (!this.unlockedPlatforms.has('OHFANS') && this.totalRevenue >= CONFIG.OHFANS_UNLOCK_REVENUE) {
      this.unlockedPlatforms.add('OHFANS');
      newlyUnlocked.push('OHFANS');
    }

    return newlyUnlocked;
  }

  getUnlockedPlatforms(): string[] {
    return Array.from(this.unlockedPlatforms);
  }

  // Scouting skill methods
  getCurrentScoutingTier() {
    return Object.values(SCOUTING_TIERS).find(t => t.level === this.scoutingLevel)!;
  }

  getNextScoutingTier() {
    return Object.values(SCOUTING_TIERS).find(t => t.level === this.scoutingLevel + 1) || null;
  }

  upgradeScoutingSkill(): boolean {
    const nextTier = this.getNextScoutingTier();
    if (!nextTier) return false;
    if (this.money < nextTier.cost) return false;

    this.money -= nextTier.cost;
    this.scoutingLevel = nextTier.level;
    return true;
  }

  // Streamer pool methods
  initializeStreamerPool(count: number = CONFIG.INITIAL_POOL_SIZE): void {
    this.streamerPool = [];

    // Distribution: 60% Switch, 25% YeTube, 15% OhFans
    const distribution: { platform: PlatformKey; count: number }[] = [
      { platform: 'SWITCH', count: Math.floor(count * 0.6) },
      { platform: 'YETUBE', count: Math.floor(count * 0.25) },
      { platform: 'OHFANS', count: Math.floor(count * 0.15) },
    ];

    for (const { platform, count: num } of distribution) {
      for (let i = 0; i < num; i++) {
        this.streamerPool.push(Streamer.generateRandom(this.currentDay, platform));
      }
    }
  }

  getAvailableStreamers(platform: PlatformKey): Streamer[] {
    return this.streamerPool.filter(s => s.platform === platform);
  }

  removeFromPool(streamerId: string): void {
    this.streamerPool = this.streamerPool.filter(s => s.id !== streamerId);
  }

  addToPool(streamer: Streamer): void {
    // Reset contract info when returning to pool
    streamer.contractEndDay = 0;
    streamer.signedOnDay = 0;
    this.streamerPool.push(streamer);
  }

  refreshPool(count: number = CONFIG.POOL_REFRESH_COUNT): void {
    const platforms: PlatformKey[] = ['SWITCH', 'YETUBE', 'OHFANS'];
    for (let i = 0; i < count; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      this.streamerPool.push(Streamer.generateRandom(this.currentDay, platform));
    }
  }

  toData(): AgencyData {
    // Serialize weekly schedules
    const weeklySchedulesData: Record<string, object> = {};
    for (const [streamerId, schedule] of this.weeklySchedules) {
      weeklySchedulesData[streamerId] = serializeSchedule(schedule);
    }

    return {
      name: this.name,
      money: this.money,
      reputation: this.reputation,
      currentDay: this.currentDay,
      currentWeek: this.currentWeek,
      daysInDebt: this.daysInDebt,
      weeksInDebt: this.weeksInDebt,
      totalRevenue: this.totalRevenue,
      roster: this.roster.map((s) => s.toData()),
      unlockedPlatforms: Array.from(this.unlockedPlatforms),
      scoutingLevel: this.scoutingLevel,
      streamerPool: this.streamerPool.map((s) => s.toData()),
      weeklySchedules: weeklySchedulesData,
      ...(this.activeNegotiation ? { activeNegotiation: this.activeNegotiation } : {}),
    };
  }

  static fromData(data: AgencyData): Agency {
    return new Agency(data);
  }
}
