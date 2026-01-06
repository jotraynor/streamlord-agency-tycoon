import { PlatformKey } from '../config';

// Results for a single platform's performance
export interface PlatformWeeklyResult {
  platform: PlatformKey;
  hoursStreamed: number;
  viewsGenerated: number;           // Impressions/views
  newFollowers: number;             // Net follower change on this platform
  streamingRevenue: number;         // Revenue from streaming on this platform
}

// Sponsorship deal result
export interface SponsorshipResult {
  sponsorName: string;              // Generated sponsor name
  sponsorCategory: string;          // Category key (GAMING_HARDWARE, etc.)
  dealValue: number;                // Total sponsorship amount
  agencyCut: number;                // What agency keeps
  streamerCut: number;              // What streamer gets
}

// Complete weekly results for a streamer
export interface StreamerWeeklyResult {
  streamerId: string;
  streamerName: string;

  // Aggregate metrics
  totalViews: number;
  totalNewFollowers: number;
  followersBefore: number;
  followersAfter: number;

  // Revenue breakdown
  platformResults: PlatformWeeklyResult[];
  sponsorships: SponsorshipResult[];
  totalStreamingRevenue: number;
  totalSponsorshipRevenue: number;
  totalRevenue: number;
  agencyRevenue: number;            // Agency's cut of everything

  // Status changes
  burnoutBefore: number;
  burnoutAfter: number;
  burnoutChange: number;
  wasOnBreak: boolean;

  // Notable events (from EventSystem)
  events: string[];                 // Event descriptions that occurred
}

// Agency's complete weekly summary
export interface AgencyWeeklyResult {
  weekNumber: number;

  // Financial summary
  totalRevenue: number;
  streamingRevenue: number;
  sponsorshipRevenue: number;
  expenses: number;                 // Future: office costs, etc.
  netProfit: number;

  // Money tracking
  moneyBefore: number;
  moneyAfter: number;

  // Roster performance
  streamerResults: StreamerWeeklyResult[];

  // Contract notifications
  contractsExpired: string[];       // Streamer IDs whose contracts ended
  contractsExpiringSoon: string[];  // Streamer IDs expiring next week

  // World events and news
  worldNewsHighlights: string[];
}

// Helper to create an empty streamer result
export function createEmptyStreamerResult(
  streamerId: string,
  streamerName: string,
  currentFollowers: number,
  currentBurnout: number,
  wasOnBreak: boolean
): StreamerWeeklyResult {
  return {
    streamerId,
    streamerName,
    totalViews: 0,
    totalNewFollowers: 0,
    followersBefore: currentFollowers,
    followersAfter: currentFollowers,
    platformResults: [],
    sponsorships: [],
    totalStreamingRevenue: 0,
    totalSponsorshipRevenue: 0,
    totalRevenue: 0,
    agencyRevenue: 0,
    burnoutBefore: currentBurnout,
    burnoutAfter: currentBurnout,
    burnoutChange: 0,
    wasOnBreak,
    events: [],
  };
}

// Helper to create an empty agency result
export function createEmptyAgencyResult(weekNumber: number, currentMoney: number): AgencyWeeklyResult {
  return {
    weekNumber,
    totalRevenue: 0,
    streamingRevenue: 0,
    sponsorshipRevenue: 0,
    expenses: 0,
    netProfit: 0,
    moneyBefore: currentMoney,
    moneyAfter: currentMoney,
    streamerResults: [],
    contractsExpired: [],
    contractsExpiringSoon: [],
    worldNewsHighlights: [],
  };
}

// Format large numbers for display (e.g., 1.2M, 45K)
export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

// Format money for display
export function formatMoney(amount: number): string {
  if (amount < 0) {
    return '-$' + Math.abs(amount).toLocaleString();
  }
  return '$' + amount.toLocaleString();
}

// Format follower change with sign
export function formatFollowerChange(change: number): string {
  if (change > 0) {
    return '+' + formatNumber(change);
  } else if (change < 0) {
    return formatNumber(change);
  }
  return '0';
}
