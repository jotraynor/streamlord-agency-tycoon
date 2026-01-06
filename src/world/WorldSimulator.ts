import { CONFIG, GENRES, PLATFORMS, GenreKey, PlatformKey } from '../config';
import { WorldState, StreamerWorldData, WeeklySnapshot, NewsEvent, WorldTrend } from './WorldState';
import { AIAgencyManager } from './AIAgency';

// Result of weekly simulation
export interface WeeklySimulationResult {
  weekNumber: number;
  newStreamers: StreamerWorldData[];
  retirements: StreamerWorldData[];
  comebacks: StreamerWorldData[];
  trendChanges: { started: WorldTrend[]; ended: WorldTrend[] };
  milestones: NewsEvent[];
  snapshot: WeeklySnapshot;
}

class WorldSimulatorClass {
  /**
   * Run the weekly simulation for the entire world
   */
  simulateWeek(): WeeklySimulationResult {
    const weekNumber = WorldState.weekNumber;
    console.log(`[WorldSimulator] Simulating week ${weekNumber}`);

    const result: WeeklySimulationResult = {
      weekNumber,
      newStreamers: [],
      retirements: [],
      comebacks: [],
      trendChanges: { started: [], ended: [] },
      milestones: [],
      snapshot: this.createEmptySnapshot(weekNumber),
    };

    // 1. Update trends
    this.updateTrends(result);

    // 2. Simulate all streamers
    this.simulateAllStreamers(result);

    // 2.5. Age progression - every 52 weeks is a new year
    if (weekNumber > 0 && weekNumber % 52 === 0) {
      this.processYearlyAging();
    }

    // 3. AI agency decisions
    AIAgencyManager.processWeeklyDecisions();

    // 4. Process retirements
    this.processRetirements(result);

    // 5. Process comebacks
    this.processComebacks(result);

    // 6. Generate new streamers
    this.generateNewStreamers(result);

    // 7. Calculate rankings and create snapshot
    this.calculateRankings(result);

    // 8. Store snapshot
    this.storeSnapshot(result.snapshot);

    console.log(`[WorldSimulator] Week ${weekNumber} complete:`, {
      newStreamers: result.newStreamers.length,
      retirements: result.retirements.length,
      comebacks: result.comebacks.length,
    });

    return result;
  }

  /**
   * Update world trends - expire old ones and potentially add new ones
   */
  private updateTrends(result: WeeklySimulationResult): void {
    const trends = WorldState.data.activeTrends;

    // Decrement remaining weeks and remove expired trends
    for (let i = trends.length - 1; i >= 0; i--) {
      trends[i].weeksRemaining--;
      if (trends[i].weeksRemaining <= 0) {
        const expiredTrend = trends.splice(i, 1)[0];
        result.trendChanges.ended.push(expiredTrend);

        WorldState.addNewsEvent({
          type: 'trend',
          title: `${expiredTrend.name} has ended`,
          description: expiredTrend.description,
        });
      }
    }

    // 20% chance to start a new trend (if fewer than 3 active)
    if (trends.length < 3 && Math.random() < 0.20) {
      const newTrend = this.generateRandomTrend();
      trends.push(newTrend);
      result.trendChanges.started.push(newTrend);

      WorldState.addNewsEvent({
        type: 'trend',
        title: `New Trend: ${newTrend.name}`,
        description: newTrend.description,
      });
    }
  }

