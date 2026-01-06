import { CONFIG, GENRES, PLATFORMS, PlatformKey } from '../config';
import { WorldState, AIAgencyData, StreamerWorldData } from './WorldState';

/**
 * AI Agency decision-making logic
 * Handles weekly decisions for signing, dropping, and managing streamers
 */
class AIAgencyManagerClass {
  /**
   * Process all AI agency decisions for the week
   */
  processWeeklyDecisions(): void {
    const agencies = WorldState.getAIAgencies();

    for (const agency of agencies) {
      this.processAgencyDecisions(agency);
    }
  }

  /**
   * Process decisions for a single AI agency
   */
  private processAgencyDecisions(agency: AIAgencyData): void {
    // 1. Calculate weekly revenue
    this.calculateWeeklyRevenue(agency);

    // 2. Evaluate and potentially drop underperformers
    this.evaluateRoster(agency);

    // 3. Scout and sign new talent
    this.scoutAndSign(agency);
  }

  /**
   * Calculate weekly revenue for an agency
   * Uses formula comparable to player's getWeeklyStreamingRevenue()
   */
  private calculateWeeklyRevenue(agency: AIAgencyData): void {
    const roster = WorldState.getAgencyRoster(agency.id);
    let weeklyRevenue = 0;

    for (const streamer of roster) {
      // AI streamers assumed to stream ~30 hours/week on their primary platform
      const hoursPerWeek = CONFIG.HOURS_DEFAULT_PER_WEEK;
      const platformData = PLATFORMS[streamer.platform as PlatformKey];
      const genreData = GENRES[streamer.genre];

      // Base: $0.50 per 1k followers per hour (same as player)
      const baseRevenue = (streamer.followers / 1000) * hoursPerWeek * CONFIG.BASE_WEEKLY_REVENUE_PER_1K_FOLLOWERS_PER_HOUR;

      // Platform and genre multipliers
      const platformMult = platformData?.revenueMultiplier ?? 1.0;
      const genreMult = genreData?.baseRevenueMultiplier ?? 1.0;
      const affinityBonus = genreData?.platformAffinity?.[streamer.platform as PlatformKey] ?? 1.0;

      // Stat bonuses (simplified from player formula)
      const charismaBonus = 1 + (streamer.stats.charisma - 5) * 0.08;
      const skillBonus = 1 + (streamer.stats.skill - 5) * 0.06;

      // Burnout penalty
      const burnoutPenalty = 1 - (streamer.burnout / 100) * 0.3;

      const streamerRevenue = baseRevenue * platformMult * genreMult * affinityBonus * charismaBonus * skillBonus * burnoutPenalty;

      // Agency takes 50% cut
      weeklyRevenue += streamerRevenue * 0.5;
    }

    agency.weeklyRevenue = Math.floor(weeklyRevenue);
    agency.totalEarnings += agency.weeklyRevenue;
    agency.money += agency.weeklyRevenue;
  }

  /**
   * Evaluate roster and drop underperformers
   */
  private evaluateRoster(agency: AIAgencyData): void {
    const roster = WorldState.getAgencyRoster(agency.id);
    if (roster.length === 0) return;

    const streamersToDropIds: string[] = [];

    for (const streamer of roster) {
      if (this.shouldDropStreamer(streamer, agency, roster)) {
        streamersToDropIds.push(streamer.id);
      }
    }

    // Drop streamers
    for (const streamerId of streamersToDropIds) {
      WorldState.releaseStreamerFromAgency(streamerId);

      const streamer = WorldState.getStreamer(streamerId);
      if (streamer) {
        WorldState.addNewsEvent({
          type: 'signing',
          title: `${agency.name} releases ${streamer.name}`,
          description: `${streamer.name} is now a free agent.`,
          streamerId: streamer.id,
          agencyId: agency.id,
        });
      }
    }
  }

  /**
   * Determine if an agency should drop a streamer
   */
  private shouldDropStreamer(
    streamer: StreamerWorldData,
    agency: AIAgencyData,
    roster: StreamerWorldData[]
  ): boolean {
    // Calculate average roster followers
    const avgFollowers = roster.reduce((sum, s) => sum + s.followers, 0) / roster.length;

    switch (agency.strategy) {
      case 'aggressive':
        // Drop if below 40% of average or declining for 3+ weeks
        if (streamer.followers < avgFollowers * 0.4) return true;
        if (streamer.consecutiveDeclineWeeks >= 3) return Math.random() < 0.5;
        break;

      case 'conservative':
        // Only drop if declining for 6+ weeks or very low
        if (streamer.consecutiveDeclineWeeks >= 6) return Math.random() < 0.3;
        if (streamer.followers < avgFollowers * 0.2) return true;
        break;

      case 'niche':
        // Drop if not matching focus genre/platform
        if (agency.focusGenres.length > 0 && !agency.focusGenres.includes(streamer.genre)) {
          return Math.random() < 0.3;
        }
        break;

      case 'balanced':
        // Drop if declining for 4+ weeks
        if (streamer.consecutiveDeclineWeeks >= 4) return Math.random() < 0.4;
        break;
    }

    // Always consider dropping if high burnout
    if (streamer.burnout > 80) return Math.random() < 0.2;

    return false;
  }

