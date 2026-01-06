import Phaser from 'phaser';
import { GameManager } from '../core/GameManager';
import { EventBus, EVENTS } from '../core/EventBus';
import { DOMOverlay } from '../ui/DOMOverlay';
import { EventSystem } from '../systems/EventSystem';
import { Streamer } from '../entities/Streamer';
import { Contract, ContractTerms, NegotiationState } from '../entities/Contract';
import { PlatformKey } from '../config';
import { WeeklySchedule } from '../entities/WeeklySchedule';

export class OfficeScene extends Phaser.Scene {
  private boundRenderUI = this.renderUI.bind(this);
  private boundHandleGameOver = (...args: unknown[]) => this.handleGameOver(args[0] as string);

  // Pending notifications queue
  private pendingExpirations: Streamer[] = [];
  private pendingWarnings: Streamer[] = [];
  private pendingPlatformUnlocks: string[] = [];
  private renewalState: {
    streamer: Streamer;
    negotiation: NegotiationState;
  } | null = null;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create(): void {
    this.pendingExpirations = [];
    this.pendingWarnings = [];
    this.pendingPlatformUnlocks = [];
    this.renewalState = null;
    this.renderUI();

    // Subscribe to state changes
    EventBus.on(EVENTS.STATE_CHANGED, this.boundRenderUI);
    EventBus.on(EVENTS.GAME_OVER, this.boundHandleGameOver);
  }

  private renderUI(): void {
    DOMOverlay.clear();
    DOMOverlay.renderHUD();
    DOMOverlay.renderRosterPanel(
      () => this.goToScout(),
      (streamer) => this.showStreamerDetail(streamer)
    );
    DOMOverlay.renderWorldRankingsPanel();
    DOMOverlay.renderBottomBar(
      () => this.planWeek(),
      () => this.goToScout()
    );
  }

  private showStreamerDetail(streamer: Streamer): void {
    const unlockedPlatforms = GameManager.getUnlockedPlatforms();

    DOMOverlay.showStreamerDetail(
      streamer,
      unlockedPlatforms,
      (newPlatform: PlatformKey) => {
        GameManager.switchStreamerPlatform(streamer.id, newPlatform);
        this.renderUI();
      },
      () => {
        GameManager.dropStreamer(streamer.id);
        this.renderUI();
      },
      () => {
        this.renderUI();
      }
    );
  }

  private planWeek(): void {
    const roster = GameManager.getRoster();
    const schedules = GameManager.getAllSchedules();
    const unlockedPlatforms = GameManager.getUnlockedPlatforms();

    // Show pre-week setup modal
    DOMOverlay.showPreWeekSetup(
      roster,
      schedules,
      unlockedPlatforms,
      (confirmedSchedules: Map<string, WeeklySchedule>) => {
        // Update schedules in GameManager
        for (const [streamerId, schedule] of confirmedSchedules) {
          GameManager.setStreamerSchedule(streamerId, schedule);
        }

        // Run the weekly simulation
        const result = GameManager.advanceWeek();

        // Check for bankruptcy
        if (GameManager.getAgency().isBankrupt()) {
          return; // Game over will be triggered via event
        }

        // Show weekly results modal
        DOMOverlay.showWeeklyAgencyResults(result, () => {
          // Queue up contract notifications
          // Find streamers by ID for expired/expiring contracts
          const currentRoster = GameManager.getRoster();
          this.pendingExpirations = result.contractsExpired
            .map(id => currentRoster.find(s => s.id === id))
            .filter((s): s is Streamer => s !== undefined);
          this.pendingWarnings = result.contractsExpiringSoon
            .map(id => currentRoster.find(s => s.id === id))
            .filter((s): s is Streamer => s !== undefined);

          // Process notifications and events
          this.processNotificationsAndEvents();
        });
      }
    );
  }

  private processNotificationsAndEvents(): void {
    // Process notifications in order: platform unlocks first, then warnings, then expirations, then random events
    this.processNextNotification(() => {
      // After all notifications, check for random event
      const roster = GameManager.getRoster();
      // Only pick from streamers with active contracts
      const activeRoster = roster.filter(s => s.contractEndDay > GameManager.getCurrentDay());

      if (activeRoster.length === 0) {
        this.renderUI();
        return;
      }

      const targetStreamer = activeRoster[Math.floor(Math.random() * activeRoster.length)];

      // Roll for event, filtering by the target streamer's platform, genre, and stats
      const event = EventSystem.rollForEvent(targetStreamer.platform, targetStreamer);
      if (event) {
        DOMOverlay.showEventModal(event, targetStreamer, (choice) => {
          const choiceResult = EventSystem.applyChoice(choice, targetStreamer.id);
          // Show stat check result if there was one
          DOMOverlay.showStatCheckResult(choiceResult, targetStreamer, () => {
            this.renderUI();
          });
        });
      } else {
        this.renderUI();
      }
    });
  }

  private processNextNotification(onComplete: () => void): void {
    // First process platform unlocks
    if (this.pendingPlatformUnlocks.length > 0) {
      const platform = this.pendingPlatformUnlocks.shift()!;
      DOMOverlay.showPlatformUnlocked(platform, () => {
        this.processNextNotification(onComplete);
      });
      return;
    }

    // Then process warnings (1 week notice)
    if (this.pendingWarnings.length > 0) {
      const streamer = this.pendingWarnings.shift()!;
      DOMOverlay.showContractExpiringSoon(streamer, 1, () => {
        this.processNextNotification(onComplete);
      }, true); // isWeeks = true
      return;
    }

    // Then process expirations
    if (this.pendingExpirations.length > 0) {
      const streamer = this.pendingExpirations.shift()!;
      DOMOverlay.showContractExpired(
        streamer,
        () => this.startRenewal(streamer, onComplete),
        () => this.letStreamerGo(streamer, onComplete)
      );
      return;
    }

    // All done
    onComplete();
  }

