import { CONFIG, AI_AGENCIES, AIAgencyKey, AgencyStrategy, GenreKey, PlatformKey, GENRES, AVATAR_COLORS } from '../config';
import { StreamerData, StreamerStats } from '../entities/Streamer';

// Extended streamer data for world simulation
export interface StreamerWorldData extends StreamerData {
  agencyId: string | null;           // null = free agent, 'player' = player's agency
  careerWeeks: number;               // How long active in the industry
  peakFollowers: number;             // All-time high followers
  weeklyImpressions: number;         // Last week's total views
  lastWeekFollowers: number;         // For calculating growth rate
  consecutiveBurnoutWeeks: number;   // Weeks at high burnout
  consecutiveDeclineWeeks: number;   // Weeks of follower decline
  retiredWeek: number | null;        // Week retired (null if active)
}

// AI Agency data
export interface AIAgencyData {
  id: string;
  name: string;
  money: number;
  reputation: number;               // 0-100
  roster: string[];                 // Streamer IDs
  strategy: AgencyStrategy;
  focusGenres: GenreKey[];
  focusPlatforms: PlatformKey[];
  color: string;
  maxRoster: number;
  totalEarnings: number;
  weeklyRevenue: number;
}

// World Trend
export interface WorldTrend {
  id: string;
  name: string;
  description: string;
  category: 'platform' | 'genre' | 'global' | 'economic';
  affectedGenres: GenreKey[];
  affectedPlatforms: PlatformKey[];
  followerMultiplier: number;       // 0.5x - 2.0x
  revenueMultiplier: number;
  durationWeeks: number;
  weeksRemaining: number;
}

// Weekly snapshot for history/charts
export interface WeeklySnapshot {
  weekNumber: number;
  topStreamers: { id: string; name: string; followers: number; growth: number }[];
  agencyRankings: { id: string; name: string; score: number; change: number }[];
  totalActiveStreamers: number;
  totalFreeAgents: number;
  newStreamers: string[];           // IDs of newly generated streamers
  retirements: string[];            // IDs of retired streamers
  comebacks: string[];              // IDs of comeback streamers
  activeTrendIds: string[];
  newsEvents: NewsEvent[];
}

// News event for the feed
export interface NewsEvent {
  id: string;
  weekNumber: number;
  type: 'milestone' | 'signing' | 'retirement' | 'comeback' | 'trend' | 'ranking';
  title: string;
  description: string;
  streamerId?: string;
  agencyId?: string;
}

// The entire world state
export interface WorldStateData {
  initialized: boolean;
  weekNumber: number;
  dayOfWeek: number;                // 0-6 (Monday = 0)
  streamers: Record<string, StreamerWorldData>;  // All streamers by ID
  agencies: AIAgencyData[];
  freeAgentIds: string[];
  retiredIds: string[];
  activeTrends: WorldTrend[];
  weeklySnapshots: WeeklySnapshot[];
  newsEvents: NewsEvent[];          // Rolling news feed (last 50 events)
}

// Name generation pools
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Casey', 'Riley', 'Quinn', 'Morgan', 'Taylor', 'Jamie', 'Avery', 'Parker',
  'Drew', 'Sage', 'River', 'Blake', 'Skyler', 'Reese', 'Phoenix', 'Dakota', 'Rowan', 'Finley',
  'Luna', 'Nova', 'Kai', 'Zephyr', 'Storm', 'Echo', 'Onyx', 'Jade', 'Ash', 'Ember',
  'Max', 'Sam', 'Chris', 'Pat', 'Lee', 'Robin', 'Charlie', 'Jessie', 'Frankie', 'Remy',
];

const LAST_NAMES = [
  'Chen', 'Kim', 'Garcia', 'Singh', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson',
  'Tanaka', 'Nguyen', 'Park', 'Ali', 'Schmidt', 'Rossi', 'Silva', 'Johansson', 'Murphy', 'Kelly',
  'Storm', 'Blaze', 'Frost', 'Night', 'Shadow', 'Pixel', 'Void', 'Neon', 'Cyber', 'Glitch',
];

