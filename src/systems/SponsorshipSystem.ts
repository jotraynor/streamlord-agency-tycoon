import { GENRES, GenreKey } from '../config';
import { Streamer } from '../entities/Streamer';
import { WeeklySchedule } from '../entities/WeeklySchedule';
import { SponsorshipResult } from '../entities/WeeklyResults';

// Sponsor categories with genre affinities and value calculations
export const SPONSOR_CATEGORIES = {
  GAMING_HARDWARE: {
    name: 'Gaming Hardware',
    brands: ['RazerBlade', 'LogiGear', 'SteelFrame', 'HyperTech', 'CorsairX'],
    genreAffinity: {
      GAMING: 1.5,
      VTUBER: 1.2,
      VARIETY: 1.0,
      REACTION: 0.8,
      IRL: 0.5,
      MUSIC: 0.3,
      ASMR: 0.4,
      EDUCATIONAL: 0.4,
      FITNESS: 0.2,
      CREATIVE: 0.6,
    } as Record<GenreKey, number>,
    baseValue: 500,
    followerMultiplier: 0.005,  // $5 per 1000 followers
  },
  ENERGY_DRINKS: {
    name: 'Energy Drinks',
    brands: ['GFuel', 'MonsterX', 'RedBull+', 'RockstarZ', 'BangEnergy'],
    genreAffinity: {
      GAMING: 1.3,
      FITNESS: 1.4,
      IRL: 1.0,
      REACTION: 0.9,
      VTUBER: 0.7,
      VARIETY: 0.8,
      MUSIC: 0.5,
      ASMR: 0.2,
      EDUCATIONAL: 0.3,
      CREATIVE: 0.4,
    } as Record<GenreKey, number>,
    baseValue: 400,
    followerMultiplier: 0.004,
  },
  FASHION: {
    name: 'Fashion & Apparel',
    brands: ['StreamWear', 'GamerThreads', 'VibeFit', 'NeonStyle', 'UrbanGlow'],
    genreAffinity: {
      IRL: 1.5,
      VTUBER: 1.2,
      FITNESS: 1.3,
      CREATIVE: 1.1,
      MUSIC: 1.0,
      VARIETY: 0.8,
      GAMING: 0.6,
      REACTION: 0.5,
      ASMR: 0.7,
      EDUCATIONAL: 0.4,
    } as Record<GenreKey, number>,
    baseValue: 600,
    followerMultiplier: 0.006,
  },
  FOOD_DELIVERY: {
    name: 'Food & Delivery',
    brands: ['DoorDash+', 'UberBites', 'GrubNow', 'PostMates2', 'Deliveroo+'],
    genreAffinity: {
      IRL: 1.3,
      VARIETY: 1.2,
      ASMR: 1.1,
      GAMING: 0.9,
      REACTION: 0.8,
      VTUBER: 0.7,
      MUSIC: 0.5,
      FITNESS: 0.3,
      EDUCATIONAL: 0.4,
      CREATIVE: 0.6,
    } as Record<GenreKey, number>,
    baseValue: 350,
    followerMultiplier: 0.003,
  },
  FINTECH: {
    name: 'FinTech & Apps',
    brands: ['CashFlow', 'VenmoPlus', 'CoinBase2', 'RobinHood+', 'PayPalX'],
    genreAffinity: {
      EDUCATIONAL: 1.5,
      GAMING: 0.8,
      REACTION: 1.0,
      VARIETY: 0.7,
      IRL: 0.6,
      VTUBER: 0.5,
      MUSIC: 0.4,
      ASMR: 0.3,
      FITNESS: 0.5,
      CREATIVE: 0.4,
    } as Record<GenreKey, number>,
    baseValue: 800,
    followerMultiplier: 0.008,
  },
  WELLNESS: {
    name: 'Wellness & Health',
    brands: ['CalmApp+', 'Headspace2', 'BetterHelp', 'NoomLife', 'MindfulMe'],
    genreAffinity: {
      ASMR: 1.6,
      FITNESS: 1.5,
      MUSIC: 1.2,
      IRL: 0.9,
      EDUCATIONAL: 0.8,
      CREATIVE: 0.7,
      VARIETY: 0.6,
      VTUBER: 0.5,
      GAMING: 0.3,
      REACTION: 0.2,
    } as Record<GenreKey, number>,
    baseValue: 450,
    followerMultiplier: 0.004,
  },
  MOBILE_GAMES: {
    name: 'Mobile Games',
    brands: ['RAID Shadow', 'RiseOfKings', 'StarWarsGO', 'AFK Arena2', 'GenshinX'],
    genreAffinity: {
      GAMING: 1.4,
      VARIETY: 1.2,
      REACTION: 1.0,
      VTUBER: 0.9,
      IRL: 0.6,
      MUSIC: 0.4,
      EDUCATIONAL: 0.3,
      ASMR: 0.2,
      FITNESS: 0.3,
      CREATIVE: 0.5,
    } as Record<GenreKey, number>,
    baseValue: 700,
    followerMultiplier: 0.007,
  },
  EDUCATION: {
    name: 'Education & Courses',
    brands: ['Skillshare+', 'MasterClass2', 'Udemy Pro', 'CourseraX', 'LinkedLearn'],
    genreAffinity: {
      EDUCATIONAL: 2.0,
      CREATIVE: 1.3,
      MUSIC: 1.2,
      VARIETY: 0.7,
      GAMING: 0.4,
      VTUBER: 0.5,
      IRL: 0.6,
      REACTION: 0.3,
      ASMR: 0.4,
      FITNESS: 0.8,
    } as Record<GenreKey, number>,
    baseValue: 500,
    followerMultiplier: 0.005,
  },
} as const;

