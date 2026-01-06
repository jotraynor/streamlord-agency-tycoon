import Phaser from 'phaser';
import { GameManager } from '../core/GameManager';
import { DOMOverlay } from '../ui/DOMOverlay';
import { Streamer } from '../entities/Streamer';
import { Contract, ContractTerms, NegotiationState } from '../entities/Contract';
import { PlatformKey } from '../config';

export class ScoutScene extends Phaser.Scene {
  private prospects: Streamer[] = [];
  private currentProspect: Streamer | null = null;
  private negotiationState: NegotiationState | null = null;
  private selectedPlatform: PlatformKey = 'SWITCH';
  private unlockedPlatforms: string[] = [];

  constructor() {
    super({ key: 'ScoutScene' });
  }

  create(): void {
    // Get unlocked platforms
    this.unlockedPlatforms = GameManager.getUnlockedPlatforms();
    this.selectedPlatform = this.unlockedPlatforms[0] as PlatformKey;

    // Check for saved negotiation state
    const agency = GameManager.getAgency();
    const savedNegotiation = agency.activeNegotiation;

    if (savedNegotiation) {
      // Restore negotiation state
      this.selectedPlatform = savedNegotiation.platform;
      this.loadProspectsFromPool();

      // Find the streamer in the pool
      const streamer = this.prospects.find(p => p.id === savedNegotiation.streamerId);
      if (streamer) {
        this.currentProspect = streamer;
        this.negotiationState = savedNegotiation.negotiation;
        this.renderNegotiation();
        return;
      }
      // Streamer no longer in pool - clear saved state
      agency.activeNegotiation = null;
      GameManager.forceSave();
    }

    // Load prospects from the pool for selected platform
    this.loadProspectsFromPool();
    this.renderScoutView();
  }

  private loadProspectsFromPool(): void {
    const agency = GameManager.getAgency();
    // Get streamers from the pool for this platform
    this.prospects = agency.getAvailableStreamers(this.selectedPlatform);
  }

  private renderScoutView(): void {
    DOMOverlay.renderScoutViewWithPlatforms(
      this.prospects,
      this.unlockedPlatforms,
      this.selectedPlatform,
      (platform) => this.changePlatform(platform as PlatformKey),
      (streamer) => this.startNegotiation(streamer),
      () => this.goBack(),
      () => this.showSkillsPanel()
    );
  }

  private showSkillsPanel(): void {
    DOMOverlay.renderScoutingSkillPanel(
      () => {
        // Upgrade scouting skill
        const agency = GameManager.getAgency();
        if (agency.upgradeScoutingSkill()) {
          GameManager.forceSave();
        }
        // Re-render scout view with updated skill level
        this.renderScoutView();
      },
      () => {
        // Close and re-render scout view
        this.renderScoutView();
      }
    );
  }

  private changePlatform(platform: PlatformKey): void {
    this.selectedPlatform = platform;
    this.loadProspectsFromPool();
    this.renderScoutView();
  }

  private startNegotiation(streamer: Streamer): void {
    this.currentProspect = streamer;

    // Generate what they expect
    const expectations = Contract.generateExpectations(
      streamer.followers,
      streamer.stats.charisma,
      streamer.stats.consistency
    );

    // Start with a reasonable opening offer
    const initialOffer: ContractTerms = {
      signingBonus: Math.floor(expectations.signingBonus * 0.8),
      revenueSplit: Math.min(0.5, expectations.revenueSplit + 0.1),
      lengthDays: 60,
      exclusivity: expectations.exclusivity,
    };

    this.negotiationState = {
      round: 1,
      maxRounds: 4,
      streamerMood: 'neutral',
      currentOffer: initialOffer,
      streamerExpectations: expectations,
      lastCounterOffer: null,
    };

    // Save negotiation state for persistence
    this.saveNegotiationState();

    this.renderNegotiation();
  }

  private saveNegotiationState(): void {
    if (!this.currentProspect || !this.negotiationState) return;

    const agency = GameManager.getAgency();
    agency.activeNegotiation = {
      streamerId: this.currentProspect.id,
      platform: this.selectedPlatform,
      negotiation: this.negotiationState,
    };
    GameManager.forceSave();
  }

