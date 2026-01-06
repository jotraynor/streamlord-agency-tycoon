// Contract terms and negotiation logic

export interface ContractTerms {
  signingBonus: number;      // Upfront cost to agency
  revenueSplit: number;      // Agency's cut (0.2 - 0.6)
  lengthDays: number;        // Contract duration
  exclusivity: boolean;      // Can they stream on other platforms?
}

export interface NegotiationState {
  round: number;
  maxRounds: number;
  streamerMood: 'eager' | 'neutral' | 'hesitant' | 'insulted';
  currentOffer: ContractTerms;
  streamerExpectations: ContractTerms;
  lastCounterOffer: ContractTerms | null;
}

export class Contract {
  // Generate what a streamer expects based on their stats
  static generateExpectations(
    followers: number,
    charisma: number,
    consistency: number
  ): ContractTerms {
    // Base signing bonus scales with followers
    const baseBonus = Math.floor(followers / 50) + 200;

    // High charisma streamers want more money
    const charismaMultiplier = 1 + (charisma - 5) * 0.1;

    // They want a bigger cut if they're good
    const statAvg = (charisma + consistency) / 2;
    const desiredAgencyCut = Math.max(0.2, Math.min(0.5, 0.5 - (statAvg - 5) * 0.03));

    // Better streamers want shorter contracts (more flexibility)
    const baseDays = statAvg > 7 ? 30 : statAvg > 4 ? 60 : 90;

    return {
      signingBonus: Math.floor(baseBonus * charismaMultiplier),
      revenueSplit: Math.round(desiredAgencyCut * 100) / 100,
      lengthDays: baseDays,
      exclusivity: followers < 10000, // Small streamers accept exclusivity
    };
  }

  // Calculate how good a deal is for the streamer (0-100)
  static evaluateOffer(offer: ContractTerms, expectations: ContractTerms): number {
    let score = 50; // Neutral starting point

    // Signing bonus comparison (they want more)
    const bonusDiff = (offer.signingBonus - expectations.signingBonus) / expectations.signingBonus;
    score += bonusDiff * 30; // +/- 30 points based on bonus

    // Revenue split comparison (lower agency cut = better for them)
    const splitDiff = (expectations.revenueSplit - offer.revenueSplit) * 100;
    score += splitDiff * 2; // Each 1% in their favor = 2 points

    // Contract length (they prefer shorter)
    const lengthDiff = (expectations.lengthDays - offer.lengthDays) / expectations.lengthDays;
    score += lengthDiff * 15;

    // Exclusivity (they prefer non-exclusive)
    if (!expectations.exclusivity && offer.exclusivity) {
      score -= 15; // Penalty for forcing exclusivity
    } else if (expectations.exclusivity && !offer.exclusivity) {
      score += 10; // Bonus for not requiring it
    }

    return Math.max(0, Math.min(100, score));
  }

  // Determine mood based on offer score
  static getMood(score: number): NegotiationState['streamerMood'] {
    if (score >= 70) return 'eager';
    if (score >= 45) return 'neutral';
    if (score >= 25) return 'hesitant';
    return 'insulted';
  }

  // Will they accept this offer?
  static willAccept(score: number, round: number): boolean {
    // More likely to accept in later rounds (they get impatient too)
    const roundBonus = round * 5;
    const threshold = 55 - roundBonus;
    return score >= threshold;
  }

  // Will they walk away?
  static willWalk(score: number, round: number): boolean {
    // Very bad offers make them leave
    // More tolerant in early rounds
    if (round === 1 && score < 15) return true;
    if (round === 2 && score < 20) return true;
    if (round >= 3 && score < 30) return true;
    return false;
  }

  // Generate a counter-offer from the streamer
  static generateCounterOffer(
    currentOffer: ContractTerms,
    expectations: ContractTerms,
    round: number
  ): ContractTerms {
    // They move toward middle ground but favor themselves
    const blend = 0.3 + round * 0.1; // More willing to compromise each round

    return {
      signingBonus: Math.floor(
        currentOffer.signingBonus * blend + expectations.signingBonus * (1 - blend) * 1.1
      ),
      revenueSplit: Math.round(
        (currentOffer.revenueSplit * blend + expectations.revenueSplit * (1 - blend) * 0.95) * 100
      ) / 100,
      lengthDays: Math.floor(
        currentOffer.lengthDays * blend + expectations.lengthDays * (1 - blend)
      ),
      exclusivity: round > 2 ? currentOffer.exclusivity : expectations.exclusivity,
    };
  }

  // Get flavor text for mood
  static getMoodText(mood: NegotiationState['streamerMood'], name: string): string {
    switch (mood) {
      case 'eager':
        return `${name} is nodding enthusiastically. They like where this is going.`;
      case 'neutral':
        return `${name} is considering the offer. Their expression reveals nothing.`;
      case 'hesitant':
        return `${name} is frowning slightly. This might need some work.`;
      case 'insulted':
        return `${name} looks like they're about to leave. Tread carefully.`;
    }
  }

  // Get response text for different outcomes
  static getResponseText(
    accepted: boolean,
    walked: boolean,
    mood: NegotiationState['streamerMood'],
    name: string
  ): string {
    if (walked) {
      return `${name} stands up. "I don't think this is going to work out." They leave.`;
    }
    if (accepted) {
      switch (mood) {
        case 'eager':
          return `${name} grins and extends their hand. "You've got yourself a streamer."`;
        case 'neutral':
          return `${name} nods. "Alright, let's do it." They sign the contract.`;
        case 'hesitant':
          return `${name} sighs. "Fine. But I expect results." They sign reluctantly.`;
        default:
          return `${name} signs the contract.`;
      }
    }
    // Counter-offer
    switch (mood) {
      case 'neutral':
        return `${name} slides a paper across the table. "How about this instead?"`;
      case 'hesitant':
        return `${name} crosses their arms. "You're going to have to do better than that."`;
      case 'insulted':
        return `${name} scoffs. "Seriously? Here's what I actually need."`;
      default:
        return `${name} makes a counter-offer.`;
    }
  }
}
