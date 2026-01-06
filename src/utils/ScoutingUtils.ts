import { SCOUTING_TIERS, PLATFORMS, GENRES, PlatformKey, GenreKey } from '../config';
import { StreamerStats } from '../entities/Streamer';

export interface VisibleStat {
  display: string;
  min: number | null;
  max: number | null;
  exact: boolean;
}

export interface VisibleStats {
  // Core stats
  charisma: VisibleStat;
  consistency: { display: string; value: number; exact: boolean };
  dramaRisk: VisibleStat;
  // New stats
  skill: VisibleStat;
  adaptability: VisibleStat;
  loyalty: VisibleStat;
  ambition: VisibleStat;
}

/**
 * Get the scouting tier for a given level
 */
export function getScoutingTier(level: number) {
  return Object.values(SCOUTING_TIERS).find(t => t.level === level) ?? SCOUTING_TIERS.NOVICE;
}

/**
 * Format a stat value with uncertainty based on scouting range
 * @param actualValue The real stat value (1-10)
 * @param range The scouting range (null = ???, 0 = exact, 4 = ±2, 2 = ±1)
 */
function formatStatWithRange(actualValue: number, range: number | null): { display: string; min: number | null; max: number | null; exact: boolean } {
  if (range === null) {
    return { display: '???', min: null, max: null, exact: false };
  }

  if (range === 0) {
    return { display: actualValue.toString(), min: actualValue, max: actualValue, exact: true };
  }

  // Calculate visible range (±range/2)
  const halfRange = Math.floor(range / 2);
  const min = Math.max(1, actualValue - halfRange);
  const max = Math.min(10, actualValue + halfRange);

  return { display: `${min}-${max}`, min, max, exact: false };
}

/**
 * Get visible stats for a streamer based on scouting level
 * - Consistency is always visible (can be observed from stream schedule)
 * - Other stats are hidden/ranged based on scouting tier
 */
export function getVisibleStats(stats: StreamerStats, scoutingLevel: number): VisibleStats {
  const tier = getScoutingTier(scoutingLevel);

  return {
    // Core stats
    charisma: formatStatWithRange(stats.charisma, tier.charismaRange),
    consistency: { display: stats.consistency.toString(), value: stats.consistency, exact: true },
    dramaRisk: formatStatWithRange(stats.dramaRisk, tier.dramaRange),
    // New stats
    skill: formatStatWithRange(stats.skill, tier.skillRange),
    adaptability: formatStatWithRange(stats.adaptability, tier.adaptabilityRange),
    loyalty: formatStatWithRange(stats.loyalty, tier.loyaltyRange),
    ambition: formatStatWithRange(stats.ambition, tier.ambitionRange),
  };
}

/**
 * Generate a stat bar width based on visible stats
 * For uncertain ranges, shows the midpoint of the range
 */
export function getStatBarWidth(stat: { min: number | null; max: number | null; exact: boolean }): number {
  if (stat.min === null || stat.max === null) {
    return 50; // Default to middle for unknown
  }
  const midpoint = (stat.min + stat.max) / 2;
  return midpoint * 10;
}

/**
 * Check if a stat is hidden (shows as ???)
 */
export function isStatHidden(stat: { display: string }): boolean {
  return stat.display === '???';
}

/**
 * Helper to get the estimated value for a stat based on visibility
 */
function getEstimatedStatValue(actualValue: number, range: number | null): { value: number; isExact: boolean } {
  if (range === null) {
    return { value: 5, isExact: false }; // Assume average
  }
  if (range === 0) {
    return { value: actualValue, isExact: true };
  }
  // Use midpoint of visible range
  const halfRange = Math.floor(range / 2);
  const min = Math.max(1, actualValue - halfRange);
  const max = Math.min(10, actualValue + halfRange);
  return { value: (min + max) / 2, isExact: false };
}

/**
 * Estimate daily revenue based on what the player can see at their scouting level.
 * Uses visible stat information only, with averages for hidden stats.
 */
export function getEstimatedRevenue(
  followers: number,
  stats: StreamerStats,
  platform: PlatformKey,
  genre: GenreKey,
  revenueSplit: number,
  scoutingLevel: number,
  burnout: number = 0
): { estimate: number; isExact: boolean } {
  const tier = getScoutingTier(scoutingLevel);
  const platformData = PLATFORMS[platform];
  const genreData = GENRES[genre];

  // Base revenue from followers
  const baseRevenue = (followers / 1000) * 2;

  // Get estimated stat values based on visibility
  const charisma = getEstimatedStatValue(stats.charisma, tier.charismaRange);
  const skill = getEstimatedStatValue(stats.skill, tier.skillRange);

  // Consistency is always visible
  const consistencyBonus = 1 + (stats.consistency - 5) * 0.05;

  // Calculate bonuses from estimated stats
  const charismaBonus = 1 + (charisma.value - 5) * 0.1;
  const skillBonus = 1 + (skill.value - 5) * 0.08;

  // Genre and platform affinity (always known)
  const genreMultiplier = genreData.baseRevenueMultiplier;
  const affinityBonus = genreData.platformAffinity[platform] || 1.0;

  // Burnout penalty (visible as it affects current performance)
  const burnoutPenalty = 1 - (burnout / 100) * 0.3;

  const estimate = Math.floor(
    baseRevenue *
    platformData.revenueMultiplier *
    genreMultiplier *
    affinityBonus *
    charismaBonus *
    consistencyBonus *
    skillBonus *
    burnoutPenalty *
    revenueSplit
  );

  // Is exact only if all revenue-affecting stats are exactly known
  const isExact = charisma.isExact && skill.isExact;

  return { estimate, isExact };
}