  private clearNegotiationState(): void {
    const agency = GameManager.getAgency();
    agency.activeNegotiation = null;
    GameManager.forceSave();
  }

  private renderNegotiation(): void {
    if (!this.currentProspect || !this.negotiationState) return;

    DOMOverlay.renderNegotiation(
      this.currentProspect,
      this.negotiationState,
      (terms) => this.makeOffer(terms),
      () => this.walkAway(false)
    );
  }

  private makeOffer(terms: ContractTerms): void {
    if (!this.currentProspect || !this.negotiationState) return;

    const streamer = this.currentProspect;
    const state = this.negotiationState;

    // Check if player can afford
    if (terms.signingBonus > GameManager.getMoney()) {
      // Can't afford - just re-render
      this.renderNegotiation();
      return;
    }

    // Evaluate the offer
    const score = Contract.evaluateOffer(terms, state.streamerExpectations);
    const mood = Contract.getMood(score);
    state.streamerMood = mood;
    state.currentOffer = terms;

    // Check if they walk
    if (Contract.willWalk(score, state.round)) {
      const message = Contract.getResponseText(false, true, mood, streamer.name);
      DOMOverlay.showNegotiationResult(false, true, true, message, () => {
        this.endNegotiation(false);
      });
      return;
    }

    // Check if they accept
    if (Contract.willAccept(score, state.round)) {
      const message = Contract.getResponseText(true, false, mood, streamer.name);
      DOMOverlay.showNegotiationResult(true, false, false, message, () => {
        this.signDeal(terms);
      });
      return;
    }

    // They counter-offer
    if (state.round >= state.maxRounds) {
      // Final round, they walk if not accepted
      state.lastCounterOffer = Contract.generateCounterOffer(terms, state.streamerExpectations, state.round);
      state.currentOffer = state.lastCounterOffer;
      state.round++;
      this.saveNegotiationState();
      this.renderNegotiation();
      return;
    }

    // Generate counter-offer
    state.lastCounterOffer = Contract.generateCounterOffer(terms, state.streamerExpectations, state.round);
    state.currentOffer = { ...terms }; // Keep player's last offer as base
    state.round++;

    // Save state before showing result
    this.saveNegotiationState();

    // Show response then continue negotiation
    const message = Contract.getResponseText(false, false, mood, streamer.name);
    DOMOverlay.showNegotiationResult(false, false, false, message, () => {
      this.renderNegotiation();
    });
  }

  private walkAway(streamerWalked: boolean): void {
    const message = streamerWalked
      ? `They weren't interested in your terms.`
      : `You decided to look elsewhere.`;

    DOMOverlay.showNegotiationResult(false, true, streamerWalked, message, () => {
      this.endNegotiation(false);
    });
  }

  private signDeal(terms: ContractTerms): void {
    if (!this.currentProspect) return;

    const streamer = this.currentProspect;
    const agency = GameManager.getAgency();

    // Apply contract terms to streamer
    streamer.revenueSplit = terms.revenueSplit;
    streamer.contractEndDay = GameManager.getCurrentDay() + terms.lengthDays;
    streamer.signedOnDay = GameManager.getCurrentDay();

    // Sign them (this deducts the signing bonus)
    GameManager.spendMoney(terms.signingBonus);

    // Remove from pool and add to roster
    agency.removeFromPool(streamer.id);
    agency.roster.push(streamer);
    GameManager.forceSave();

    this.endNegotiation(true);
  }

  private endNegotiation(signed: boolean): void {
    // Clear saved negotiation state
    this.clearNegotiationState();

    if (signed && this.currentProspect) {
      // Remove from prospects
      this.prospects = this.prospects.filter((p) => p.id !== this.currentProspect!.id);
    }

    this.currentProspect = null;
    this.negotiationState = null;

    if (this.prospects.length === 0) {
      this.goBack();
    } else {
      this.renderScoutView();
    }
  }

  private goBack(): void {
    this.scene.start('OfficeScene');
  }
}
