// Game constants
export const CONFIG = {
  // Starting conditions
  STARTING_MONEY: 10000,

  // Economy
  BASE_DAILY_REVENUE_PER_1K_FOLLOWERS: 2, // $2 per 1k followers per day (legacy)
  BASE_WEEKLY_REVENUE_PER_1K_FOLLOWERS_PER_HOUR: 0.5, // $0.50 per 1k followers per hour streamed

  // Bankruptcy
  DAYS_IN_DEBT_BEFORE_GAME_OVER: 7, // Legacy - kept for compatibility
  WEEKS_IN_DEBT_BEFORE_GAME_OVER: 3, // 3 weeks in debt = game over

  // Weekly Schedule System
  HOURS_MIN_PER_WEEK: 10,
  HOURS_MAX_PER_WEEK: 60,
  HOURS_DEFAULT_PER_WEEK: 30,
  HOURS_MIN_PER_PLATFORM: 5,          // Minimum hours to be active on a platform
  BURNOUT_HEAVY_THRESHOLD: 45,        // Above this = burnout increases faster
  BURNOUT_LIGHT_THRESHOLD: 15,        // Below this = burnout recovers
  BREAK_RECOVERY_RATE: 25,            // Burnout recovered per week on break
  WEEKLY_NATURAL_RECOVERY: 3,         // Base burnout recovery per week

  // Scouting
  SCOUT_PROSPECT_COUNT: 3,
  MIN_SIGNING_COST: 500,
  MAX_SIGNING_COST: 3000,

  // Events
  EVENT_CHANCE_PER_DAY: 0.3, // 30% chance of event each day (legacy)
  EVENT_CHANCE_PER_WEEK: 0.7, // 70% chance of event per streamer each week

  // Stat ranges
  STAT_MIN: 1,
  STAT_MAX: 10,

  // Follower generation
  MIN_STARTING_FOLLOWERS: 100,
  MAX_STARTING_FOLLOWERS: 50000,

  // Platform unlock thresholds
  YETUBE_UNLOCK_REVENUE: 50000,
  YETUBE_UNLOCK_ROSTER: 5,
  OHFANS_UNLOCK_REVENUE: 100000,

  // Streamer pool (legacy - now part of world system)
  INITIAL_POOL_SIZE: 50,
  POOL_REFRESH_INTERVAL: 7, // days
  POOL_REFRESH_COUNT: 2,

  // World simulation
  WORLD_STREAMER_COUNT: 500,        // Total streamers in the world
  AI_AGENCY_COUNT: 5,               // Competing AI agencies
  DAYS_PER_WEEK: 7,                 // Calendar week length
  WEEKLY_NEW_STREAMERS_BASE: 2,     // Base new streamers per week
  WEEKLY_NEW_STREAMERS_MAX: 5,      // Max with trend bonuses
  RETIREMENT_BURNOUT_THRESHOLD: 90, // Burnout level for retirement risk
  RETIREMENT_BURNOUT_WEEKS: 4,      // Consecutive weeks at high burnout
  COMEBACK_MIN_WEEKS: 20,           // Weeks retired before comeback possible
  COMEBACK_CHANCE: 0.05,            // 5% weekly comeback chance
  WEEKLY_SNAPSHOT_LIMIT: 52,        // Keep 1 year of history

  // Display
  GAME_WIDTH: 1280,
  GAME_HEIGHT: 720,
} as const;

// Platform definitions with unique mechanics (parody names)
export const PLATFORMS = {
  SWITCH: {
    id: 'switch',
    name: 'Switch',
    color: '#9146ff',
    revenueMultiplier: 1.0,
    growthMultiplier: 1.0,      // Standard growth
    volatility: 0.05,           // Medium volatility
    dramaMultiplier: 1.0,       // Standard drama
    description: 'The standard. Subs, bits, and raids.',
    unlockRequirement: null,    // Always unlocked
  },
  YETUBE: {
    id: 'yetube',
    name: 'YeTube',
    color: '#ff0000',
    revenueMultiplier: 1.3,     // Better ad revenue
    growthMultiplier: 1.5,      // Algorithm can boost hard
    volatility: 0.08,           // More volatile (algorithm giveth and taketh)
    dramaMultiplier: 0.7,       // Less drama (less live interaction)
    description: 'Better revenue, volatile growth. Algorithm is king.',
    unlockRequirement: { type: 'revenue', amount: 50000 },
  },
  OHFANS: {
    id: 'ohfans',
    name: 'OhFans',
    color: '#00aeef',
    revenueMultiplier: 2.5,     // Higher per-follower revenue (balanced from 3.0)
    growthMultiplier: 0.5,      // Slower organic growth
    volatility: 0.03,           // Very stable (subscription model)
    dramaMultiplier: 2.0,       // Double drama risk
    description: 'High revenue, slow growth, high drama. Handle with care.',
    unlockRequirement: { type: 'revenue', amount: 100000 },
  },
} as const;