const NAME_SUFFIXES = ['', '_TV', '_Live', '_Gaming', '_Plays', '_Stream', 'Official', '_VT', 'IRL', ''];

class WorldStateClass {
  private _data: WorldStateData = this.createEmptyState();

  private createEmptyState(): WorldStateData {
    return {
      initialized: false,
      weekNumber: 1,
      dayOfWeek: 0,
      streamers: {},
      agencies: [],
      freeAgentIds: [],
      retiredIds: [],
      activeTrends: [],
      weeklySnapshots: [],
      newsEvents: [],
    };
  }

  // Initialize the world with streamers and agencies
  initialize(): void {
    if (this._data.initialized) return;

    console.log('[WorldState] Initializing world with', CONFIG.WORLD_STREAMER_COUNT, 'streamers');

    // Generate all streamers
    this.generateInitialStreamers();

    // Create AI agencies
    this.initializeAIAgencies();

    // Initial AI agency signings
    this.performInitialSignings();

    this._data.initialized = true;

    console.log('[WorldState] World initialized:', {
      totalStreamers: Object.keys(this._data.streamers).length,
      freeAgents: this._data.freeAgentIds.length,
      agencies: this._data.agencies.length,
    });
  }

  private generateInitialStreamers(): void {
    const platformDistribution = {
      SWITCH: 0.50,   // 50%
      YETUBE: 0.30,   // 30%
      OHFANS: 0.20,   // 20%
    };

    for (let i = 0; i < CONFIG.WORLD_STREAMER_COUNT; i++) {
      // Determine platform
      const roll = Math.random();
      let platform: PlatformKey;
      if (roll < platformDistribution.SWITCH) {
        platform = 'SWITCH';
      } else if (roll < platformDistribution.SWITCH + platformDistribution.YETUBE) {
        platform = 'YETUBE';
      } else {
        platform = 'OHFANS';
      }

      const streamer = this.generateStreamer(platform, i);
      this._data.streamers[streamer.id] = streamer;
      this._data.freeAgentIds.push(streamer.id);
    }
  }

