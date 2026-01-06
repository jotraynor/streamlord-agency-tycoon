import { AVATAR_COLORS, CONFIG, GENRES, GenreKey, PLATFORMS, PlatformKey, TraitKey, TRAITS } from '../config';
import { WeeklySchedule } from './WeeklySchedule';

// Result of weekly growth calculation
export interface WeeklyGrowthResult {
  followersBefore: number;
  followersAfter: number;
  followerChange: number;
  burnoutBefore: number;
  burnoutAfter: number;
  burnoutChange: number;
  viewsGenerated: number;
}

// Platform-specific weekly result
export interface PlatformWeekResult {
  platform: PlatformKey;
  hoursStreamed: number;
  views: number;
  followerChange: number;
  revenue: number;
}

export interface StreamerStats {
  // Core stats
  charisma: number;      // 1-10: Affects viewer retention and revenue
  consistency: number;   // 1-10: Affects daily reliability, but high = faster burnout
  dramaRisk: number;     // 1-10: Higher = more drama events, but also viral potential
  // New stats
  skill: number;         // 1-10: Content quality, affects revenue ceiling
  adaptability: number;  // 1-10: How well they pivot to trends
  loyalty: number;       // 1-10: Resistance to poaching, renewal willingness
  ambition: number;      // 1-10: Growth bonus, but demands escalate
}

export interface StreamerData {
  id: string;
  name: string;
  genre: GenreKey;       // Genre with mechanical properties
  niche?: string;        // Legacy field for backwards compatibility
  platform: keyof typeof PLATFORMS;
  followers: number;
  stats: StreamerStats;
  traits: TraitKey[];    // Earned through career events
  burnout: number;       // 0-100: Accumulated burnout (high consistency increases this)
  avatarColor: string;
  contractEndDay: number;
  revenueSplit: number;  // Agency's cut (0-1)
  signedOnDay: number;
  age: number;           // Real age in years (18-55+)
  experienceYears: number; // Years streaming (0-20+), separate from age
}

export class Streamer {
  public readonly id: string;
  public name: string;
  public genre: GenreKey;
  public platform: keyof typeof PLATFORMS;
  public followers: number;
  public stats: StreamerStats;
  public traits: TraitKey[];
  public burnout: number;
  public avatarColor: string;
  public contractEndDay: number;
  public revenueSplit: number;
  public signedOnDay: number;
  public age: number;
  public experienceYears: number;

  constructor(data: StreamerData) {
    this.id = data.id;
    this.name = data.name;
    this.genre = data.genre;
    this.platform = data.platform;
    this.followers = data.followers;
    this.stats = { ...data.stats };
    this.traits = [...(data.traits || [])];
    this.burnout = data.burnout || 0;
    this.avatarColor = data.avatarColor;
    this.contractEndDay = data.contractEndDay;
    this.revenueSplit = data.revenueSplit;
    this.signedOnDay = data.signedOnDay;
    this.age = data.age ?? 25; // Default for legacy saves
    this.experienceYears = data.experienceYears ?? 0; // Default for legacy saves
  }

  // Get genre display name
  getGenreName(): string {
    return GENRES[this.genre]?.name || this.genre;
  }

  // Check if streamer has a specific trait
  hasTrait(trait: TraitKey): boolean {
    return this.traits.includes(trait);
  }

  // Add a trait (prevents duplicates and opposites)
  addTrait(trait: TraitKey): boolean {
    const traitDef = TRAITS[trait];
    if (!traitDef) return false;

    // Check if already has this trait
    if (this.traits.includes(trait)) return false;

    // Remove opposite trait if present
    if (traitDef.opposite && this.traits.includes(traitDef.opposite as TraitKey)) {
      this.traits = this.traits.filter(t => t !== traitDef.opposite);
    }

    this.traits.push(trait);
    return true;
  }