// Scouting skill tiers - spend money to unlock stat visibility
// Range values: null = "???", 4 = ±2, 2 = ±1, 0 = exact
export const SCOUTING_TIERS = {
  NOVICE: {
    level: 0,
    name: 'Novice Scout',
    cost: 0,
    // Core stats
    charismaRange: null,
    dramaRange: null,
    // New stats - all hidden at novice
    skillRange: null,
    adaptabilityRange: null,
    loyaltyRange: null,
    ambitionRange: null,
    description: 'You can only judge streamers by their online presence.',
  },
  AMATEUR: {
    level: 1,
    name: 'Amateur Scout',
    cost: 2000,
    charismaRange: 4,
    dramaRange: 4,
    skillRange: 4,
    adaptabilityRange: null,  // Still hidden
    loyaltyRange: null,       // Still hidden
    ambitionRange: 4,
    description: 'Basic talent evaluation. Core stats visible with wide ranges.',
  },
  PROFESSIONAL: {
    level: 2,
    name: 'Professional Scout',
    cost: 8000,
    charismaRange: 2,
    dramaRange: 2,
    skillRange: 2,
    adaptabilityRange: 4,     // Now visible
    loyaltyRange: 4,          // Now visible
    ambitionRange: 2,
    description: 'Experienced eye. Most stats visible, tighter predictions.',
  },
  EXPERT: {
    level: 3,
    name: 'Expert Scout',
    cost: 25000,
    charismaRange: 0,
    dramaRange: 0,
    skillRange: 0,
    adaptabilityRange: 0,
    loyaltyRange: 0,
    ambitionRange: 0,
    description: 'Industry veteran. Perfect talent evaluation.',
  },
} as const;

export type ScoutingTierKey = keyof typeof SCOUTING_TIERS;

export type PlatformKey = keyof typeof PLATFORMS;