  private generateStreamer(platform: PlatformKey, seed: number): StreamerWorldData {
    const id = `streamer_${Date.now()}_${seed}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate name
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    const name = Math.random() < 0.5
      ? `${firstName}${lastName}${suffix}`
      : `${firstName}_${lastName}${suffix}`;

    // Generate genre based on platform affinity
    const genre = this.selectGenreForPlatform(platform);

    // Generate stats (with 5% chance of "prodigy" - one stat at 9-10)
    const stats = this.generateStats();

    // Generate followers - wide range for variety
    // Established streamers (40%), mid-tier (40%), newcomers (20%)
    let followers: number;
    const tierRoll = Math.random();
    if (tierRoll < 0.20) {
      // Newcomers: 50-1,000
      followers = Math.floor(50 + Math.random() * 950);
    } else if (tierRoll < 0.60) {
      // Mid-tier: 1,000-50,000
      followers = Math.floor(1000 + Math.random() * 49000);
    } else if (tierRoll < 0.90) {
      // Established: 50,000-500,000
      followers = Math.floor(50000 + Math.random() * 450000);
    } else {
      // Stars: 500,000-2,000,000
      followers = Math.floor(500000 + Math.random() * 1500000);
    }

    // Career length correlates with followers (roughly)
    const careerWeeks = Math.floor((followers / 10000) + Math.random() * 50);

    // Age is independent of success (weighted toward younger)
    // 40% 18-24, 35% 25-34, 20% 35-44, 5% 45-55
    const ageRoll = Math.random();
    let age: number;
    if (ageRoll < 0.4) {
      age = 18 + Math.floor(Math.random() * 7); // 18-24
    } else if (ageRoll < 0.75) {
      age = 25 + Math.floor(Math.random() * 10); // 25-34
    } else if (ageRoll < 0.95) {
      age = 35 + Math.floor(Math.random() * 10); // 35-44
    } else {
      age = 45 + Math.floor(Math.random() * 11); // 45-55
    }

    // Experience is derived from career weeks
    const experienceYears = Math.floor(careerWeeks / 52);

    return {
      id,
      name,
      genre,
      platform,
      followers,
      stats,
      traits: [],
      burnout: Math.floor(Math.random() * 30), // 0-30 initial burnout
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      contractEndDay: 0,
      revenueSplit: 0.5,
      signedOnDay: 0,
      age,
      experienceYears,
      // World-specific fields
      agencyId: null,
      careerWeeks,
      peakFollowers: followers,
      weeklyImpressions: Math.floor(followers * (3 + Math.random() * 4)), // 3-7x followers
      lastWeekFollowers: followers,
      consecutiveBurnoutWeeks: 0,
      consecutiveDeclineWeeks: 0,
      retiredWeek: null,
    };
  }

  private selectGenreForPlatform(platform: PlatformKey): GenreKey {
    const genreKeys = Object.keys(GENRES) as GenreKey[];
    const weights: number[] = [];

    for (const genre of genreKeys) {
      const affinity = GENRES[genre].platformAffinity[platform] || 1.0;
      weights.push(affinity);
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;

    for (let i = 0; i < genreKeys.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        return genreKeys[i];
      }
    }

    return genreKeys[0];
  }

  private generateStats(): StreamerStats {
    const isProdigy = Math.random() < 0.05;

    const stats: StreamerStats = {
      charisma: Math.floor(1 + Math.random() * 10),
      consistency: Math.floor(1 + Math.random() * 10),
      dramaRisk: Math.floor(1 + Math.random() * 10),
      skill: Math.floor(1 + Math.random() * 10),
      adaptability: Math.floor(1 + Math.random() * 10),
      loyalty: Math.floor(1 + Math.random() * 10),
      ambition: Math.floor(1 + Math.random() * 10),
    };

    // Clamp all stats to 1-10
    for (const key of Object.keys(stats) as (keyof StreamerStats)[]) {
      stats[key] = Math.max(1, Math.min(10, stats[key]));
    }

    // If prodigy, boost one random stat to 9-10
    if (isProdigy) {
      const statKeys = Object.keys(stats) as (keyof StreamerStats)[];
      const prodigyStat = statKeys[Math.floor(Math.random() * statKeys.length)];
      stats[prodigyStat] = 9 + Math.floor(Math.random() * 2); // 9 or 10
    }

    return stats;
  }

  private initializeAIAgencies(): void {
    const agencyKeys = Object.keys(AI_AGENCIES) as AIAgencyKey[];

    for (const key of agencyKeys) {
      const template = AI_AGENCIES[key];
      const agency: AIAgencyData = {
        id: template.id,
        name: template.name,
        money: template.startingMoney,
        reputation: 50, // Start at 50
        roster: [],
        strategy: template.strategy,
        focusGenres: [...template.focusGenres],
        focusPlatforms: [...template.focusPlatforms],
        color: template.color,
        maxRoster: template.maxRoster,
        totalEarnings: 0,
        weeklyRevenue: 0,
      };
      this._data.agencies.push(agency);
    }
  }

  private performInitialSignings(): void {
    // Each AI agency signs some initial streamers based on their strategy
    for (const agency of this._data.agencies) {
      const targetRoster = Math.floor(agency.maxRoster * 0.6); // Start at 60% capacity

      for (let i = 0; i < targetRoster && this._data.freeAgentIds.length > 0; i++) {
        const prospect = this.findBestProspect(agency);
        if (prospect) {
          this.signStreamerToAgency(prospect.id, agency.id);
        }
      }
    }
  }

  private findBestProspect(agency: AIAgencyData): StreamerWorldData | null {
    const candidates: StreamerWorldData[] = [];

    for (const streamerId of this._data.freeAgentIds) {
      const streamer = this._data.streamers[streamerId];
      if (!streamer) continue;

      // Check if matches agency focus
      let matchScore = 1;

      if (agency.focusGenres.length > 0) {
        if (agency.focusGenres.includes(streamer.genre)) {
          matchScore += 2;
        } else {
          matchScore -= 1;
        }
      }

      if (agency.focusPlatforms.length > 0) {
        if (agency.focusPlatforms.includes(streamer.platform)) {
          matchScore += 1;
        }
      }

      if (matchScore > 0) {
        candidates.push(streamer);
      }
    }

    if (candidates.length === 0) {
      // Fall back to any free agent
      const randomId = this._data.freeAgentIds[Math.floor(Math.random() * this._data.freeAgentIds.length)];
      return this._data.streamers[randomId] || null;
    }

    // Sort by followers and pick from top candidates
    candidates.sort((a, b) => b.followers - a.followers);
    const topCandidates = candidates.slice(0, Math.min(10, candidates.length));
    return topCandidates[Math.floor(Math.random() * topCandidates.length)];
  }

  signStreamerToAgency(streamerId: string, agencyId: string): boolean {
    const streamer = this._data.streamers[streamerId];
    if (!streamer || streamer.agencyId !== null) return false;

    const agency = this._data.agencies.find(a => a.id === agencyId);
    if (!agency) return false;

    // Remove from free agents
    const freeIndex = this._data.freeAgentIds.indexOf(streamerId);
    if (freeIndex !== -1) {
      this._data.freeAgentIds.splice(freeIndex, 1);
    }

    // Add to agency
    streamer.agencyId = agencyId;
    agency.roster.push(streamerId);

    return true;
  }

  releaseStreamerFromAgency(streamerId: string): boolean {
    const streamer = this._data.streamers[streamerId];
    if (!streamer || streamer.agencyId === null) return false;

    const agency = this._data.agencies.find(a => a.id === streamer.agencyId);
    if (agency) {
      const rosterIndex = agency.roster.indexOf(streamerId);
      if (rosterIndex !== -1) {
        agency.roster.splice(rosterIndex, 1);
      }
    }

    streamer.agencyId = null;
    this._data.freeAgentIds.push(streamerId);

    return true;
  }

  // Getters
  get data(): WorldStateData {
    return this._data;
  }

  get isInitialized(): boolean {
    return this._data.initialized;
  }

  get weekNumber(): number {
    return this._data.weekNumber;
  }

  get dayOfWeek(): number {
    return this._data.dayOfWeek;
  }

  getDayName(): string {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[this._data.dayOfWeek];
  }

  getAllStreamers(): StreamerWorldData[] {
    return Object.values(this._data.streamers);
  }

  /**
   * Get total count of all streamers (active + retired)
   */
  getStreamersCount(): number {
    return Object.keys(this._data.streamers).length;
  }

  /**
   * Get active (non-retired) streamers count
   */
  getActiveStreamersCount(): number {
    return Object.values(this._data.streamers).filter(s => s.retiredWeek === null).length;
  }

  /**
   * Get top streamers by followers (paginated, sorted)
   * Useful for leaderboards without loading all data
   */
  getTopStreamers(count: number = 10, includeRetired: boolean = false): StreamerWorldData[] {
    let streamers = Object.values(this._data.streamers);

    if (!includeRetired) {
      streamers = streamers.filter(s => s.retiredWeek === null);
    }

    return streamers
      .sort((a, b) => b.followers - a.followers)
      .slice(0, count);
  }

  getStreamer(id: string): StreamerWorldData | null {
    return this._data.streamers[id] || null;
  }

  getFreeAgents(): StreamerWorldData[] {
    return this._data.freeAgentIds
      .map(id => this._data.streamers[id])
      .filter(Boolean);
  }

  /**
   * Get free agents with pagination for lazy loading
   */
  getFreeAgentsPaginated(page: number, pageSize: number = 20): {
    streamers: StreamerWorldData[];
    total: number;
    totalPages: number;
    hasMore: boolean;
  } {
    const total = this._data.freeAgentIds.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = page * pageSize;
    const end = Math.min(start + pageSize, total);

    const streamers = this._data.freeAgentIds
      .slice(start, end)
      .map(id => this._data.streamers[id])
      .filter(Boolean);

    return {
      streamers,
      total,
      totalPages,
      hasMore: end < total,
    };
  }

  /**
   * Get free agents count without loading all data
   */
  getFreeAgentsCount(): number {
    return this._data.freeAgentIds.length;
  }

  /**
   * Search free agents by name (with pagination)
   */
  searchFreeAgents(query: string, limit: number = 10): StreamerWorldData[] {
    const lowerQuery = query.toLowerCase();
    const results: StreamerWorldData[] = [];

    for (const id of this._data.freeAgentIds) {
      if (results.length >= limit) break;
      const streamer = this._data.streamers[id];
      if (streamer && streamer.name.toLowerCase().includes(lowerQuery)) {
        results.push(streamer);
      }
    }

    return results;
  }

  /**
   * Get top free agents sorted by followers (for scout scene)
   */
  getTopFreeAgents(count: number = 10, platform?: PlatformKey): StreamerWorldData[] {
    let agents = this._data.freeAgentIds
      .map(id => this._data.streamers[id])
      .filter(Boolean);

    if (platform) {
      agents = agents.filter(s => s.platform === platform);
    }

    return agents
      .sort((a, b) => b.followers - a.followers)
      .slice(0, count);
  }

  getRetiredStreamers(): StreamerWorldData[] {
    return this._data.retiredIds
      .map(id => this._data.streamers[id])
      .filter(Boolean);
  }

  getAIAgencies(): AIAgencyData[] {
    return this._data.agencies;
  }

  getAgency(id: string): AIAgencyData | null {
    return this._data.agencies.find(a => a.id === id) || null;
  }

  getAgencyRoster(agencyId: string): StreamerWorldData[] {
    const agency = this.getAgency(agencyId);
    if (!agency) return [];
    return agency.roster
      .map(id => this._data.streamers[id])
      .filter(Boolean);
  }

  getActiveTrends(): WorldTrend[] {
    return this._data.activeTrends;
  }

  getRecentNews(count: number = 10): NewsEvent[] {
    return this._data.newsEvents.slice(-count);
  }

  getLatestSnapshot(): WeeklySnapshot | null {
    return this._data.weeklySnapshots[this._data.weeklySnapshots.length - 1] || null;
  }

  // Add a news event
  addNewsEvent(event: Omit<NewsEvent, 'id' | 'weekNumber'>): void {
    const newsEvent: NewsEvent = {
      ...event,
      id: `news_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      weekNumber: this._data.weekNumber,
    };

    this._data.newsEvents.push(newsEvent);

    // Keep only last 50 events
    if (this._data.newsEvents.length > 50) {
      this._data.newsEvents = this._data.newsEvents.slice(-50);
    }
  }

  // Advance day of week (called by GameManager)
  advanceDay(): { isEndOfWeek: boolean; newWeek: number } {
    this._data.dayOfWeek++;

    if (this._data.dayOfWeek >= CONFIG.DAYS_PER_WEEK) {
      this._data.dayOfWeek = 0;
      this._data.weekNumber++;
      return { isEndOfWeek: true, newWeek: this._data.weekNumber };
    }

    return { isEndOfWeek: false, newWeek: this._data.weekNumber };
  }

  // Serialization
  serialize(): WorldStateData {
    return JSON.parse(JSON.stringify(this._data));
  }

  deserialize(data: WorldStateData): void {
    this._data = data;
  }

  // Reset world state
  reset(): void {
    this._data = this.createEmptyState();
  }
}

// Export singleton
export const WorldState = new WorldStateClass();