export type SponsorCategoryKey = keyof typeof SPONSOR_CATEGORIES;

/**
 * Calculate the potential value of a sponsorship deal
 */
export function calculateSponsorshipValue(
  streamer: Streamer,
  categoryKey: SponsorCategoryKey
): number {
  const category = SPONSOR_CATEGORIES[categoryKey];
  const genreAffinity = category.genreAffinity[streamer.genre] || 0.5;

  // Base value + follower-scaled value
  let value = category.baseValue + (streamer.followers * category.followerMultiplier);

  // Genre affinity multiplier
  value *= genreAffinity;

  // Trait bonuses/penalties
  if (streamer.hasTrait('WHOLESOME')) {
    value *= 1.2; // Wholesome streamers get better sponsor deals
  }
  if (streamer.hasTrait('FAMILY_FRIENDLY')) {
    value *= 1.3; // Family-friendly is premium for brands
  }
  if (streamer.hasTrait('EDGY')) {
    value *= 0.8; // Edgy content makes brands nervous
  }
  if (streamer.hasTrait('ADULT')) {
    value *= 0.5; // Adult content severely limits sponsors
  }

  // Genre-specific sponsor value multiplier
  const genreData = GENRES[streamer.genre];
  value *= genreData.sponsorValue;

  return Math.floor(value);
}

/**
 * Generate a random sponsor brand name from a category
 */
function getRandomBrand(categoryKey: SponsorCategoryKey): string {
  const category = SPONSOR_CATEGORIES[categoryKey];
  return category.brands[Math.floor(Math.random() * category.brands.length)];
}

/**
 * Roll for sponsorships for a streamer's week
 * Returns array of sponsorship deals they received
 */
export function generateWeeklySponsors(
  streamer: Streamer,
  schedule: WeeklySchedule
): SponsorshipResult[] {
  const results: SponsorshipResult[] = [];

  // No sponsors if opted out or on break
  if (!schedule.sponsorshipOptIn || schedule.takingBreak) {
    return results;
  }

  // Base chance scales with followers and hours
  const followerFactor = Math.min(0.5, streamer.followers / 200000); // Cap at 0.5 for 200K+ followers
  const hoursFactor = Math.min(0.3, schedule.totalHoursPerWeek / 200); // Cap at 0.3 for 60hrs
  const baseChance = followerFactor + hoursFactor;

  // Try each sponsor category
  const categoryKeys = Object.keys(SPONSOR_CATEGORIES) as SponsorCategoryKey[];

  for (const categoryKey of categoryKeys) {
    const category = SPONSOR_CATEGORIES[categoryKey];
    const genreAffinity = category.genreAffinity[streamer.genre] || 0.5;

    // Chance modified by genre affinity
    const chance = baseChance * genreAffinity;

    // Roll for this sponsor category
    if (Math.random() < chance) {
      const dealValue = calculateSponsorshipValue(streamer, categoryKey);

      // Minimum deal value threshold
      if (dealValue < 100) continue;

      // Agency takes their cut
      const agencyCut = Math.floor(dealValue * streamer.revenueSplit);
      const streamerCut = dealValue - agencyCut;

      results.push({
        sponsorName: getRandomBrand(categoryKey),
        sponsorCategory: category.name,
        dealValue,
        agencyCut,
        streamerCut,
      });
    }
  }

  // Limit to max 3 sponsors per week (realism)
  if (results.length > 3) {
    // Keep the highest value deals
    results.sort((a, b) => b.dealValue - a.dealValue);
    results.splice(3);
  }

  return results;
}

/**
 * Get estimated weekly sponsorship revenue (for UI preview)
 * Returns expected agency cut
 */
export function getEstimatedSponsorshipRevenue(
  streamer: Streamer,
  schedule?: WeeklySchedule
): number {
  if (schedule && (!schedule.sponsorshipOptIn || schedule.takingBreak)) {
    return 0;
  }

  // Calculate expected value based on probabilities
  let expectedValue = 0;
  const categoryKeys = Object.keys(SPONSOR_CATEGORIES) as SponsorCategoryKey[];

  // Base chance (use default schedule if not provided)
  const hours = schedule?.totalHoursPerWeek || 30;
  const followerFactor = Math.min(0.5, streamer.followers / 200000);
  const hoursFactor = Math.min(0.3, hours / 200);
  const baseChance = followerFactor + hoursFactor;

  for (const categoryKey of categoryKeys) {
    const category = SPONSOR_CATEGORIES[categoryKey];
    const genreAffinity = category.genreAffinity[streamer.genre] || 0.5;
    const chance = baseChance * genreAffinity;

    // Expected value = chance * value
    const potentialValue = calculateSponsorshipValue(streamer, categoryKey);
    expectedValue += chance * potentialValue;
  }

  // Return agency's cut
  return Math.floor(expectedValue * streamer.revenueSplit);
}

/**
 * Get total sponsorship value from results
 */
export function getTotalSponsorshipValue(results: SponsorshipResult[]): {
  totalValue: number;
  agencyCut: number;
  streamerCut: number;
} {
  let totalValue = 0;
  let agencyCut = 0;
  let streamerCut = 0;

  for (const result of results) {
    totalValue += result.dealValue;
    agencyCut += result.agencyCut;
    streamerCut += result.streamerCut;
  }

  return { totalValue, agencyCut, streamerCut };
}