// Genre definitions with mechanical properties
export const GENRES = {
  GAMING: {
    id: 'gaming',
    name: 'Gaming',
    revenueStyle: 'steady',        // steady, volatile, high-ceiling, niche
    baseRevenueMultiplier: 1.0,
    growthRate: 1.0,               // multiplier on follower growth
    trendSensitivity: 1.2,         // how much trending games affect them
    sponsorValue: 1.0,             // sponsor deal quality
    platformAffinity: { SWITCH: 1.2, YETUBE: 1.0, OHFANS: 0.5 },
    description: 'Mainstream gaming content. Stable but competitive.',
  },
  VTUBER: {
    id: 'vtuber',
    name: 'VTuber',
    revenueStyle: 'high-ceiling',
    baseRevenueMultiplier: 1.1,
    growthRate: 0.7,               // slow start
    trendSensitivity: 0.5,         // less affected by trends
    sponsorValue: 1.3,             // good merch potential
    platformAffinity: { SWITCH: 1.3, YETUBE: 1.1, OHFANS: 0.8 },
    description: 'Avatar-based streaming. Slow growth but dedicated fans.',
  },
  IRL: {
    id: 'irl',
    name: 'IRL',
    revenueStyle: 'volatile',
    baseRevenueMultiplier: 0.9,
    growthRate: 1.4,               // fast growth potential
    trendSensitivity: 0.8,
    sponsorValue: 0.7,             // brands nervous about unpredictability
    platformAffinity: { SWITCH: 1.2, YETUBE: 0.8, OHFANS: 1.0 },
    description: 'Real life streaming. High growth, unpredictable.',
  },
  MUSIC: {
    id: 'music',
    name: 'Music',
    revenueStyle: 'steady',
    baseRevenueMultiplier: 0.8,
    growthRate: 0.6,               // slow organic growth
    trendSensitivity: 0.3,         // timeless content
    sponsorValue: 1.4,             // brands love musicians
    platformAffinity: { SWITCH: 0.8, YETUBE: 1.5, OHFANS: 0.6 },
    description: 'Music and covers. Slow growth but premium sponsors.',
  },
  ASMR: {
    id: 'asmr',
    name: 'ASMR',
    revenueStyle: 'niche',
    baseRevenueMultiplier: 1.2,
    growthRate: 0.5,               // very slow growth
    trendSensitivity: 0.2,         // immune to trends
    sponsorValue: 0.8,
    platformAffinity: { SWITCH: 0.7, YETUBE: 1.0, OHFANS: 1.8 },
    description: 'Niche but loyal audience. Very stable revenue.',
  },
  REACTION: {
    id: 'reaction',
    name: 'Reaction',
    revenueStyle: 'volatile',
    baseRevenueMultiplier: 1.0,
    growthRate: 1.6,               // viral potential
    trendSensitivity: 1.8,         // heavily trend-dependent
    sponsorValue: 0.5,             // brands avoid controversy
    platformAffinity: { SWITCH: 0.9, YETUBE: 1.4, OHFANS: 0.4 },
    description: 'React content. Viral potential but trend-dependent.',
  },
  EDUCATIONAL: {
    id: 'educational',
    name: 'Educational',
    revenueStyle: 'steady',
    baseRevenueMultiplier: 0.7,
    growthRate: 0.4,               // very slow growth
    trendSensitivity: 0.1,         // evergreen content
    sponsorValue: 1.8,             // premium sponsors love edu content
    platformAffinity: { SWITCH: 0.5, YETUBE: 1.6, OHFANS: 0.3 },
    description: 'Educational content. Slow but premium sponsors.',
  },
  FITNESS: {
    id: 'fitness',
    name: 'Fitness',
    revenueStyle: 'steady',
    baseRevenueMultiplier: 1.0,
    growthRate: 0.9,
    trendSensitivity: 0.6,         // seasonal (new year, summer)
    sponsorValue: 1.6,             // fitness brands pay well
    platformAffinity: { SWITCH: 0.6, YETUBE: 1.3, OHFANS: 1.4 },
    description: 'Fitness content. Great sponsors, seasonal trends.',
  },
  CREATIVE: {
    id: 'creative',
    name: 'Creative',
    revenueStyle: 'niche',
    baseRevenueMultiplier: 0.8,
    growthRate: 0.5,
    trendSensitivity: 0.4,
    sponsorValue: 1.1,
    platformAffinity: { SWITCH: 1.1, YETUBE: 1.0, OHFANS: 1.2 },
    description: 'Art and creative streams. Dedicated niche audience.',
  },
  VARIETY: {
    id: 'variety',
    name: 'Variety',
    revenueStyle: 'steady',
    baseRevenueMultiplier: 0.9,
    growthRate: 1.1,
    trendSensitivity: 1.0,         // average trend sensitivity
    sponsorValue: 0.9,
    platformAffinity: { SWITCH: 1.0, YETUBE: 1.0, OHFANS: 0.8 },
    description: 'Jack of all trades. Flexible but less focused.',
  },
} as const;

export type GenreKey = keyof typeof GENRES;

// Legacy niche mapping for backwards compatibility
export const NICHES = Object.values(GENRES).map(g => g.name);

