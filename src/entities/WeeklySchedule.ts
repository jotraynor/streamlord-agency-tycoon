import { PlatformKey } from '../config';

// How a streamer's time is allocated across platforms
export interface PlatformAllocation {
  platform: PlatformKey;
  hoursPerWeek: number;      // 0-60, minimum 5 to be active on a platform
}

// Streamer's weekly configuration
export interface WeeklySchedule {
  streamerId: string;
  totalHoursPerWeek: number;           // 10-60 total hours
  platformAllocations: PlatformAllocation[];
  takingBreak: boolean;                // If true, no streaming this week (burnout recovery)
  sponsorshipOptIn: boolean;           // Whether accepting sponsors this week
}

// Default schedule for a new streamer
export function createDefaultSchedule(streamerId: string, primaryPlatform: PlatformKey): WeeklySchedule {
  return {
    streamerId,
    totalHoursPerWeek: 30,  // Moderate default
    platformAllocations: [
      { platform: primaryPlatform, hoursPerWeek: 30 }
    ],
    takingBreak: false,
    sponsorshipOptIn: true,
  };
}

// Validate and normalize a schedule
export function validateSchedule(schedule: WeeklySchedule): WeeklySchedule {
  // Clamp total hours
  const totalHours = Math.max(10, Math.min(60, schedule.totalHoursPerWeek));

  // Filter out allocations with less than 5 hours (too little to matter)
  const validAllocations = schedule.platformAllocations.filter(a => a.hoursPerWeek >= 5);

  // Calculate current total from allocations
  const allocationTotal = validAllocations.reduce((sum, a) => sum + a.hoursPerWeek, 0);

  // If allocations don't match total, scale them proportionally
  let normalizedAllocations = validAllocations;
  if (allocationTotal !== totalHours && allocationTotal > 0) {
    const scale = totalHours / allocationTotal;
    normalizedAllocations = validAllocations.map(a => ({
      ...a,
      hoursPerWeek: Math.round(a.hoursPerWeek * scale)
    }));
  }

  return {
    ...schedule,
    totalHoursPerWeek: totalHours,
    platformAllocations: normalizedAllocations,
  };
}

// Serialize schedule for save data
export function serializeSchedule(schedule: WeeklySchedule): object {
  return {
    streamerId: schedule.streamerId,
    totalHoursPerWeek: schedule.totalHoursPerWeek,
    platformAllocations: schedule.platformAllocations.map(a => ({
      platform: a.platform,
      hoursPerWeek: a.hoursPerWeek,
    })),
    takingBreak: schedule.takingBreak,
    sponsorshipOptIn: schedule.sponsorshipOptIn,
  };
}

// Deserialize schedule from save data
export function deserializeSchedule(data: unknown, streamerId: string, fallbackPlatform: PlatformKey): WeeklySchedule {
  if (!data || typeof data !== 'object') {
    return createDefaultSchedule(streamerId, fallbackPlatform);
  }

  const obj = data as Record<string, unknown>;

  return {
    streamerId: String(obj.streamerId || streamerId),
    totalHoursPerWeek: typeof obj.totalHoursPerWeek === 'number' ? obj.totalHoursPerWeek : 30,
    platformAllocations: Array.isArray(obj.platformAllocations)
      ? obj.platformAllocations.map((a: unknown) => {
          const alloc = a as Record<string, unknown>;
          return {
            platform: String(alloc.platform || fallbackPlatform) as PlatformKey,
            hoursPerWeek: typeof alloc.hoursPerWeek === 'number' ? alloc.hoursPerWeek : 30,
          };
        })
      : [{ platform: fallbackPlatform, hoursPerWeek: 30 }],
    takingBreak: Boolean(obj.takingBreak),
    sponsorshipOptIn: obj.sponsorshipOptIn !== false, // Default to true
  };
}