  getInitials(): string {
    return this.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // DiceBear avatar URL - uses streamer ID as seed for consistent generation
  getAvatarUrl(size: number = 80): string {
    return `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${encodeURIComponent(this.id)}&size=${size}`;
  }

  getDailyRevenue(): number {
    const platformData = PLATFORMS[this.platform];
    const genreData = GENRES[this.genre];

    const baseRevenue = (this.followers / 1000) * 2; // $2 per 1k followers

    // Stat bonuses
    const charismaBonus = 1 + (this.stats.charisma - 5) * 0.1;
    const consistencyBonus = 1 + (this.stats.consistency - 5) * 0.05;
    const skillBonus = 1 + (this.stats.skill - 5) * 0.08; // Skill affects content quality

    // Genre affects base revenue
    const genreMultiplier = genreData.baseRevenueMultiplier;

    // Platform affinity for this genre
    const affinityBonus = genreData.platformAffinity[this.platform] || 1.0;

    // Burnout penalty (steeper at higher levels)
    const burnoutPenalty = this.getBurnoutPenalty();

    return Math.floor(
      baseRevenue *
      platformData.revenueMultiplier *
      genreMultiplier *
      affinityBonus *
      charismaBonus *
      consistencyBonus *
      skillBonus *
      burnoutPenalty *
      this.revenueSplit
    );
  }

  // Apply daily follower change based on platform and genre mechanics
  applyDailyGrowth(): { followerChange: number; burnoutChange: number } {
    const platformData = PLATFORMS[this.platform];
    const genreData = GENRES[this.genre];

    // Base drift with platform volatility
    const baseDrift = (Math.random() - 0.45) * platformData.volatility * 2;

    // Growth bonus from platform
    const platformGrowth = (platformData.growthMultiplier - 1) * 0.01;

    // Genre growth rate
    const genreGrowth = (genreData.growthRate - 1) * 0.01;

    // Consistency helps maintain steady growth
    const consistencyBonus = (this.stats.consistency / 10) * 0.005;

    // Ambition drives growth but demands more
    const ambitionBonus = (this.stats.ambition - 5) * 0.003;

    // Platform affinity for this genre
    const affinityBonus = ((genreData.platformAffinity[this.platform] || 1.0) - 1) * 0.01;

    // Burnout penalty (reduces growth when burned out)
    const burnoutPenalty = (this.burnout / 100) * 0.02;

    // Apply follower change
    const change = baseDrift + platformGrowth + genreGrowth + consistencyBonus + ambitionBonus + affinityBonus - burnoutPenalty;
    const oldFollowers = this.followers;
    this.followers = Math.max(10, Math.floor(this.followers * (1 + change)));

    // Apply burnout (high consistency = faster burnout accumulation)
    const burnoutRate = (this.stats.consistency / 10) * 2; // 0.2 to 2 per day
    const burnoutChange = burnoutRate - 0.5; // Natural recovery of 0.5 per day
    this.burnout = Math.max(0, Math.min(100, this.burnout + burnoutChange));

    return {
      followerChange: this.followers - oldFollowers,
      burnoutChange
    };
  }

  // Check if streamer is burned out (burnout >= 60)
  isBurnedOut(): boolean {
    return this.burnout >= 60;
  }

  /**
   * Calculate burnout penalty multiplier for revenue/performance
   * Uses a steeper curve at higher burnout levels:
   * - 0-50: Mild penalty (up to -10%)
   * - 50-70: Moderate penalty (-10% to -25%)
   * - 70-90: Severe penalty (-25% to -45%)
   * - 90-100: Critical penalty (-45% to -60%)
   */
  getBurnoutPenalty(): number {
    if (this.burnout <= 50) {
      // Mild: 0-50 burnout = 1.0 to 0.9 (up to -10%)
      return 1 - (this.burnout / 50) * 0.1;
    } else if (this.burnout <= 70) {
      // Moderate: 50-70 burnout = 0.9 to 0.75 (-10% to -25%)
      return 0.9 - ((this.burnout - 50) / 20) * 0.15;
    } else if (this.burnout <= 90) {
      // Severe: 70-90 burnout = 0.75 to 0.55 (-25% to -45%)
      return 0.75 - ((this.burnout - 70) / 20) * 0.2;
    } else {
      // Critical: 90-100 burnout = 0.55 to 0.4 (-45% to -60%)
      return 0.55 - ((this.burnout - 90) / 10) * 0.15;
    }
  }

  // Give streamer a break (reduces burnout)
  takeBreak(days: number = 7): number {
    const recovery = days * 5; // 5 burnout points per day of rest
    const oldBurnout = this.burnout;
    this.burnout = Math.max(0, this.burnout - recovery);
    return oldBurnout - this.burnout;
  }

  // Get effective drama risk factoring in platform
  getEffectiveDramaRisk(): number {
    const platformData = PLATFORMS[this.platform];
    return Math.min(10, this.stats.dramaRisk * platformData.dramaMultiplier);
  }

  // Switch platform (for multi-platform support)
  switchPlatform(newPlatform: PlatformKey): void {
    this.platform = newPlatform;
    // Switching platforms causes some follower loss (audience doesn't fully migrate)
    this.followers = Math.floor(this.followers * 0.6);
  }

  // ============================================
  // WEEKLY SYSTEM METHODS
  // ============================================

  /**
   * Calculate streaming revenue for a week based on schedule
   * Returns the agency's cut of revenue
   */
  getWeeklyStreamingRevenue(schedule: WeeklySchedule): number {
    if (schedule.takingBreak) return 0;

    let totalRevenue = 0;
    const genreData = GENRES[this.genre];

    for (const allocation of schedule.platformAllocations) {
      if (allocation.hoursPerWeek < CONFIG.HOURS_MIN_PER_PLATFORM) continue;

      const platformData = PLATFORMS[allocation.platform];

      // Base: $0.50 per 1k followers per hour streamed
      const baseRevenue = (this.followers / 1000) * allocation.hoursPerWeek * CONFIG.BASE_WEEKLY_REVENUE_PER_1K_FOLLOWERS_PER_HOUR;

      // Platform and genre multipliers
      const platformMult = platformData.revenueMultiplier;
      const genreMult = genreData.baseRevenueMultiplier;
      const affinityBonus = genreData.platformAffinity[allocation.platform] || 1.0;

      // Stat bonuses
      const charismaBonus = 1 + (this.stats.charisma - 5) * 0.08;
      const skillBonus = 1 + (this.stats.skill - 5) * 0.06;
      const consistencyBonus = 1 + (this.stats.consistency - 5) * 0.04;

      // Burnout penalty (steeper curve at high burnout)
      const burnoutPenalty = this.getBurnoutPenalty();

      // Diminishing returns for very high hours
      let hoursEfficiency = 1;
      if (allocation.hoursPerWeek > CONFIG.BURNOUT_HEAVY_THRESHOLD) {
        const excessHours = allocation.hoursPerWeek - CONFIG.BURNOUT_HEAVY_THRESHOLD;
        hoursEfficiency = 1 - (excessHours * 0.015); // -1.5% per hour over 45
      }

      const platformRevenue = baseRevenue * platformMult * genreMult * affinityBonus
        * charismaBonus * skillBonus * consistencyBonus * burnoutPenalty * hoursEfficiency;

      totalRevenue += platformRevenue;
    }

    // Return agency's cut
    return Math.floor(totalRevenue * this.revenueSplit);
  }

  /**
   * Get estimated weekly revenue (for UI, uses default schedule if none provided)
   */
  getEstimatedWeeklyRevenue(schedule?: WeeklySchedule): number {
    if (!schedule) {
      // Use a default 30hr schedule on primary platform
      schedule = {
        streamerId: this.id,
        totalHoursPerWeek: CONFIG.HOURS_DEFAULT_PER_WEEK,
        platformAllocations: [{ platform: this.platform, hoursPerWeek: CONFIG.HOURS_DEFAULT_PER_WEEK }],
        takingBreak: false,
        sponsorshipOptIn: true,
      };
    }
    return this.getWeeklyStreamingRevenue(schedule);
  }

  /**
   * Calculate views generated for each platform during the week
   */
  getWeeklyViews(schedule: WeeklySchedule): Map<PlatformKey, number> {
    const viewsPerPlatform = new Map<PlatformKey, number>();

    if (schedule.takingBreak) return viewsPerPlatform;

    for (const allocation of schedule.platformAllocations) {
      if (allocation.hoursPerWeek < CONFIG.HOURS_MIN_PER_PLATFORM) continue;

      // Base views: 3-7x followers, scaled by hours
      const hoursRatio = allocation.hoursPerWeek / CONFIG.HOURS_DEFAULT_PER_WEEK;
      const baseViews = this.followers * (3 + Math.random() * 4) * hoursRatio;

      // Platform volatility affects view variance
      const platformData = PLATFORMS[allocation.platform];
      const volatilityFactor = 1 + (Math.random() - 0.5) * platformData.volatility * 10;

      // Charisma affects viewer engagement
      const charismaBonus = 1 + (this.stats.charisma - 5) * 0.1;

      const views = Math.floor(baseViews * volatilityFactor * charismaBonus);
      viewsPerPlatform.set(allocation.platform, views);
    }

    return viewsPerPlatform;
  }

  /**
   * Calculate follower growth for each platform during the week
   * Returns per-platform growth (not applied automatically)
   */
  calculateWeeklyGrowth(schedule: WeeklySchedule): Map<PlatformKey, number> {
    const growthPerPlatform = new Map<PlatformKey, number>();

    if (schedule.takingBreak) {
      // No growth on break, but no loss either
      return growthPerPlatform;
    }

    const genreData = GENRES[this.genre];

    for (const allocation of schedule.platformAllocations) {
      if (allocation.hoursPerWeek < CONFIG.HOURS_MIN_PER_PLATFORM) continue;

      const platformData = PLATFORMS[allocation.platform];

      // Base weekly growth: 1-3% depending on hours
      const hoursRatio = Math.min(allocation.hoursPerWeek / CONFIG.HOURS_MAX_PER_WEEK, 1);
      const baseGrowth = 0.01 + (hoursRatio * 0.02); // 1-3%

      // Platform growth multiplier
      let growthRate = baseGrowth * platformData.growthMultiplier;

      // Genre growth rate
      growthRate *= genreData.growthRate;

      // Platform affinity bonus
      const affinity = genreData.platformAffinity[allocation.platform] || 1.0;
      growthRate *= affinity;

      // Stat bonuses
      const charismaBonus = (this.stats.charisma - 5) * 0.005;
      const adaptBonus = (this.stats.adaptability - 5) * 0.003;
      const ambitionBonus = (this.stats.ambition - 5) * 0.004;

      growthRate += charismaBonus + adaptBonus + ambitionBonus;

      // Burnout penalty (applies at all levels, steeper above 50)
      growthRate *= this.getBurnoutPenalty();

      // Volatility (random factor based on platform)
      const volatility = (Math.random() - 0.5) * platformData.volatility * 2;
      growthRate += volatility;

      // Age affects growth rate
      const age = this.age ?? 25;
      let ageModifier = 1.0;
      if (age <= 25) {
        ageModifier = 1.15 - (age - 18) * 0.02; // 1.15x at 18, 1.01x at 25
      } else if (age <= 35) {
        ageModifier = 1.0;
      } else if (age <= 45) {
        ageModifier = 1.0 - (age - 35) * 0.01; // 0.9x at 45
      } else {
        ageModifier = 0.9 - (age - 45) * 0.01; // 0.8x at 55
        ageModifier = Math.max(0.75, ageModifier);
      }
      growthRate *= ageModifier;

      // Large accounts grow slower
      if (this.followers > 100000) {
        const sizePenalty = Math.log10(this.followers / 100000) * 0.01;
        growthRate -= sizePenalty;
      } else if (this.followers < 10000) {
        // Small accounts can grow faster
        growthRate *= 1.3;
      }

      // Calculate actual follower change
      // Weight by proportion of total hours on this platform
      const platformWeight = allocation.hoursPerWeek / schedule.totalHoursPerWeek;
      const followerChange = Math.floor(this.followers * growthRate * platformWeight);

      growthPerPlatform.set(allocation.platform, followerChange);
    }

    return growthPerPlatform;
  }

  /**
   * Calculate burnout change for the week
   * Returns the change amount (positive = more burnout, negative = recovery)
   */
  calculateBurnoutChange(schedule: WeeklySchedule): number {
    if (schedule.takingBreak) {
      // Taking a full break - significant recovery
      return -CONFIG.BREAK_RECOVERY_RATE;
    }

    let burnoutChange = 0;
    const totalHours = schedule.totalHoursPerWeek;

    // High hours increase burnout
    if (totalHours > CONFIG.BURNOUT_HEAVY_THRESHOLD) {
      const excessHours = totalHours - CONFIG.BURNOUT_HEAVY_THRESHOLD;
      burnoutChange += excessHours * 1.5;
    } else if (totalHours < CONFIG.BURNOUT_LIGHT_THRESHOLD) {
      // Light week provides some recovery
      burnoutChange -= 5;
    }

    // High consistency streamers burn out faster
    const consistencyFactor = 1 + (this.stats.consistency - 5) * 0.1;
    burnoutChange *= consistencyFactor;

    // Natural weekly recovery
    burnoutChange -= CONFIG.WEEKLY_NATURAL_RECOVERY;

    return burnoutChange;
  }

  /**
   * Apply a full week's worth of changes to the streamer
   * This mutates the streamer's state and returns the results
   */
  applyWeeklyChanges(schedule: WeeklySchedule): WeeklyGrowthResult {
    const followersBefore = this.followers;
    const burnoutBefore = this.burnout;

    // Calculate changes
    const growthByPlatform = this.calculateWeeklyGrowth(schedule);
    const viewsByPlatform = this.getWeeklyViews(schedule);
    const burnoutChange = this.calculateBurnoutChange(schedule);

    // Sum up total follower change
    let totalFollowerChange = 0;
    for (const change of growthByPlatform.values()) {
      totalFollowerChange += change;
    }

    // Sum up total views
    let totalViews = 0;
    for (const views of viewsByPlatform.values()) {
      totalViews += views;
    }

    // Apply changes
    this.followers = Math.max(10, this.followers + totalFollowerChange);
    this.burnout = Math.max(0, Math.min(100, this.burnout + burnoutChange));

    return {
      followersBefore,
      followersAfter: this.followers,
      followerChange: this.followers - followersBefore,
      burnoutBefore,
      burnoutAfter: this.burnout,
      burnoutChange: this.burnout - burnoutBefore,
      viewsGenerated: totalViews,
    };
  }

  /**
   * Get platform-by-platform breakdown for weekly results
   */
  getWeeklyPlatformBreakdown(schedule: WeeklySchedule): PlatformWeekResult[] {
    const results: PlatformWeekResult[] = [];

    if (schedule.takingBreak) return results;

    const growthByPlatform = this.calculateWeeklyGrowth(schedule);
    const viewsByPlatform = this.getWeeklyViews(schedule);

    for (const allocation of schedule.platformAllocations) {
      if (allocation.hoursPerWeek < CONFIG.HOURS_MIN_PER_PLATFORM) continue;

      const platformData = PLATFORMS[allocation.platform];
      const genreData = GENRES[this.genre];

      // Calculate revenue for this platform specifically
      const baseRevenue = (this.followers / 1000) * allocation.hoursPerWeek * CONFIG.BASE_WEEKLY_REVENUE_PER_1K_FOLLOWERS_PER_HOUR;
      const platformMult = platformData.revenueMultiplier;
      const genreMult = genreData.baseRevenueMultiplier;
      const affinityBonus = genreData.platformAffinity[allocation.platform] || 1.0;
      const charismaBonus = 1 + (this.stats.charisma - 5) * 0.08;
      const skillBonus = 1 + (this.stats.skill - 5) * 0.06;
      const burnoutPenalty = this.getBurnoutPenalty();

      const revenue = Math.floor(
        baseRevenue * platformMult * genreMult * affinityBonus * charismaBonus * skillBonus * burnoutPenalty * this.revenueSplit
      );

      results.push({
        platform: allocation.platform,
        hoursStreamed: allocation.hoursPerWeek,
        views: viewsByPlatform.get(allocation.platform) || 0,
        followerChange: growthByPlatform.get(allocation.platform) || 0,
        revenue,
      });
    }

    return results;
  }

  toData(): StreamerData {
    return {
      id: this.id,
      name: this.name,
      genre: this.genre,
      platform: this.platform,
      followers: this.followers,
      stats: { ...this.stats },
      traits: [...this.traits],
      burnout: this.burnout,
      avatarColor: this.avatarColor,
      contractEndDay: this.contractEndDay,
      revenueSplit: this.revenueSplit,
      signedOnDay: this.signedOnDay,
      age: this.age,
      experienceYears: this.experienceYears,
    };
  }

  static fromData(data: StreamerData): Streamer {
    return new Streamer(data);
  }

  static generateRandom(currentDay: number, platform: PlatformKey = 'SWITCH'): Streamer {
    const firstNames = [
      'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn',
      'Skyler', 'Blake', 'Cameron', 'Dakota', 'Drew', 'Finley', 'Hayden', 'Jamie',
      'Kai', 'Logan', 'Max', 'Parker', 'Reese', 'River', 'Sage', 'Spencer',
    ];
    const lastNames = [
      'Storm', 'Blaze', 'Frost', 'Shadow', 'Phoenix', 'Wolf', 'Raven', 'Nova',
      'Vex', 'Pixel', 'Glitch', 'Static', 'Chaos', 'Echo', 'Void', 'Cipher',
    ];
    const suffixes = ['', '_TV', '_Live', 'Gaming', '_Plays', 'XO', '420', '69', '_irl'];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    const name = `${firstName}${lastName}${suffix}`;

    // Pick a genre with platform-weighted probability
    const genreKeys = Object.keys(GENRES) as GenreKey[];
    const genreWeights = genreKeys.map(g => {
      const genre = GENRES[g];
      return genre.platformAffinity[platform] || 1.0;
    });
    const totalWeight = genreWeights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;
    let genre: GenreKey = 'VARIETY';
    for (let i = 0; i < genreKeys.length; i++) {
      roll -= genreWeights[i];
      if (roll <= 0) {
        genre = genreKeys[i];
        break;
      }
    }

    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const randStat = () => Math.floor(Math.random() * 10) + 1;

    // Follower count varies by platform
    let followers: number;
    if (platform === 'OHFANS') {
      followers = Math.floor(Math.random() * 15000) + 100;
    } else if (platform === 'YETUBE') {
      followers = Math.floor(Math.random() * 80000) + 500;
    } else {
      followers = Math.floor(Math.random() * 49900) + 100;
    }

    // Generate all stats
    let dramaRisk = randStat();
    if (platform === 'OHFANS') {
      dramaRisk = Math.min(10, dramaRisk + 2);
    }

    // Loyalty inversely correlates with ambition somewhat
    const ambition = randStat();
    let loyalty = randStat();
    if (ambition >= 8) {
      loyalty = Math.max(1, loyalty - 2); // Very ambitious streamers are less loyal
    }

    // Generate age (weighted toward younger)
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

    // Experience loosely correlates with followers
    let experienceYears: number;
    if (followers < 1000) {
      experienceYears = Math.floor(Math.random() * 3); // 0-2 years
    } else if (followers < 10000) {
      experienceYears = 1 + Math.floor(Math.random() * 4); // 1-4 years
    } else if (followers < 50000) {
      experienceYears = 2 + Math.floor(Math.random() * 5); // 2-6 years
    } else {
      experienceYears = 3 + Math.floor(Math.random() * 8); // 3-10 years
    }

    return new Streamer({
      id: crypto.randomUUID(),
      name,
      genre,
      platform,
      followers,
      stats: {
        charisma: randStat(),
        consistency: randStat(),
        dramaRisk,
        skill: randStat(),
        adaptability: randStat(),
        loyalty,
        ambition,
      },
      traits: [], // Traits are earned through events, not generated
      burnout: Math.floor(Math.random() * 20), // Start with 0-20 burnout
      avatarColor,
      contractEndDay: currentDay + 30 + Math.floor(Math.random() * 60),
      revenueSplit: 0.3 + Math.random() * 0.3,
      signedOnDay: currentDay,
      age,
      experienceYears,
    });
  }

  static getSigningCost(streamer: Streamer): number {
    // Base cost scales with followers
    const followerValue = streamer.followers / 100;

    // Core stats affect value
    const charismaValue = streamer.stats.charisma * 80;
    const skillValue = streamer.stats.skill * 60;
    const consistencyValue = streamer.stats.consistency * 40;

    // Ambition increases demands significantly
    const ambitionMultiplier = 1 + (streamer.stats.ambition - 5) * 0.15;

    // Low loyalty = flight risk, so discount
    const loyaltyDiscount = (10 - streamer.stats.loyalty) * 30;

    // Drama is risky, but high drama streamers know they're valuable for views
    const dramaAdjustment = streamer.stats.dramaRisk > 7
      ? streamer.stats.dramaRisk * 20  // High drama demands more
      : -streamer.stats.dramaRisk * 30; // Low-mid drama is a discount

    // Age affects signing cost
    // Young (18-24): Cheaper, unproven but with upside (0.85x - 0.97x)
    // Prime (25-34): Peak value, full price (1.0x)
    // Mature (35-44): Slight discount, shorter runway (0.85x - 0.95x)
    // Veteran (45+): Bigger discount, limited career left (0.65x - 0.85x)
    const age = streamer.age ?? 25;
    let ageMultiplier = 1.0;
    if (age < 25) {
      ageMultiplier = 0.85 + (age - 18) * 0.02; // 0.85x at 18, 0.99x at 25
    } else if (age <= 34) {
      ageMultiplier = 1.0; // Peak value
    } else if (age <= 44) {
      ageMultiplier = 0.95 - (age - 35) * 0.01; // 0.95x at 35, 0.85x at 45
    } else {
      ageMultiplier = 0.85 - (age - 45) * 0.02; // 0.85x at 45, 0.65x at 55
      ageMultiplier = Math.max(0.55, ageMultiplier); // Floor at 0.55x
    }

    // Experience can offset age discount (veterans command respect)
    const expYears = streamer.experienceYears ?? 0;
    if (expYears >= 5 && age >= 35) {
      // Experienced veterans get some value back
      ageMultiplier += Math.min(expYears * 0.02, 0.2); // Up to +20% for 10+ years exp
    }

    const baseCost = followerValue + charismaValue + skillValue + consistencyValue + dramaAdjustment - loyaltyDiscount;
    return Math.floor(Math.max(500, baseCost * ambitionMultiplier * ageMultiplier));
  }
}