// Personality traits - earned through career events
export const TRAITS = {
  // Content Style
  WHOLESOME: {
    id: 'wholesome',
    name: 'Wholesome',
    category: 'content',
    opposite: 'EDGY',
    description: 'Family-friendly vibes. Better sponsors, lower drama.',
    effects: { sponsorBonus: 0.2, dramaReduction: 0.3 },
  },
  EDGY: {
    id: 'edgy',
    name: 'Edgy',
    category: 'content',
    opposite: 'WHOLESOME',
    description: 'Pushes boundaries. Higher drama but more viral potential.',
    effects: { viralBonus: 0.3, dramaIncrease: 0.4 },
  },
  FAMILY_FRIENDLY: {
    id: 'family_friendly',
    name: 'Family-Friendly',
    category: 'content',
    opposite: 'ADULT',
    description: 'Clean content. Premium sponsors, platform-safe.',
    effects: { sponsorBonus: 0.3, platformSafe: true },
  },
  ADULT: {
    id: 'adult',
    name: 'Adult',
    category: 'content',
    opposite: 'FAMILY_FRIENDLY',
    description: 'Mature content. Platform restricted but higher OhFans revenue.',
    effects: { ohfansBonus: 0.5, platformRestricted: true },
  },
  // Personality
  INTROVERT: {
    id: 'introvert',
    name: 'Introvert',
    category: 'personality',
    opposite: 'EXTROVERT',
    description: 'Solo content preferred. Collabs drain energy.',
    effects: { soloBonus: 0.2, collabPenalty: 0.3, burnoutFromCollabs: true },
  },
  EXTROVERT: {
    id: 'extrovert',
    name: 'Extrovert',
    category: 'personality',
    opposite: 'INTROVERT',
    description: 'Thrives with others. Collab bonuses.',
    effects: { collabBonus: 0.3, soloContentPenalty: 0.1 },
  },
  DIPLOMATIC: {
    id: 'diplomatic',
    name: 'Diplomatic',
    category: 'personality',
    opposite: 'HOT_HEADED',
    description: 'Handles controversy well. Drama resolves faster.',
    effects: { dramaResolution: 0.5, controversyResistance: 0.4 },
  },
  HOT_HEADED: {
    id: 'hot_headed',
    name: 'Hot-Headed',
    category: 'personality',
    opposite: 'DIPLOMATIC',
    description: 'Quick to anger. More drama but passionate fanbase.',
    effects: { dramaIncrease: 0.5, loyalFanBonus: 0.2 },
  },
  TRANSPARENT: {
    id: 'transparent',
    name: 'Transparent',
    category: 'personality',
    opposite: 'PRIVATE',
    description: 'Open book. Fans feel connected but vulnerable to leaks.',
    effects: { fanConnectionBonus: 0.3, leakRisk: 0.4 },
  },
  PRIVATE: {
    id: 'private',
    name: 'Private',
    category: 'personality',
    opposite: 'TRANSPARENT',
    description: 'Keeps personal life separate. Safe but less parasocial engagement.',
    effects: { leakResistance: 0.8, parasocialPenalty: 0.2 },
  },
  // Work Style
  COMPETITIVE: {
    id: 'competitive',
    name: 'Competitive',
    category: 'work',
    opposite: 'CASUAL',
    description: 'Tournament ready. Esports opportunities.',
    effects: { tournamentBonus: 0.5, rageClipRisk: 0.3 },
  },
  CASUAL: {
    id: 'casual',
    name: 'Casual',
    category: 'work',
    opposite: 'COMPETITIVE',
    description: 'Relaxed vibes. Steady but not explosive growth.',
    effects: { burnoutResistance: 0.3, growthPenalty: 0.1 },
  },
} as const;

export type TraitKey = keyof typeof TRAITS;

// Avatar colors for placeholder aesthetic
export const AVATAR_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#34495e', '#e91e63', '#00bcd4',
] as const;

// AI Agency definitions
export type AgencyStrategy = 'aggressive' | 'conservative' | 'niche' | 'balanced';

export const AI_AGENCIES = {
  TITAN_TALENT: {
    id: 'titan_talent',
    name: 'Titan Talent',
    strategy: 'aggressive' as AgencyStrategy,
    focusGenres: ['GAMING', 'VTUBER'] as GenreKey[],
    focusPlatforms: ['SWITCH', 'YETUBE'] as PlatformKey[],
    color: '#e74c3c',
    maxRoster: 8,
    startingMoney: 50000,
  },
  NOVA_MANAGEMENT: {
    id: 'nova_management',
    name: 'Nova Management',
    strategy: 'balanced' as AgencyStrategy,
    focusGenres: [] as GenreKey[], // All genres
    focusPlatforms: [] as PlatformKey[], // All platforms
    color: '#3498db',
    maxRoster: 6,
    startingMoney: 40000,
  },
  PULSE_MEDIA: {
    id: 'pulse_media',
    name: 'Pulse Media',
    strategy: 'niche' as AgencyStrategy,
    focusGenres: ['MUSIC', 'ASMR', 'CREATIVE'] as GenreKey[],
    focusPlatforms: ['YETUBE', 'OHFANS'] as PlatformKey[],
    color: '#9b59b6',
    maxRoster: 5,
    startingMoney: 35000,
  },
  VERTEX_AGENCY: {
    id: 'vertex_agency',
    name: 'Vertex Agency',
    strategy: 'conservative' as AgencyStrategy,
    focusGenres: ['IRL', 'FITNESS', 'EDUCATIONAL'] as GenreKey[],
    focusPlatforms: ['YETUBE'] as PlatformKey[],
    color: '#2ecc71',
    maxRoster: 4,
    startingMoney: 45000,
  },
  SHADOW_COLLECTIVE: {
    id: 'shadow_collective',
    name: 'Shadow Collective',
    strategy: 'aggressive' as AgencyStrategy,
    focusGenres: ['REACTION', 'VARIETY'] as GenreKey[],
    focusPlatforms: ['OHFANS', 'SWITCH'] as PlatformKey[],
    color: '#34495e',
    maxRoster: 8,
    startingMoney: 55000,
  },
} as const;

export type AIAgencyKey = keyof typeof AI_AGENCIES;