  /**
   * Scout free agents and make signing decisions
   */
  private scoutAndSign(agency: AIAgencyData): void {
    // Check if agency has room
    const currentRoster = WorldState.getAgencyRoster(agency.id);
    if (currentRoster.length >= agency.maxRoster) return;

    // Get free agents
    const freeAgents = WorldState.getFreeAgents();
    if (freeAgents.length === 0) return;

    // Rank free agents for this agency
    const rankedProspects = this.rankProspectsForAgency(freeAgents, agency);

    // Try to sign top prospects
    const spotsOpen = agency.maxRoster - currentRoster.length;
    const signAttempts = Math.min(spotsOpen, 2); // Try to sign up to 2 per week

    for (let i = 0; i < signAttempts && i < rankedProspects.length; i++) {
      const prospect = rankedProspects[i];

      // Check if can afford (simplified - just check if has money)
      const signingCost = this.estimateSigningCost(prospect.streamer);
      if (agency.money < signingCost) continue;

      // Signing decision based on strategy
      if (this.wantsToSign(prospect, agency)) {
        // Sign the streamer
        WorldState.signStreamerToAgency(prospect.streamer.id, agency.id);
        agency.money -= signingCost;

        WorldState.addNewsEvent({
          type: 'signing',
          title: `${agency.name} signs ${prospect.streamer.name}`,
          description: `${prospect.streamer.name} joins ${agency.name}'s roster.`,
          streamerId: prospect.streamer.id,
          agencyId: agency.id,
        });
      }
    }
  }

  /**
   * Rank prospects based on agency preferences
   */
  private rankProspectsForAgency(
    freeAgents: StreamerWorldData[],
    agency: AIAgencyData
  ): { streamer: StreamerWorldData; score: number }[] {
    return freeAgents.map(streamer => {
      let score = 0;

      // Base score from followers
      score += Math.log10(Math.max(streamer.followers, 100)) * 10;

      // Genre fit
      if (agency.focusGenres.length > 0) {
        if (agency.focusGenres.includes(streamer.genre)) {
          score += 30;
        } else {
          score -= 10;
        }
      }

      // Platform fit
      if (agency.focusPlatforms.length > 0) {
        if (agency.focusPlatforms.includes(streamer.platform)) {
          score += 20;
        } else {
          score -= 5;
        }
      }

      // Stats bonus
      const avgStats = Object.values(streamer.stats).reduce((a, b) => a + b, 0) / 7;
      score += avgStats * 2;

      // Growth potential (inverse of burnout)
      score += (100 - streamer.burnout) / 10;

      // Recent growth bonus
      if (streamer.followers > streamer.lastWeekFollowers) {
        const growthRate = (streamer.followers - streamer.lastWeekFollowers) / streamer.lastWeekFollowers;
        score += growthRate * 50;
      }

      // Penalize if currently declining
      if (streamer.consecutiveDeclineWeeks > 0) {
        score -= streamer.consecutiveDeclineWeeks * 5;
      }

      return { streamer, score };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Estimate signing cost for a streamer
   * Uses formula comparable to player's Streamer.getSigningCost()
   */
  private estimateSigningCost(streamer: StreamerWorldData): number {
    // Base cost scales with followers
    const followerValue = streamer.followers / 100;

    // Core stats affect value (same as player formula)
    const charismaValue = streamer.stats.charisma * 80;
    const skillValue = streamer.stats.skill * 60;
    const consistencyValue = streamer.stats.consistency * 40;

    // Ambition increases demands
    const ambitionMultiplier = 1 + (streamer.stats.ambition - 5) * 0.15;

    // Low loyalty = flight risk discount
    const loyaltyDiscount = (10 - streamer.stats.loyalty) * 30;

    // Drama adjustment
    const dramaAdjustment = streamer.stats.dramaRisk > 7
      ? streamer.stats.dramaRisk * 20
      : -streamer.stats.dramaRisk * 30;

    // Age affects signing cost (same as player formula)
    const age = streamer.age ?? 25;
    let ageMultiplier = 1.0;
    if (age < 25) {
      ageMultiplier = 0.85 + (age - 18) * 0.02; // 0.85x at 18, 0.99x at 25
    } else if (age <= 34) {
      ageMultiplier = 1.0;
    } else if (age <= 44) {
      ageMultiplier = 0.95 - (age - 35) * 0.01;
    } else {
      ageMultiplier = 0.85 - (age - 45) * 0.02;
      ageMultiplier = Math.max(0.55, ageMultiplier);
    }

    // Experience offsets age discount for veterans
    const experienceYears = streamer.experienceYears ?? 0;
    const experienceBonus = Math.min(experienceYears * 0.03, 0.2);
    ageMultiplier = Math.min(1.0, ageMultiplier + experienceBonus);

    const baseCost = followerValue + charismaValue + skillValue + consistencyValue - loyaltyDiscount + dramaAdjustment;
    const cost = baseCost * ambitionMultiplier * ageMultiplier;

    return Math.floor(Math.max(500, Math.min(cost, 100000)));
  }

  /**
   * Determine if agency wants to sign a prospect
   */
  private wantsToSign(
    prospect: { streamer: StreamerWorldData; score: number },
    agency: AIAgencyData
  ): boolean {
    const { streamer, score } = prospect;

    // Minimum score threshold varies by strategy
    let minScore: number;
    switch (agency.strategy) {
      case 'aggressive':
        minScore = 20; // More willing to sign
        break;
      case 'conservative':
        minScore = 50; // Higher standards
        break;
      case 'niche':
        // Must match genre/platform focus
        if (agency.focusGenres.length > 0 && !agency.focusGenres.includes(streamer.genre)) {
          return false;
        }
        minScore = 30;
        break;
      case 'balanced':
      default:
        minScore = 35;
        break;
    }

    return score >= minScore;
  }
}

export const AIAgencyManager = new AIAgencyManagerClass();