  private startRenewal(streamer: Streamer, onComplete: () => void): void {
    // Generate renewal expectations (they might want more now that they're established)
    const expectations = Contract.generateExpectations(
      streamer.followers,
      streamer.stats.charisma,
      streamer.stats.consistency
    );

    // Established streamers want slightly better terms
    expectations.signingBonus = Math.floor(expectations.signingBonus * 0.5); // Lower signing bonus for renewals
    expectations.revenueSplit = Math.max(0.2, expectations.revenueSplit - 0.05); // They want slightly more

    const initialOffer: ContractTerms = {
      signingBonus: Math.floor(expectations.signingBonus * 0.8),
      revenueSplit: streamer.revenueSplit, // Start with current split
      lengthDays: 60,
      exclusivity: true,
    };

    this.renewalState = {
      streamer,
      negotiation: {
        round: 1,
        maxRounds: 3, // Fewer rounds for renewals
        streamerMood: 'neutral',
        currentOffer: initialOffer,
        streamerExpectations: expectations,
        lastCounterOffer: null,
      },
    };

    this.renderRenewalNegotiation(onComplete);
  }

  private renderRenewalNegotiation(onComplete: () => void): void {
    if (!this.renewalState) return;

    DOMOverlay.renderNegotiation(
      this.renewalState.streamer,
      this.renewalState.negotiation,
      (terms) => this.makeRenewalOffer(terms, onComplete),
      () => this.letStreamerGo(this.renewalState!.streamer, onComplete)
    );
  }

  private makeRenewalOffer(terms: ContractTerms, onComplete: () => void): void {
    if (!this.renewalState) return;

    const { streamer, negotiation } = this.renewalState;

    // Check if player can afford
    if (terms.signingBonus > GameManager.getMoney()) {
      this.renderRenewalNegotiation(onComplete);
      return;
    }

    // Evaluate the offer
    const score = Contract.evaluateOffer(terms, negotiation.streamerExpectations);
    const mood = Contract.getMood(score);
    negotiation.streamerMood = mood;
    negotiation.currentOffer = terms;

    // Check if they walk
    if (Contract.willWalk(score, negotiation.round)) {
      const message = Contract.getResponseText(false, true, mood, streamer.name);
      DOMOverlay.showNegotiationResult(false, true, true, message, () => {
        this.letStreamerGo(streamer, onComplete);
      });
      return;
    }

    // Check if they accept
    if (Contract.willAccept(score, negotiation.round)) {
      const message = `${streamer.name} smiles. "Good to be staying with the team."`;
      DOMOverlay.showNegotiationResult(true, false, false, message, () => {
        this.signRenewal(terms, onComplete);
      });
      return;
    }

    // They counter-offer
    if (negotiation.round >= negotiation.maxRounds) {
      // Final round
      negotiation.lastCounterOffer = Contract.generateCounterOffer(terms, negotiation.streamerExpectations, negotiation.round);
      negotiation.currentOffer = negotiation.lastCounterOffer;
      negotiation.round++;
      this.renderRenewalNegotiation(onComplete);
      return;
    }

    // Generate counter-offer
    negotiation.lastCounterOffer = Contract.generateCounterOffer(terms, negotiation.streamerExpectations, negotiation.round);
    negotiation.round++;

    const message = Contract.getResponseText(false, false, mood, streamer.name);
    DOMOverlay.showNegotiationResult(false, false, false, message, () => {
      this.renderRenewalNegotiation(onComplete);
    });
  }

  private signRenewal(terms: ContractTerms, onComplete: () => void): void {
    if (!this.renewalState) return;

    const streamer = this.renewalState.streamer;

    // Apply new contract terms
    streamer.revenueSplit = terms.revenueSplit;
    streamer.contractEndDay = GameManager.getCurrentDay() + terms.lengthDays;

    // Deduct signing bonus
    GameManager.spendMoney(terms.signingBonus);
    GameManager.forceSave();

    this.renewalState = null;

    // Continue processing other notifications
    this.processNextNotification(onComplete);
  }

  private letStreamerGo(streamer: Streamer, onComplete: () => void): void {
    // Remove from roster and return to pool
    GameManager.dropStreamer(streamer.id);
    GameManager.getAgency().addToPool(streamer);
    GameManager.forceSave();

    DOMOverlay.showNegotiationResult(
      false,
      true,
      false,
      `${streamer.name} packs up their ring light and leaves. Best of luck to them.`,
      () => {
        this.renewalState = null;
        this.processNextNotification(onComplete);
      }
    );
  }

  private goToScout(): void {
    this.scene.start('ScoutScene');
  }

  private handleGameOver(reason: string): void {
    DOMOverlay.clear();
    DOMOverlay.showGameOver(reason);
  }

  shutdown(): void {
    EventBus.off(EVENTS.STATE_CHANGED, this.boundRenderUI);
    EventBus.off(EVENTS.GAME_OVER, this.boundHandleGameOver);
  }
}