  /**
   * Generate a random world trend
   */
  private generateRandomTrend(): WorldTrend {
    const trendTemplates = [
      // Platform shifts
      {
        name: 'Switch Surge',
        description: 'Switch streamers are seeing increased growth!',
        category: 'platform' as const,
        affectedPlatforms: ['SWITCH'] as PlatformKey[],
        affectedGenres: [] as GenreKey[],
        followerMultiplier: 1.3,
        revenueMultiplier: 1.1,
        durationWeeks: 3,
      },
      {
        name: 'YeTube Algorithm Boost',
        description: 'YeTube is pushing content creators hard.',
        category: 'platform' as const,
        affectedPlatforms: ['YETUBE'] as PlatformKey[],
        affectedGenres: [] as GenreKey[],
        followerMultiplier: 1.5,
        revenueMultiplier: 1.2,
        durationWeeks: 2,
      },
      {
        name: 'OhFans Premium Wave',
        description: 'Subscription content is booming!',
        category: 'platform' as const,
        affectedPlatforms: ['OHFANS'] as PlatformKey[],
        affectedGenres: [] as GenreKey[],
        followerMultiplier: 1.2,
        revenueMultiplier: 1.5,
        durationWeeks: 4,
      },
      // Genre booms
      {
        name: 'Gaming Renaissance',
        description: 'Gaming content is more popular than ever.',
        category: 'genre' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: ['GAMING'] as GenreKey[],
        followerMultiplier: 1.4,
        revenueMultiplier: 1.2,
        durationWeeks: 4,
      },
      {
        name: 'VTuber Explosion',
        description: 'Virtual streamers are taking over!',
        category: 'genre' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: ['VTUBER'] as GenreKey[],
        followerMultiplier: 1.5,
        revenueMultiplier: 1.3,
        durationWeeks: 3,
      },
      {
        name: 'ASMR Goes Mainstream',
        description: 'ASMR content is reaching new audiences.',
        category: 'genre' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: ['ASMR'] as GenreKey[],
        followerMultiplier: 1.3,
        revenueMultiplier: 1.2,
        durationWeeks: 5,
      },
      {
        name: 'Music Streaming Boom',
        description: 'Live music performances are trending.',
        category: 'genre' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: ['MUSIC'] as GenreKey[],
        followerMultiplier: 1.4,
        revenueMultiplier: 1.3,
        durationWeeks: 3,
      },
      {
        name: 'IRL Adventure Craze',
        description: 'Outdoor and IRL streams are hot!',
        category: 'genre' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: ['IRL'] as GenreKey[],
        followerMultiplier: 1.6,
        revenueMultiplier: 1.1,
        durationWeeks: 2,
      },
      // Economic trends
      {
        name: 'Sponsorship Boom',
        description: 'Brands are spending big on influencers.',
        category: 'economic' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: [] as GenreKey[],
        followerMultiplier: 1.0,
        revenueMultiplier: 1.3,
        durationWeeks: 4,
      },
      {
        name: 'Ad Revenue Dip',
        description: 'Advertising budgets are down across the board.',
        category: 'economic' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: [] as GenreKey[],
        followerMultiplier: 1.0,
        revenueMultiplier: 0.8,
        durationWeeks: 3,
      },
      // Global events
      {
        name: 'Streaming Awards Season',
        description: 'All eyes on content creators!',
        category: 'global' as const,
        affectedPlatforms: [] as PlatformKey[],
        affectedGenres: [] as GenreKey[],
        followerMultiplier: 1.15,
        revenueMultiplier: 1.1,
        durationWeeks: 2,
      },
    ];

    const template = trendTemplates[Math.floor(Math.random() * trendTemplates.length)];

    return {
      id: `trend_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...template,
      weeksRemaining: template.durationWeeks,
    };
  }

  /**
   * Simulate growth/decline for all streamers
   */
  private simulateAllStreamers(result: WeeklySimulationResult): void {
    const streamers = WorldState.getAllStreamers();
    const trends = WorldState.getActiveTrends();

    for (const streamer of streamers) {
      if (streamer.retiredWeek !== null) continue; // Skip retired streamers

      // Calculate weekly growth
      const growth = this.calculateWeeklyGrowth(streamer, trends);

      // Store last week's followers for growth calculation
      streamer.lastWeekFollowers = streamer.followers;

      // Apply growth
      streamer.followers = Math.max(10, Math.floor(streamer.followers * (1 + growth)));

      // Update peak followers
      if (streamer.followers > streamer.peakFollowers) {
        streamer.peakFollowers = streamer.followers;

        // Check for milestone (100K, 500K, 1M, etc.)
        const milestones = [100000, 500000, 1000000, 2000000, 5000000];
        for (const milestone of milestones) {
          if (streamer.followers >= milestone && streamer.lastWeekFollowers < milestone) {
            const formatted = milestone >= 1000000 ? `${milestone / 1000000}M` : `${milestone / 1000}K`;
            const event: Omit<NewsEvent, 'id' | 'weekNumber'> = {
              type: 'milestone',
              title: `${streamer.name} hits ${formatted} followers!`,
              description: `${streamer.name} has reached a new milestone.`,
              streamerId: streamer.id,
            };
            WorldState.addNewsEvent(event);
            result.milestones.push({ ...event, id: '', weekNumber: result.weekNumber });
          }
        }
      }

      // Track decline
      if (streamer.followers < streamer.lastWeekFollowers) {
        streamer.consecutiveDeclineWeeks++;
      } else {
        streamer.consecutiveDeclineWeeks = 0;
      }

      // Update weekly impressions (views)
      const baseImpressions = streamer.followers * (3 + Math.random() * 4);
      const impressionMultiplier = this.getTrendMultiplier(streamer, trends, 'follower');
      streamer.weeklyImpressions = Math.floor(baseImpressions * impressionMultiplier);

      // Update burnout
      const burnoutChange = this.calculateBurnoutChange(streamer);
      streamer.burnout = Math.max(0, Math.min(100, streamer.burnout + burnoutChange));

      // Track high burnout weeks
      if (streamer.burnout >= CONFIG.RETIREMENT_BURNOUT_THRESHOLD) {
        streamer.consecutiveBurnoutWeeks++;
      } else {
        streamer.consecutiveBurnoutWeeks = 0;
      }

      // Increment career weeks
      streamer.careerWeeks++;

      // Update experience years (based on career weeks)
      streamer.experienceYears = Math.floor(streamer.careerWeeks / 52);
    }
  }

  /**
   * Age all streamers by 1 year (called every 52 weeks)
   */
  private processYearlyAging(): void {
    const streamers = WorldState.getAllStreamers();
    for (const streamer of streamers) {
      if (streamer.age !== undefined) {
        streamer.age++;
      }
    }
    console.log(`[WorldSimulator] Yearly aging complete - all streamers aged by 1 year`);
  }

  /**
   * Calculate weekly growth rate for a streamer
   */
  private calculateWeeklyGrowth(streamer: StreamerWorldData, trends: WorldTrend[]): number {
    const platform = PLATFORMS[streamer.platform];
    const genre = GENRES[streamer.genre];

    // Base growth from platform and genre
    let baseGrowth = 0.02; // 2% base weekly growth

    // Platform modifier
    baseGrowth *= platform.growthMultiplier;

    // Genre modifier
    baseGrowth *= genre.growthRate;

    // Stat modifiers
    const charismaBonus = (streamer.stats.charisma - 5) * 0.01;
    const consistencyBonus = (streamer.stats.consistency - 5) * 0.005;
    const ambitionBonus = (streamer.stats.ambition - 5) * 0.008;
    const adaptabilityBonus = (streamer.stats.adaptability - 5) * 0.005;

    baseGrowth += charismaBonus + consistencyBonus + ambitionBonus + adaptabilityBonus;

    // Burnout penalty
    if (streamer.burnout > 50) {
      const burnoutPenalty = (streamer.burnout - 50) / 100 * 0.05;
      baseGrowth -= burnoutPenalty;
    }

    // Trend multiplier
    const trendMultiplier = this.getTrendMultiplier(streamer, trends, 'follower');
    baseGrowth *= trendMultiplier;

    // Platform volatility (random variance)
    const volatility = platform.volatility;
    const variance = (Math.random() - 0.5) * 2 * volatility;
    baseGrowth += variance;

    // Larger streamers grow slower (logarithmic slowdown)
    if (streamer.followers > 100000) {
      const slowdown = Math.log10(streamer.followers / 100000) * 0.01;
      baseGrowth -= slowdown;
    }

    // Small streamers can grow faster
    if (streamer.followers < 10000) {
      baseGrowth *= 1.5;
    }

    // Age affects growth potential
    // Young streamers (18-25): Higher viral potential, +20% to +5% growth
    // Prime age (26-35): Baseline
    // Mature (36-45): Slightly slower growth, -5% to -15%
    // Veteran (46+): Slower growth but stable, -15% to -25%
    const age = streamer.age ?? 25;
    let ageGrowthModifier = 1.0;
    if (age <= 25) {
      ageGrowthModifier = 1.2 - (age - 18) * 0.02; // 1.2x at 18, 1.06x at 25
    } else if (age <= 35) {
      ageGrowthModifier = 1.0; // Baseline
    } else if (age <= 45) {
      ageGrowthModifier = 1.0 - (age - 35) * 0.01; // 0.9x at 45
    } else {
      ageGrowthModifier = 0.9 - (age - 45) * 0.01; // 0.8x at 55
      ageGrowthModifier = Math.max(0.75, ageGrowthModifier); // Floor at 0.75x
    }
    baseGrowth *= ageGrowthModifier;

    return baseGrowth;
  }

  /**
   * Get combined trend multiplier for a streamer
   */
  private getTrendMultiplier(
    streamer: StreamerWorldData,
    trends: WorldTrend[],
    type: 'follower' | 'revenue'
  ): number {
    let multiplier = 1.0;

    for (const trend of trends) {
      let applies = false;

      // Check if trend affects this platform
      if (trend.affectedPlatforms.length > 0) {
        if (trend.affectedPlatforms.includes(streamer.platform)) {
          applies = true;
        }
      }

      // Check if trend affects this genre
      if (trend.affectedGenres.length > 0) {
        if (trend.affectedGenres.includes(streamer.genre)) {
          applies = true;
        }
      }

      // Global/economic trends affect everyone
      if (trend.affectedPlatforms.length === 0 && trend.affectedGenres.length === 0) {
        applies = true;
      }

      if (applies) {
        const trendMultiplier = type === 'follower'
          ? trend.followerMultiplier
          : trend.revenueMultiplier;
        multiplier *= trendMultiplier;
      }
    }

    return multiplier;
  }

  /**
   * Calculate weekly burnout change
   */
  private calculateBurnoutChange(streamer: StreamerWorldData): number {
    // High consistency = faster burnout buildup
    const consistencyBurnout = (streamer.stats.consistency - 5) * 0.5;

    // High ambition = faster burnout
    const ambitionBurnout = (streamer.stats.ambition - 5) * 0.3;

    // Natural recovery
    const naturalRecovery = -2;

    // Large follower count = more pressure
    const pressureBurnout = streamer.followers > 500000 ? 1 : 0;

    return consistencyBurnout + ambitionBurnout + naturalRecovery + pressureBurnout;
  }

  /**
   * Process retirements
   */
  private processRetirements(result: WeeklySimulationResult): void {
    const streamers = WorldState.getAllStreamers();

    for (const streamer of streamers) {
      if (streamer.retiredWeek !== null) continue;

      if (this.shouldRetire(streamer)) {
        this.retireStreamer(streamer, result);
      }
    }
  }

  /**
   * Check if a streamer should retire
   */
  private shouldRetire(streamer: StreamerWorldData): boolean {
    const age = streamer.age ?? 25;

    // Age factor: increases retirement probability for older streamers
    // Under 30: 1.0x, 30-39: 1.0-1.5x, 40-49: 1.5-2.5x, 50+: 2.5-4.0x
    let ageFactor = 1.0;
    if (age >= 50) {
      ageFactor = 2.5 + (age - 50) * 0.15; // 2.5x at 50, up to 4.0x at 60
    } else if (age >= 40) {
      ageFactor = 1.5 + (age - 40) * 0.1; // 1.5x at 40, 2.5x at 50
    } else if (age >= 30) {
      ageFactor = 1.0 + (age - 30) * 0.05; // 1.0x at 30, 1.5x at 40
    }

    // 1. Burnout collapse (age makes recovery harder)
    if (streamer.consecutiveBurnoutWeeks >= CONFIG.RETIREMENT_BURNOUT_WEEKS) {
      const burnoutRetireChance = 0.5 * ageFactor;
      return Math.random() < Math.min(burnoutRetireChance, 0.9);
    }

    // 2. Failure exit (very low followers for extended period)
    if (streamer.followers < 100 && streamer.consecutiveDeclineWeeks >= 8) {
      return Math.random() < 0.7; // Age doesn't affect failure exit much
    }

    // 3. Career sunset (long career + declining) - age amplifies this
    if (streamer.careerWeeks > 200 && streamer.consecutiveDeclineWeeks >= 8) {
      const sunsetChance = 0.3 * ageFactor;
      return Math.random() < Math.min(sunsetChance, 0.8);
    }

    // 4. Graceful exit (successful streamer choosing to retire)
    // Older successful streamers more likely to retire gracefully
    if (streamer.followers > 1000000 && streamer.careerWeeks > 100) {
      const gracefulChance = 0.02 * ageFactor;
      return Math.random() < Math.min(gracefulChance, 0.15);
    }

    // 5. Age-based retirement (older streamers may just decide to move on)
    if (age >= 45) {
      const ageRetireChance = (age - 45) * 0.005; // 0.5% per year over 45
      if (Math.random() < ageRetireChance) {
        return true;
      }
    }

    // 6. Random retirement (scales with career length AND age)
    const baseChance = 0.001; // 0.1% base
    const careerFactor = Math.min(streamer.careerWeeks / 500, 1); // Max 2x at 500 weeks
    const randomChance = baseChance * (1 + careerFactor) * ageFactor;
    return Math.random() < Math.min(randomChance, 0.05); // Cap at 5%
  }

  /**
   * Retire a streamer
   */
  private retireStreamer(streamer: StreamerWorldData, result: WeeklySimulationResult): void {
    streamer.retiredWeek = WorldState.weekNumber;

    // Remove from agency if signed
    if (streamer.agencyId && streamer.agencyId !== 'player') {
      WorldState.releaseStreamerFromAgency(streamer.id);
    }

    // Remove from free agents
    const freeIndex = WorldState.data.freeAgentIds.indexOf(streamer.id);
    if (freeIndex !== -1) {
      WorldState.data.freeAgentIds.splice(freeIndex, 1);
    }

    // Add to retired list
    WorldState.data.retiredIds.push(streamer.id);

    result.retirements.push(streamer);

    const age = streamer.age ?? 25;
    const yearsStreaming = Math.floor(streamer.careerWeeks / 52);
    const ageNote = age >= 45 ? ` at age ${age}` : '';

    WorldState.addNewsEvent({
      type: 'retirement',
      title: `${streamer.name} announces retirement${ageNote}`,
      description: `After ${yearsStreaming > 0 ? `${yearsStreaming} years` : `${streamer.careerWeeks} weeks`}, ${streamer.name} is stepping away from streaming.`,
      streamerId: streamer.id,
    });
  }

  /**
   * Process comebacks from retired streamers
   */
  private processComebacks(result: WeeklySimulationResult): void {
    const retiredIds = [...WorldState.data.retiredIds];

    for (const streamerId of retiredIds) {
      const streamer = WorldState.getStreamer(streamerId);
      if (!streamer || streamer.retiredWeek === null) continue;

      const weeksRetired = WorldState.weekNumber - streamer.retiredWeek;

      // Must be retired for minimum weeks
      if (weeksRetired < CONFIG.COMEBACK_MIN_WEEKS) continue;

      // Comeback chance
      if (Math.random() < CONFIG.COMEBACK_CHANCE) {
        this.processComeback(streamer, result);
      }
    }
  }

  /**
   * Process a comeback for a retired streamer
   */
  private processComeback(streamer: StreamerWorldData, result: WeeklySimulationResult): void {
    // Remove from retired list
    const retiredIndex = WorldState.data.retiredIds.indexOf(streamer.id);
    if (retiredIndex !== -1) {
      WorldState.data.retiredIds.splice(retiredIndex, 1);
    }

    // Reset streamer stats for comeback
    streamer.retiredWeek = null;
    streamer.followers = Math.floor(streamer.peakFollowers * 0.2); // 20% of peak
    streamer.burnout = 0;
    streamer.consecutiveBurnoutWeeks = 0;
    streamer.consecutiveDeclineWeeks = 0;

    // Add to free agents
    WorldState.data.freeAgentIds.push(streamer.id);

    result.comebacks.push(streamer);

    WorldState.addNewsEvent({
      type: 'comeback',
      title: `${streamer.name} announces comeback!`,
      description: `Former streamer ${streamer.name} is returning to the industry.`,
      streamerId: streamer.id,
    });
  }

  /**
   * Generate new streamers for the week
   */
  private generateNewStreamers(result: WeeklySimulationResult): void {
    const trends = WorldState.getActiveTrends();

    // Base count + trend bonus
    let count: number = CONFIG.WEEKLY_NEW_STREAMERS_BASE;

    // Add bonus for positive trends
    for (const trend of trends) {
      if (trend.followerMultiplier > 1) {
        count++;
      }
    }

    count = Math.min(count, CONFIG.WEEKLY_NEW_STREAMERS_MAX);

    const platformDistribution = {
      SWITCH: 0.50,
      YETUBE: 0.30,
      OHFANS: 0.20,
    };

    for (let i = 0; i < count; i++) {
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

      const newStreamer = this.generateNewStreamer(platform);
      WorldState.data.streamers[newStreamer.id] = newStreamer;
      WorldState.data.freeAgentIds.push(newStreamer.id);
      result.newStreamers.push(newStreamer);

      WorldState.addNewsEvent({
        type: 'milestone',
        title: `Rising star: ${newStreamer.name}`,
        description: `A new streamer has entered the scene on ${PLATFORMS[platform].name}.`,
        streamerId: newStreamer.id,
      });
    }
  }

  /**
   * Generate a single new streamer (rookie)
   */
  private generateNewStreamer(platform: PlatformKey): StreamerWorldData {
    // Use WorldState's generation but override for rookies
    const id = `streamer_${Date.now()}_new_${Math.random().toString(36).substr(2, 9)}`;

    const FIRST_NAMES = [
      'Alex', 'Jordan', 'Casey', 'Riley', 'Quinn', 'Morgan', 'Taylor', 'Jamie', 'Avery', 'Parker',
      'Luna', 'Nova', 'Kai', 'Zephyr', 'Storm', 'Echo', 'Onyx', 'Jade', 'Ash', 'Ember',
    ];
    const LAST_NAMES = [
      'Chen', 'Kim', 'Garcia', 'Singh', 'Storm', 'Blaze', 'Frost', 'Night', 'Shadow', 'Pixel',
    ];
    const SUFFIXES = ['', '_TV', '_Live', '_Gaming', '_Stream', 'Official', '_VT'];

    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
    const name = `${firstName}${lastName}${suffix}`;

    // Select genre based on platform affinity
    const genreKeys = Object.keys(GENRES) as GenreKey[];
    const weights = genreKeys.map(g => GENRES[g].platformAffinity[platform] || 1.0);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;
    let genre: GenreKey = 'VARIETY';
    for (let i = 0; i < genreKeys.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        genre = genreKeys[i];
        break;
      }
    }

    // Rookie stats (with prodigy chance)
    const isProdigy = Math.random() < 0.05;
    const stats = {
      charisma: Math.floor(1 + Math.random() * 10),
      consistency: Math.floor(1 + Math.random() * 10),
      dramaRisk: Math.floor(1 + Math.random() * 10),
      skill: Math.floor(1 + Math.random() * 10),
      adaptability: Math.floor(1 + Math.random() * 10),
      loyalty: Math.floor(1 + Math.random() * 10),
      ambition: Math.floor(1 + Math.random() * 10),
    };

    if (isProdigy) {
      const statKeys = Object.keys(stats) as (keyof typeof stats)[];
      const prodigyStat = statKeys[Math.floor(Math.random() * statKeys.length)];
      stats[prodigyStat] = 9 + Math.floor(Math.random() * 2);
    }

    // Rookie followers (50-500)
    const followers = Math.floor(50 + Math.random() * 450);

    const { AVATAR_COLORS } = require('../config');

    // New streamers can be any age (18-40) - streaming is for everyone!
    // Weighted: 50% 18-25, 30% 26-32, 20% 33-40
    const ageRoll = Math.random();
    let age: number;
    if (ageRoll < 0.5) {
      age = 18 + Math.floor(Math.random() * 8); // 18-25
    } else if (ageRoll < 0.8) {
      age = 26 + Math.floor(Math.random() * 7); // 26-32
    } else {
      age = 33 + Math.floor(Math.random() * 8); // 33-40
    }

    return {
      id,
      name,
      genre,
      platform,
      followers,
      stats,
      traits: [],
      burnout: 0,
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      contractEndDay: 0,
      revenueSplit: 0.5,
      signedOnDay: 0,
      age,
      experienceYears: 0, // New streamers have 0 experience
      agencyId: null,
      careerWeeks: 0,
      peakFollowers: followers,
      weeklyImpressions: Math.floor(followers * 5),
      lastWeekFollowers: followers,
      consecutiveBurnoutWeeks: 0,
      consecutiveDeclineWeeks: 0,
      retiredWeek: null,
    };
  }

  /**
   * Calculate rankings for snapshot
   */
  private calculateRankings(result: WeeklySimulationResult): void {
    const allStreamers = WorldState.getAllStreamers()
      .filter(s => s.retiredWeek === null);

    // Sort by power score (followers * 0.4 + growth * 0.3 + impressions * 0.2 + stats * 0.1)
    const rankedStreamers = allStreamers.map(s => {
      const growthRate = s.lastWeekFollowers > 0
        ? (s.followers - s.lastWeekFollowers) / s.lastWeekFollowers
        : 0;
      const avgStats = Object.values(s.stats).reduce((a, b) => a + b, 0) / 7;

      const powerScore =
        s.followers * 0.4 +
        growthRate * 10000 * 0.3 +
        s.weeklyImpressions / 1000 * 0.2 +
        avgStats * 100 * 0.1;

      return { streamer: s, powerScore, growthRate };
    }).sort((a, b) => b.powerScore - a.powerScore);

    // Top 10 streamers
    result.snapshot.topStreamers = rankedStreamers.slice(0, 10).map(r => ({
      id: r.streamer.id,
      name: r.streamer.name,
      followers: r.streamer.followers,
      growth: Math.round(r.growthRate * 100),
    }));

    // Agency rankings
    const agencies = WorldState.getAIAgencies();

    const rankedAgencies = agencies.map(agency => {
      const roster = WorldState.getAgencyRoster(agency.id);
      const totalFollowers = roster.reduce((sum, s) => sum + s.followers, 0);
      const avgPower = roster.length > 0
        ? rankedStreamers
            .filter(r => roster.some(s => s.id === r.streamer.id))
            .reduce((sum, r) => sum + r.powerScore, 0) / roster.length
        : 0;

      const score =
        totalFollowers * 0.3 +
        agency.weeklyRevenue * 0.3 +
        agency.reputation * 100 * 0.2 +
        avgPower * 0.2;

      return { agency, score };
    }).sort((a, b) => b.score - a.score);

    result.snapshot.agencyRankings = rankedAgencies.map((r) => ({
      id: r.agency.id,
      name: r.agency.name,
      score: Math.round(r.score),
      change: 0, // Would need previous snapshot to calculate
    }));

    // Other snapshot data
    result.snapshot.totalActiveStreamers = allStreamers.length;
    result.snapshot.totalFreeAgents = WorldState.data.freeAgentIds.length;
    result.snapshot.newStreamers = result.newStreamers.map(s => s.id);
    result.snapshot.retirements = result.retirements.map(s => s.id);
    result.snapshot.comebacks = result.comebacks.map(s => s.id);
    result.snapshot.activeTrendIds = WorldState.getActiveTrends().map(t => t.id);
  }

  /**
   * Create an empty snapshot
   */
  private createEmptySnapshot(weekNumber: number): WeeklySnapshot {
    return {
      weekNumber,
      topStreamers: [],
      agencyRankings: [],
      totalActiveStreamers: 0,
      totalFreeAgents: 0,
      newStreamers: [],
      retirements: [],
      comebacks: [],
      activeTrendIds: [],
      newsEvents: [],
    };
  }

  /**
   * Store snapshot in world state
   */
  private storeSnapshot(snapshot: WeeklySnapshot): void {
    WorldState.data.weeklySnapshots.push(snapshot);

    // Keep only last N snapshots
    if (WorldState.data.weeklySnapshots.length > CONFIG.WEEKLY_SNAPSHOT_LIMIT) {
      WorldState.data.weeklySnapshots = WorldState.data.weeklySnapshots.slice(-CONFIG.WEEKLY_SNAPSHOT_LIMIT);
    }
  }
}

export const WorldSimulator = new WorldSimulatorClass();
