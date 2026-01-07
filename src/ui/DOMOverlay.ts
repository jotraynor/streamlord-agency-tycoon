import { GameManager } from '../core/GameManager';
import { Streamer } from '../entities/Streamer';
import { Contract, ContractTerms, NegotiationState } from '../entities/Contract';
import { CONFIG, PLATFORMS, PlatformKey, TRAITS } from '../config';
import { GameEvent, EventChoice, ChoiceResult } from '../systems/EventSystem';
import { getVisibleStats, isStatHidden, getStatBarWidth, getEstimatedRevenue } from '../utils/ScoutingUtils';
import { WorldState, NewsEvent } from '../world/WorldState';
import { WeeklySimulationResult } from '../world/WorldSimulator';
import { WeeklySchedule, createDefaultSchedule } from '../entities/WeeklySchedule';
import { AgencyWeeklyResult, StreamerWeeklyResult } from '../entities/WeeklyResults';
import { getEstimatedSponsorshipRevenue } from '../systems/SponsorshipSystem';

// Component cache for incremental updates
interface CachedComponent {
  element: HTMLElement;
  hash: string;
}

class DOMOverlayClass {
  private container: HTMLElement | null = null;
  private static readonly MODAL_EXIT_DURATION = 200; // ms, matches CSS animation

  // Component cache for incremental rendering
  private componentCache: Map<string, CachedComponent> = new Map();

  init(): void {
    this.container = document.getElementById('ui-overlay');
    if (!this.container) {
      console.error('UI overlay container not found');
      return;
    }
  }

  /**
   * Clear all components (for full re-render or scene transitions)
   */
  clear(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.componentCache.clear();
  }

  /**
   * Check if component needs update based on hash
   */
  private needsUpdate(id: string, newHash: string): boolean {
    const cached = this.componentCache.get(id);
    if (!cached) return true;
    return cached.hash !== newHash;
  }

  /**
   * Update component hash after render
   */
  private updateComponentHash(id: string, hash: string): void {
    const cached = this.componentCache.get(id);
    if (cached) {
      cached.hash = hash;
    }
  }

  /**
   * Generate a simple hash for dirty checking
   */
  private simpleHash(data: unknown): string {
    return JSON.stringify(data);
  }

  // Animated modal close helper
  private closeModalWithAnimation(backdrop: HTMLElement, callback?: () => void): void {
    backdrop.classList.add('modal-exit');
    setTimeout(() => {
      backdrop.remove();
      if (callback) callback();
    }, DOMOverlayClass.MODAL_EXIT_DURATION);
  }

  // Confetti celebration effect - runs async to not block UI
  private showConfetti(): void {
    if (!this.container) return;

    // Defer confetti creation to next frame so button is immediately clickable
    requestAnimationFrame(() => {
      const confettiContainer = document.createElement('div');
      confettiContainer.className = 'confetti-container';

      const colors = ['#f39c12', '#2ecc71', '#e74c3c', '#4a90d9', '#9b59b6', '#1abc9c'];
      const pieceCount = 30; // Reduced from 50

      for (let i = 0; i < pieceCount; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = `${Math.random() * 0.3}s`;
        piece.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;

        if (Math.random() > 0.5) {
          piece.style.borderRadius = '50%';
        }

        confettiContainer.appendChild(piece);
      }

      this.container?.appendChild(confettiContainer);
      setTimeout(() => confettiContainer.remove(), 3000);
    });
  }

  // Main HUD - with incremental updates
  renderHUD(): void {
    if (!this.container) return;

    const money = GameManager.getMoney();
    const weeklyRevenue = GameManager.getEstimatedWeeklyRevenue();
    const weeksInDebt = GameManager.getWeeksInDebt();
    const weekNumber = GameManager.getCurrentWeek();
    const activeTrends = WorldState.isInitialized ? WorldState.getActiveTrends() : [];

    // Create hash for dirty checking
    const hudData = { money, weeklyRevenue, weeksInDebt, weekNumber, trends: activeTrends.map(t => t.id) };
    const hash = this.simpleHash(hudData);

    // Check if HUD exists and needs update
    let hud = document.getElementById('component-hud') as HTMLElement | null;

    if (hud && !this.needsUpdate('hud', hash)) {
      return; // No update needed
    }

    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'component-hud';
      hud.className = 'hud';
      this.container.appendChild(hud);
      this.componentCache.set('hud', { element: hud, hash: '' });
    }

    hud.innerHTML = `
      <div class="hud-left">
        <div class="hud-stat">
          <div class="hud-label">Treasury</div>
          <div class="hud-value ${money < 0 ? 'debt' : 'money'}">$${money.toLocaleString()}</div>
        </div>
        <div class="hud-stat">
          <div class="hud-label">Est. Weekly Revenue</div>
          <div class="hud-value money">~$${weeklyRevenue.toLocaleString()}</div>
        </div>
        ${weeksInDebt > 0 ? `
        <div class="hud-stat">
          <div class="hud-label">Weeks in Debt</div>
          <div class="hud-value debt">${weeksInDebt}/3</div>
        </div>
        ` : ''}
      </div>
      <div class="hud-center">
        ${activeTrends.length > 0 ? `
        <div class="hud-trends">
          ${activeTrends.slice(0, 2).map(t => `
            <span class="trend-badge ${t.followerMultiplier > 1 ? 'trend-positive' : 'trend-negative'}">
              ${t.followerMultiplier > 1 ? '📈' : '📉'} ${t.name}
            </span>
          `).join('')}
        </div>
        ` : ''}
      </div>
      <div class="hud-right">
        <div class="hud-stat">
          <div class="hud-label">Current Week</div>
          <div class="hud-value">Week ${weekNumber}</div>
        </div>
      </div>
    `;

    this.updateComponentHash('hud', hash);
  }

  // Roster panel - with incremental updates
  renderRosterPanel(onScoutClick: () => void, onStreamerClick?: (streamer: Streamer) => void): void {
    if (!this.container) return;

    const roster = GameManager.getRoster();
    const currentDay = GameManager.getCurrentDay();

    // Create hash for dirty checking (roster state)
    const rosterData = roster.map(s => ({
      id: s.id,
      name: s.name,
      followers: s.followers,
      platform: s.platform,
      contractEndDay: s.contractEndDay,
      burnout: s.burnout,
    }));
    const hash = this.simpleHash({ roster: rosterData, currentDay });

    // Check if panel exists and needs update
    let panel = document.getElementById('component-roster') as HTMLElement | null;

    if (panel && !this.needsUpdate('roster', hash)) {
      return; // No update needed
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'component-roster';
      panel.className = 'roster-panel panel';
      this.container.appendChild(panel);
      this.componentCache.set('roster', { element: panel, hash: '' });
    }

    if (roster.length === 0) {
      panel.innerHTML = `
        <div class="panel-header">Your Roster</div>
        <div class="empty-state">
          <div class="empty-state-icon">👤</div>
          <div class="empty-state-text">No talent signed yet</div>
          <button class="btn" id="scout-btn-empty">Scout Talent</button>
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div class="panel-header">Your Roster (${roster.length})</div>
        <div id="roster-cards"></div>
      `;

      const cardsContainer = panel.querySelector('#roster-cards')!;
      for (const streamer of roster) {
        const card = this.createStreamerCard(streamer, !!onStreamerClick);
        if (onStreamerClick) {
          card.addEventListener('click', () => onStreamerClick(streamer));
        }
        cardsContainer.appendChild(card);
      }
    }

    this.updateComponentHash('roster', hash);

    // Bind scout button
    const scoutBtn = panel.querySelector('#scout-btn-empty');
    if (scoutBtn) {
      scoutBtn.addEventListener('click', onScoutClick);
    }
  }

  private createStreamerCard(streamer: Streamer, clickable = false): HTMLElement {
    const card = document.createElement('div');
    card.className = 'streamer-card';
    if (clickable) {
      card.style.cursor = 'pointer';
      card.style.transition = 'transform 0.1s, box-shadow 0.1s';
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '';
      });
    }

    const platform = PLATFORMS[streamer.platform];
    const currentDay = GameManager.getCurrentDay();
    const daysLeft = streamer.contractEndDay - currentDay;
    const weeksLeft = Math.ceil(daysLeft / 7);
    const isExpiringSoon = weeksLeft <= 1 && weeksLeft > 0;
    const isExpired = daysLeft <= 0;

    card.innerHTML = `
      <div class="streamer-avatar">
        <img src="${streamer.getAvatarUrl(48)}" alt="${streamer.name}" class="avatar-img">
      </div>
      <div class="streamer-info">
        <div class="streamer-name">${streamer.name}</div>
        <div class="streamer-stats">
          <span class="stat">
            <span class="platform-badge platform-${platform.id}">${platform.name}</span>
          </span>
          <span class="stat">
            👥 <span class="stat-value">${this.formatNumber(streamer.followers)}</span>
          </span>
          <span class="stat">
            💰 <span class="stat-money">~$${streamer.getEstimatedWeeklyRevenue().toLocaleString()}/wk</span>
          </span>
        </div>
        <div style="font-size: 11px; margin-top: 4px; color: ${isExpired ? 'var(--accent-red)' : isExpiringSoon ? 'var(--accent-yellow)' : 'var(--text-secondary)'};">
          ${isExpired ? '<span class="warning-pulse">⚠️</span> Contract expired!' : isExpiringSoon ? `<span class="warning-pulse">⏰</span> ${weeksLeft} week left` : `📝 ${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left`}
          <span style="color: var(--text-secondary); margin-left: 8px;">(${Math.round(streamer.revenueSplit * 100)}% cut)</span>
        </div>
      </div>
    `;

    return card;
  }

  // Bottom action bar
  // Bottom bar - static, only create once
  renderBottomBar(onPlanWeek: () => void, onScout: () => void): void {
    if (!this.container) return;

    // Check if bar already exists (it's static, doesn't need updating)
    let bar = document.getElementById('component-bottombar') as HTMLElement | null;
    if (bar) {
      return; // Already rendered
    }

    bar = document.createElement('div');
    bar.id = 'component-bottombar';
    bar.className = 'bottom-bar';
    bar.innerHTML = `
      <button class="btn" id="plan-week-btn">Plan Week →</button>
      <button class="btn btn-secondary" id="scout-btn">Scout Talent</button>
    `;

    this.container.appendChild(bar);
    this.componentCache.set('bottombar', { element: bar, hash: 'static' });

    document.getElementById('plan-week-btn')?.addEventListener('click', onPlanWeek);
    document.getElementById('scout-btn')?.addEventListener('click', onScout);
  }

  // Event modal
  showEventModal(event: GameEvent, streamer: Streamer | null, onChoice: (choice: EventChoice) => void): void {
    if (!this.container) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const streamerName = streamer?.name ?? 'Unknown';

    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">⚡ Event</div>
        <div class="modal-title">${event.title.replace('{streamer}', streamerName)}</div>
        <div class="modal-body">${event.description.replace('{streamer}', streamerName)}</div>
        <div class="modal-choices" id="event-choices"></div>
      </div>
    `;

    const choicesContainer = backdrop.querySelector('#event-choices')!;

    for (const choice of event.choices) {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';

      // Show stat check indicator if present
      const statCheckHtml = choice.statCheck
        ? `<div class="choice-stat-check">🎲 ${this.formatStatName(choice.statCheck.stat)} check (${choice.statCheck.target}+)</div>`
        : '';

      // Show appropriate effects based on whether there's a stat check
      let effectsHtml: string;
      if (choice.statCheck) {
        const successText = this.formatEffects(choice.successEffects);
        const failText = this.formatEffects(choice.failEffects);
        effectsHtml = `
          <div class="choice-outcomes">
            <span class="outcome-success">✓ ${successText}</span>
            <span class="outcome-fail">✗ ${failText}</span>
          </div>
        `;
      } else {
        effectsHtml = `<div class="choice-consequence">${this.formatEffects(choice.effects)}</div>`;
      }

      // Show trait grant if present
      const traitHtml = this.formatTraitGrant(choice);

      btn.innerHTML = `
        ${choice.text}
        ${statCheckHtml}
        ${effectsHtml}
        ${traitHtml}
      `;
      btn.addEventListener('click', () => {
        this.closeModalWithAnimation(backdrop, () => onChoice(choice));
      });
      choicesContainer.appendChild(btn);
    }

    this.container.appendChild(backdrop);
  }

  // Show stat check result with animation
  showStatCheckResult(
    result: ChoiceResult,
    _streamer: Streamer, // Currently unused, but available for future use (e.g., showing streamer name)
    onComplete: () => void
  ): void {
    if (!this.container) {
      onComplete();
      return;
    }

    // If no stat check was performed, skip the animation
    if (result.success === null) {
      onComplete();
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop stat-check-backdrop';

    const statName = this.formatStatName(result.statChecked || 'unknown');
    const isSuccess = result.success;
    const resultClass = isSuccess ? 'stat-check-success' : 'stat-check-fail';
    const resultIcon = isSuccess ? '✓' : '✗';
    const resultText = isSuccess ? 'SUCCESS!' : 'FAILED';

    // Format effects that were applied
    const effectsHtml = this.formatEffectsDetailed(result.effectsApplied);

    // Format trait if granted
    const traitHtml = result.traitGranted
      ? `<div class="stat-check-trait">New Trait: <span class="trait-name">${TRAITS[result.traitGranted]?.name || result.traitGranted}</span></div>`
      : '';

    backdrop.innerHTML = `
      <div class="modal stat-check-modal ${resultClass}">
        <div class="stat-check-header">${statName} Check</div>
        <div class="stat-check-dice">
          <div class="dice-roll">${result.rollValue}</div>
          <div class="dice-vs">vs</div>
          <div class="dice-target">${result.targetValue}</div>
        </div>
        <div class="stat-check-result">
          <span class="result-icon">${resultIcon}</span>
          <span class="result-text">${resultText}</span>
        </div>
        <div class="stat-check-effects">${effectsHtml}</div>
        ${traitHtml}
        <button class="btn stat-check-continue">Continue</button>
      </div>
    `;

    // Add entrance animation class
    const modal = backdrop.querySelector('.stat-check-modal')!;
    modal.classList.add('stat-check-enter');

    backdrop.querySelector('.stat-check-continue')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onComplete);
    });

    this.container.appendChild(backdrop);

    // Trigger dice roll animation
    setTimeout(() => {
      modal.classList.remove('stat-check-enter');
      modal.classList.add('stat-check-reveal');
    }, 100);
  }

  private formatStatName(stat: string): string {
    const names: Record<string, string> = {
      charisma: 'Charisma',
      consistency: 'Consistency',
      dramaRisk: 'Drama Risk',
      skill: 'Skill',
      adaptability: 'Adaptability',
      loyalty: 'Loyalty',
      ambition: 'Ambition',
      burnout: 'Energy'
    };
    return names[stat] || stat;
  }

  private formatTraitGrant(choice: EventChoice): string {
    const traits: string[] = [];
    if (choice.grantsTrait) {
      traits.push(`🏷️ Grants: ${TRAITS[choice.grantsTrait]?.name || choice.grantsTrait}`);
    }
    if (choice.grantsTraitOnSuccess) {
      traits.push(`✓ Success: ${TRAITS[choice.grantsTraitOnSuccess]?.name || choice.grantsTraitOnSuccess}`);
    }
    if (choice.grantsTraitOnFail) {
      traits.push(`✗ Fail: ${TRAITS[choice.grantsTraitOnFail]?.name || choice.grantsTraitOnFail}`);
    }
    if (traits.length === 0) return '';
    return `<div class="choice-traits">${traits.join(' ')}</div>`;
  }

  private formatEffectsDetailed(effects: ChoiceResult['effectsApplied']): string {
    if (!effects) return '';
    const parts: string[] = [];

    if (effects.money) {
      const color = effects.money > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      parts.push(`<span style="color: ${color}">${effects.money > 0 ? '+' : ''}$${effects.money.toLocaleString()}</span>`);
    }
    if (effects.followers) {
      const color = effects.followers > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      parts.push(`<span style="color: ${color}">${effects.followers > 0 ? '+' : ''}${effects.followers.toLocaleString()} followers</span>`);
    }
    if (effects.reputation) {
      const color = effects.reputation > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      parts.push(`<span style="color: ${color}">${effects.reputation > 0 ? '+' : ''}${effects.reputation} rep</span>`);
    }
    if (effects.burnout) {
      const color = effects.burnout < 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      parts.push(`<span style="color: ${color}">${effects.burnout > 0 ? '+' : ''}${effects.burnout}% burnout</span>`);
    }
    // Stat changes
    const statNames = ['charisma', 'consistency', 'dramaRisk', 'skill', 'adaptability', 'loyalty', 'ambition'] as const;
    for (const stat of statNames) {
      const value = effects[stat];
      if (value) {
        const color = (stat === 'dramaRisk' ? value < 0 : value > 0) ? 'var(--accent-green)' : 'var(--accent-red)';
        parts.push(`<span style="color: ${color}">${value > 0 ? '+' : ''}${value} ${this.formatStatName(stat)}</span>`);
      }
    }

    return parts.join(' • ') || 'No effect';
  }

  private formatEffects(effects: EventChoice['effects']): string {
    if (!effects) return 'No immediate effect';
    const parts: string[] = [];
    if (effects.money) {
      parts.push(effects.money > 0 ? `+$${effects.money}` : `-$${Math.abs(effects.money)}`);
    }
    if (effects.followers) {
      parts.push(effects.followers > 0 ? `+${effects.followers} followers` : `${effects.followers} followers`);
    }
    if (effects.reputation) {
      parts.push(effects.reputation > 0 ? `+${effects.reputation} rep` : `${effects.reputation} rep`);
    }
    return parts.join(' • ') || 'No immediate effect';
  }

  // Game over screen
  showGameOver(_reason: string): void {
    if (!this.container) return;

    const screen = document.createElement('div');
    screen.className = 'game-over';
    screen.innerHTML = `
      <div class="game-over-title">BANKRUPT</div>
      <div class="game-over-subtitle">Your agency has been dissolved after 7 days in debt.</div>
      <button class="btn" id="restart-btn">Try Again</button>
    `;

    this.container.appendChild(screen);

    document.getElementById('restart-btn')?.addEventListener('click', () => {
      GameManager.deleteSave();
      window.location.reload();
    });
  }

  // Scout view
  renderScoutView(prospects: Streamer[], onSign: (s: Streamer) => void, onBack: () => void): void {
    if (!this.container) return;
    this.clear();

    const view = document.createElement('div');
    view.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-dark); padding: 20px;';

    view.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <h2 style="color: var(--text-primary); margin: 0;">Scout Talent</h2>
          <p style="color: var(--text-secondary); margin: 4px 0 0 0;">Treasury: $${GameManager.getMoney().toLocaleString()}</p>
        </div>
        <button class="btn btn-secondary" id="back-btn">← Back to Office</button>
      </div>
      <div class="scout-grid" id="scout-grid"></div>
    `;

    const grid = view.querySelector('#scout-grid')!;

    for (const prospect of prospects) {
      const cost = Streamer.getSigningCost(prospect);
      const canAfford = GameManager.getMoney() >= cost;

      const card = document.createElement('div');
      card.className = 'scout-card';
      card.innerHTML = `
        <div class="scout-avatar">
          <img src="${prospect.getAvatarUrl(80)}" alt="${prospect.name}" class="avatar-img">
        </div>
        <div class="scout-name">${prospect.name}</div>
        <div class="scout-niche">${prospect.getGenreName()}</div>
        <div class="scout-stats">
          <div class="scout-stat">
            <div class="scout-stat-label">Charisma</div>
            <div class="scout-stat-bar"><div class="scout-stat-fill" style="width: ${prospect.stats.charisma * 10}%"></div></div>
          </div>
          <div class="scout-stat">
            <div class="scout-stat-label">Consistency</div>
            <div class="scout-stat-bar"><div class="scout-stat-fill" style="width: ${prospect.stats.consistency * 10}%"></div></div>
          </div>
          <div class="scout-stat">
            <div class="scout-stat-label">Drama Risk</div>
            <div class="scout-stat-bar"><div class="scout-stat-fill" style="width: ${prospect.stats.dramaRisk * 10}%; background: var(--accent-red);"></div></div>
          </div>
          <div class="scout-stat">
            <div class="scout-stat-label">Followers</div>
            <div style="color: var(--text-primary);">${this.formatNumber(prospect.followers)}</div>
          </div>
        </div>
        <div class="scout-cost">Est. Signing Bonus: ~$${cost.toLocaleString()}</div>
        <button class="btn ${canAfford ? 'btn-success' : ''}" ${!canAfford ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
          ${canAfford ? 'Negotiate' : 'Cannot Afford'}
        </button>
      `;

      if (canAfford) {
        card.querySelector('button')?.addEventListener('click', () => onSign(prospect));
      }

      grid.appendChild(card);
    }

    this.container.appendChild(view);
    document.getElementById('back-btn')?.addEventListener('click', onBack);
  }

  // Negotiation view
  renderNegotiation(
    streamer: Streamer,
    state: NegotiationState,
    onOffer: (terms: ContractTerms) => void,
    onWalk: () => void
  ): void {
    if (!this.container) return;
    this.clear();

    const agency = GameManager.getAgency();
    const scoutingLevel = agency.scoutingLevel;
    const visibleStats = getVisibleStats(streamer.stats, scoutingLevel);

    const view = document.createElement('div');
    view.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-dark); padding: 20px; display: flex; gap: 24px;';

    const moodColors = {
      eager: 'var(--accent-green)',
      neutral: 'var(--accent-blue)',
      hesitant: 'var(--accent-yellow)',
      insulted: 'var(--accent-red)',
    };

    const currentOffer = state.currentOffer;
    const expectations = state.streamerExpectations;

    // Calculate current offer score for live feedback
    const currentScore = Contract.evaluateOffer(currentOffer, expectations);
    const roundBonus = state.round * 5;
    const acceptThreshold = 55 - roundBonus;
    const acceptanceLikelihood = Math.min(100, Math.max(0, Math.round((currentScore / acceptThreshold) * 50)));

    // Format stat display based on visibility
    const formatStat = (stat: { display: string; exact: boolean }, color: string) => {
      if (stat.display === '???') {
        return `<span style="color: var(--accent-red);">???</span>`;
      }
      if (!stat.exact) {
        return `<span style="color: var(--accent-yellow);">${stat.display}</span>`;
      }
      return `<span style="color: ${color};">${stat.display}/10</span>`;
    };

    // Generate estimate ranges based on scouting level
    const fuzzAmount = Math.max(0, 3 - scoutingLevel) * 0.15; // 0-45% fuzz at low scouting
    const bonusMin = Math.floor(expectations.signingBonus * (1 - fuzzAmount));
    const bonusMax = Math.ceil(expectations.signingBonus * (1 + fuzzAmount));
    const splitMin = Math.max(20, Math.round((expectations.revenueSplit - fuzzAmount * 0.1) * 100));
    const splitMax = Math.min(50, Math.round((expectations.revenueSplit + fuzzAmount * 0.1) * 100));

    view.innerHTML = `
      <div style="flex: 1; max-width: 350px;">
        <div class="panel" style="margin-bottom: 16px;">
          <div class="panel-header">Prospect</div>
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
            <div class="scout-avatar" style="width: 64px; height: 64px;">
              <img src="${streamer.getAvatarUrl(64)}" alt="${streamer.name}" class="avatar-img">
            </div>
            <div>
              <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${streamer.name}</div>
              <div style="color: var(--text-secondary);">${streamer.getGenreName()}</div>
              <div style="color: var(--text-secondary);">${this.formatNumber(streamer.followers)} followers</div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px;">
            <div>Charisma: ${formatStat(visibleStats.charisma, 'var(--accent-blue)')}</div>
            <div>Consistency: <span style="color: var(--accent-blue);">${visibleStats.consistency.display}/10</span></div>
            <div>Drama Risk: ${formatStat(visibleStats.dramaRisk, 'var(--accent-red)')}</div>
            <div>Skill: ${formatStat(visibleStats.skill, 'var(--accent-blue)')}</div>
            <div>Adaptability: ${formatStat(visibleStats.adaptability, 'var(--accent-cyan)')}</div>
            <div>Loyalty: ${formatStat(visibleStats.loyalty, 'var(--accent-green)')}</div>
            <div>Ambition: ${formatStat(visibleStats.ambition, 'var(--accent-yellow)')}</div>
            <div>Burnout: <span style="color: ${streamer.burnout > 70 ? 'var(--accent-red)' : streamer.burnout > 40 ? 'var(--accent-yellow)' : 'var(--accent-green)'};">${streamer.burnout}%</span></div>
          </div>
        </div>

        <div class="panel" style="margin-bottom: 16px;">
          <div class="panel-header">🎯 Intel Estimate</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
            Based on their profile, they likely want:
          </div>
          <div style="display: grid; gap: 8px; font-size: 13px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-secondary);">Signing Bonus:</span>
              <span style="color: var(--accent-green);">$${bonusMin.toLocaleString()} - $${bonusMax.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-secondary);">Agency Cut:</span>
              <span style="color: var(--accent-blue);">${splitMin}% - ${splitMax}%</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-secondary);">Contract Length:</span>
              <span style="color: var(--accent-blue);">${expectations.lengthDays}${fuzzAmount > 0 ? '±30' : ''} days</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--text-secondary);">Exclusivity:</span>
              <span style="color: ${expectations.exclusivity ? 'var(--accent-green)' : 'var(--accent-yellow)'};">${expectations.exclusivity ? 'Accepts' : 'Prefers None'}</span>
            </div>
          </div>
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-secondary); font-size: 12px;">Acceptance Likelihood:</span>
              <span id="likelihood-display" style="font-weight: 700; color: ${acceptanceLikelihood >= 70 ? 'var(--accent-green)' : acceptanceLikelihood >= 40 ? 'var(--accent-yellow)' : 'var(--accent-red)'};">
                ${acceptanceLikelihood >= 70 ? 'High' : acceptanceLikelihood >= 40 ? 'Medium' : 'Low'}
              </span>
            </div>
            <div style="margin-top: 6px; height: 6px; background: var(--bg-card); border-radius: 3px; overflow: hidden;">
              <div id="likelihood-bar" style="height: 100%; width: ${acceptanceLikelihood}%; background: ${acceptanceLikelihood >= 70 ? 'var(--accent-green)' : acceptanceLikelihood >= 40 ? 'var(--accent-yellow)' : 'var(--accent-red)'}; border-radius: 3px; transition: all 0.2s;"></div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">Negotiation Status</div>
          <div style="margin-bottom: 12px;">
            <span style="color: var(--text-secondary);">Round:</span>
            <span style="color: var(--text-primary); font-weight: 600;">${state.round}/${state.maxRounds}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <span style="color: var(--text-secondary);">Mood:</span>
            <span style="color: ${moodColors[state.streamerMood]}; font-weight: 600; text-transform: capitalize;">${state.streamerMood}</span>
          </div>
          <div style="color: var(--text-secondary); font-size: 13px; font-style: italic;">
            ${Contract.getMoodText(state.streamerMood, streamer.name)}
          </div>
          ${state.lastCounterOffer ? `
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--accent-yellow); margin-bottom: 8px;">⚡ Their Counter-Offer</div>
            <div style="font-size: 13px; color: var(--text-primary); background: var(--bg-card); padding: 12px; border-radius: 6px; border: 1px solid var(--accent-yellow);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Bonus:</span>
                <span style="color: var(--accent-green);">$${state.lastCounterOffer.signingBonus.toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Your Cut:</span>
                <span style="color: var(--accent-blue);">${Math.round(state.lastCounterOffer.revenueSplit * 100)}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Length:</span>
                <span>${state.lastCounterOffer.lengthDays} days</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Exclusive:</span>
                <span>${state.lastCounterOffer.exclusivity ? 'Yes' : 'No'}</span>
              </div>
            </div>
            <button class="btn btn-success" id="accept-counter-btn" style="width: 100%; margin-top: 12px;">
              ✓ Accept Their Counter-Offer
            </button>
          </div>
          ` : ''}
        </div>
      </div>

      <div style="flex: 2;">
        <div class="panel">
          <div class="panel-header">Your Offer</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="color: var(--text-secondary);">Treasury: <span style="color: var(--accent-green);">$${GameManager.getMoney().toLocaleString()}</span></div>
            <button class="btn btn-secondary" id="revert-offer-btn" style="padding: 4px 12px; font-size: 12px; display: none;">
              ↩ Revert Changes
            </button>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; color: var(--text-secondary); margin-bottom: 8px; font-size: 13px;">
              Signing Bonus: <span id="bonus-value" style="color: var(--accent-green); font-weight: 600;">$${currentOffer.signingBonus.toLocaleString()}</span>
            </label>
            <input type="range" id="bonus-slider" min="100" max="${Math.min(GameManager.getMoney(), 5000)}" value="${currentOffer.signingBonus}"
              style="width: 100%; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
              <span>$100</span>
              <span>$${Math.min(GameManager.getMoney(), 5000).toLocaleString()}</span>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; color: var(--text-secondary); margin-bottom: 8px; font-size: 13px;">
              Agency Cut: <span id="split-value" style="color: var(--accent-blue); font-weight: 600;">${Math.round(currentOffer.revenueSplit * 100)}%</span>
              <span style="color: var(--text-secondary); font-size: 11px;">(they keep ${100 - Math.round(currentOffer.revenueSplit * 100)}%)</span>
            </label>
            <input type="range" id="split-slider" min="20" max="60" value="${Math.round(currentOffer.revenueSplit * 100)}"
              style="width: 100%; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
              <span>20% (generous)</span>
              <span>60% (aggressive)</span>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="display: block; color: var(--text-secondary); margin-bottom: 8px; font-size: 13px;">
              Contract Length: <span id="length-value" style="color: var(--accent-blue); font-weight: 600;">${currentOffer.lengthDays} days</span>
              <span style="color: var(--text-secondary); font-size: 11px;">(${Math.ceil(currentOffer.lengthDays / 7)} weeks)</span>
            </label>
            <input type="range" id="length-slider" min="30" max="180" step="30" value="${currentOffer.lengthDays}"
              style="width: 100%; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
              <span>30 days</span>
              <span>180 days</span>
            </div>
          </div>

          <div style="margin-bottom: 24px;">
            <label style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary); cursor: pointer;">
              <input type="checkbox" id="exclusive-check" ${currentOffer.exclusivity ? 'checked' : ''} style="cursor: pointer;">
              <span>Require Platform Exclusivity</span>
            </label>
            <div style="font-size: 11px; color: var(--text-secondary); margin-left: 24px;">They can only stream on ${PLATFORMS[streamer.platform].name} while under contract</div>
          </div>

          <div style="display: flex; gap: 12px;">
            <button class="btn btn-success" id="make-offer-btn" style="flex: 1;">Make Offer</button>
            <button class="btn btn-secondary" id="walk-away-btn">Walk Away</button>
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(view);

    // Store original values for revert functionality
    const originalOffer = { ...currentOffer };

    // Bind sliders
    const bonusSlider = document.getElementById('bonus-slider') as HTMLInputElement;
    const splitSlider = document.getElementById('split-slider') as HTMLInputElement;
    const lengthSlider = document.getElementById('length-slider') as HTMLInputElement;
    const exclusiveCheck = document.getElementById('exclusive-check') as HTMLInputElement;
    const revertBtn = document.getElementById('revert-offer-btn') as HTMLButtonElement;
    const likelihoodDisplay = document.getElementById('likelihood-display') as HTMLElement;
    const likelihoodBar = document.getElementById('likelihood-bar') as HTMLElement;

    // Update likelihood display based on current slider values
    const updateLikelihood = () => {
      const testOffer: ContractTerms = {
        signingBonus: parseInt(bonusSlider.value),
        revenueSplit: parseInt(splitSlider.value) / 100,
        lengthDays: parseInt(lengthSlider.value),
        exclusivity: exclusiveCheck.checked,
      };
      const score = Contract.evaluateOffer(testOffer, expectations);
      const likelihood = Math.min(100, Math.max(0, Math.round((score / acceptThreshold) * 50)));

      likelihoodDisplay.textContent = likelihood >= 70 ? 'High' : likelihood >= 40 ? 'Medium' : 'Low';
      likelihoodDisplay.style.color = likelihood >= 70 ? 'var(--accent-green)' : likelihood >= 40 ? 'var(--accent-yellow)' : 'var(--accent-red)';
      likelihoodBar.style.width = `${likelihood}%`;
      likelihoodBar.style.background = likelihood >= 70 ? 'var(--accent-green)' : likelihood >= 40 ? 'var(--accent-yellow)' : 'var(--accent-red)';
    };

    // Check if values have changed from original to show/hide revert button
    const checkForChanges = () => {
      const hasChanges =
        parseInt(bonusSlider.value) !== originalOffer.signingBonus ||
        parseInt(splitSlider.value) !== Math.round(originalOffer.revenueSplit * 100) ||
        parseInt(lengthSlider.value) !== originalOffer.lengthDays ||
        exclusiveCheck.checked !== originalOffer.exclusivity;

      revertBtn.style.display = hasChanges ? 'block' : 'none';
    };

    bonusSlider?.addEventListener('input', () => {
      document.getElementById('bonus-value')!.textContent = `$${parseInt(bonusSlider.value).toLocaleString()}`;
      checkForChanges();
      updateLikelihood();
    });

    splitSlider?.addEventListener('input', () => {
      const val = parseInt(splitSlider.value);
      document.getElementById('split-value')!.innerHTML = `${val}% <span style="color: var(--text-secondary); font-size: 11px;">(they keep ${100 - val}%)</span>`;
      checkForChanges();
      updateLikelihood();
    });

    lengthSlider?.addEventListener('input', () => {
      const days = parseInt(lengthSlider.value);
      document.getElementById('length-value')!.innerHTML = `${days} days <span style="color: var(--text-secondary); font-size: 11px;">(${Math.ceil(days / 7)} weeks)</span>`;
      checkForChanges();
      updateLikelihood();
    });

    exclusiveCheck?.addEventListener('change', () => {
      checkForChanges();
      updateLikelihood();
    });

    // Revert button handler
    revertBtn?.addEventListener('click', () => {
      bonusSlider.value = originalOffer.signingBonus.toString();
      splitSlider.value = Math.round(originalOffer.revenueSplit * 100).toString();
      lengthSlider.value = originalOffer.lengthDays.toString();
      exclusiveCheck.checked = originalOffer.exclusivity;

      // Update displays
      document.getElementById('bonus-value')!.textContent = `$${originalOffer.signingBonus.toLocaleString()}`;
      document.getElementById('split-value')!.innerHTML = `${Math.round(originalOffer.revenueSplit * 100)}% <span style="color: var(--text-secondary); font-size: 11px;">(they keep ${100 - Math.round(originalOffer.revenueSplit * 100)}%)</span>`;
      document.getElementById('length-value')!.innerHTML = `${originalOffer.lengthDays} days <span style="color: var(--text-secondary); font-size: 11px;">(${Math.ceil(originalOffer.lengthDays / 7)} weeks)</span>`;

      checkForChanges();
      updateLikelihood();
    });

    // Accept counter-offer button
    document.getElementById('accept-counter-btn')?.addEventListener('click', () => {
      if (state.lastCounterOffer) {
        onOffer(state.lastCounterOffer);
      }
    });

    // Bind buttons
    document.getElementById('make-offer-btn')?.addEventListener('click', () => {
      const terms: ContractTerms = {
        signingBonus: parseInt(bonusSlider.value),
        revenueSplit: parseInt(splitSlider.value) / 100,
        lengthDays: parseInt(lengthSlider.value),
        exclusivity: exclusiveCheck.checked,
      };
      onOffer(terms);
    });

    document.getElementById('walk-away-btn')?.addEventListener('click', onWalk);
  }

  // Show negotiation result
  showNegotiationResult(
    accepted: boolean,
    walked: boolean,
    streamerWalked: boolean,
    message: string,
    onContinue: () => void
  ): void {
    if (!this.container) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    // Determine icon and title based on outcome
    let icon: string;
    let title: string;

    if (accepted) {
      icon = '🤝';
      title = 'Deal Signed!';
    } else if (streamerWalked) {
      icon = '🚪';
      title = 'They Walked';
    } else if (walked) {
      icon = '👋';
      title = 'You Walked Away';
    } else {
      // Counter-offer
      icon = '💬';
      title = 'Counter-Offer';
    }

    backdrop.innerHTML = `
      <div class="modal">
        <div class="${accepted ? 'celebration-icon' : ''}" style="text-align: center; font-size: 48px; margin-bottom: 16px;">${icon}</div>
        <div class="modal-title ${accepted ? 'celebration-title' : ''}" style="text-align: center;">${title}</div>
        <div class="modal-body" style="text-align: center;">${message}</div>
        <button class="btn" id="continue-btn" style="width: 100%;">Continue</button>
      </div>
    `;

    this.container.appendChild(backdrop);

    // Use backdrop.querySelector instead of document.getElementById for reliability
    const continueBtn = backdrop.querySelector('#continue-btn');
    continueBtn?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onContinue);
    });

    // Confetti disabled - was causing click delays
    // if (accepted) {
    //   this.showConfetti();
    // }
  }

  // Contract expiration notification
  showContractExpired(
    streamer: Streamer,
    onRenew: () => void,
    onLetGo: () => void
  ): void {
    if (!this.container) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header"><span class="warning-pulse">📋</span> Contract Expired</div>
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
          <div class="scout-avatar" style="width: 64px; height: 64px;">
            <img src="${streamer.getAvatarUrl(64)}" alt="${streamer.name}" class="avatar-img">
          </div>
          <div>
            <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${streamer.name}</div>
            <div style="color: var(--text-secondary);">${this.formatNumber(streamer.followers)} followers</div>
          </div>
        </div>
        <div class="modal-body">
          ${streamer.name}'s contract has expired. They're waiting to hear if you want to negotiate a new deal or part ways.
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-success" id="renew-btn" style="flex: 1;">Negotiate Renewal</button>
          <button class="btn btn-secondary" id="letgo-btn">Let Them Go</button>
        </div>
      </div>
    `;

    this.container.appendChild(backdrop);
    document.getElementById('renew-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onRenew);
    });
    document.getElementById('letgo-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onLetGo);
    });
  }

  // Contract expiring soon warning
  showContractExpiringSoon(
    streamer: Streamer,
    timeLeft: number,
    onDismiss: () => void,
    isWeeks: boolean = false
  ): void {
    if (!this.container) return;

    const timeUnit = isWeeks ? (timeLeft === 1 ? 'week' : 'weeks') : (timeLeft === 1 ? 'day' : 'days');

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header"><span class="warning-pulse">⏰</span> Contract Expiring Soon</div>
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
          <div class="scout-avatar" style="width: 48px; height: 48px;">
            <img src="${streamer.getAvatarUrl(48)}" alt="${streamer.name}" class="avatar-img">
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${streamer.name}</div>
            <div style="color: var(--accent-yellow);">${timeLeft} ${timeUnit} remaining</div>
          </div>
        </div>
        <div class="modal-body">
          ${streamer.name}'s contract expires in ${timeLeft} ${timeUnit}. Start thinking about whether you want to renew.
        </div>
        <button class="btn" id="dismiss-btn" style="width: 100%;">Noted</button>
      </div>
    `;

    this.container.appendChild(backdrop);
    document.getElementById('dismiss-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onDismiss);
    });
  }

  // Platform unlock notification
  showPlatformUnlocked(platformKey: string, onContinue: () => void): void {
    if (!this.container) return;

    const platform = PLATFORMS[platformKey as keyof typeof PLATFORMS];
    if (!platform) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal">
        <div class="celebration-icon" style="text-align: center; font-size: 48px; margin-bottom: 16px;">🔓</div>
        <div class="modal-title celebration-title" style="text-align: center;">New Platform Unlocked!</div>
        <div style="text-align: center; margin-bottom: 16px;">
          <span class="platform-badge" style="background: ${platform.color}; font-size: 16px; padding: 8px 16px;">
            ${platform.name}
          </span>
        </div>
        <div class="modal-body" style="text-align: center;">
          ${platform.description}
        </div>
        <div style="background: var(--bg-card); border-radius: 4px; padding: 12px; margin-bottom: 16px; font-size: 13px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>Revenue: <span style="color: var(--accent-green);">${platform.revenueMultiplier}x</span></div>
            <div>Growth: <span style="color: var(--accent-blue);">${platform.growthMultiplier}x</span></div>
            <div>Volatility: <span style="color: var(--accent-yellow);">${Math.round(platform.volatility * 100)}%</span></div>
            <div>Drama: <span style="color: var(--accent-red);">${platform.dramaMultiplier}x</span></div>
          </div>
        </div>
        <div style="color: var(--text-secondary); font-size: 12px; text-align: center; margin-bottom: 16px;">
          You can now scout and sign talent on ${platform.name}!
        </div>
        <button class="btn" id="continue-btn" style="width: 100%;">Excellent</button>
      </div>
    `;

    this.container.appendChild(backdrop);
    this.showConfetti();
    document.getElementById('continue-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onContinue);
    });
  }

  // Scout view state for sorting/filtering
  private scoutSortBy: string = 'followers-desc';
  private scoutFilterNiche: string = 'all';
  private scoutFilterAffordable: boolean = false;

  // Scout view with platform selection
  renderScoutViewWithPlatforms(
    prospects: Streamer[],
    unlockedPlatforms: string[],
    selectedPlatform: string,
    onPlatformChange: (platform: string) => void,
    onNegotiate: (s: Streamer) => void,
    onBack: () => void,
    onSkillsClick?: () => void
  ): void {
    if (!this.container) return;
    this.clear();

    const agency = GameManager.getAgency();
    const scoutingLevel = agency.scoutingLevel;
    const currentTier = agency.getCurrentScoutingTier();
    const money = GameManager.getMoney();

    // Get unique niches from prospects
    const genres = [...new Set(prospects.map(p => p.getGenreName()))].sort();

    // Apply filters
    let filteredProspects = [...prospects];

    if (this.scoutFilterNiche !== 'all') {
      filteredProspects = filteredProspects.filter(p => p.getGenreName() === this.scoutFilterNiche);
    }

    if (this.scoutFilterAffordable) {
      filteredProspects = filteredProspects.filter(p => Streamer.getSigningCost(p) <= money);
    }

    // Apply sorting (use estimated revenue for sorting too)
    filteredProspects.sort((a, b) => {
      switch (this.scoutSortBy) {
        case 'followers-desc':
          return b.followers - a.followers;
        case 'followers-asc':
          return a.followers - b.followers;
        case 'revenue-desc':
          const revA = getEstimatedRevenue(a.followers, a.stats, a.platform, a.genre, a.revenueSplit, scoutingLevel, a.burnout).estimate;
          const revB = getEstimatedRevenue(b.followers, b.stats, b.platform, b.genre, b.revenueSplit, scoutingLevel, b.burnout).estimate;
          return revB - revA;
        case 'cost-asc':
          return Streamer.getSigningCost(a) - Streamer.getSigningCost(b);
        case 'cost-desc':
          return Streamer.getSigningCost(b) - Streamer.getSigningCost(a);
        case 'consistency-desc':
          return b.stats.consistency - a.stats.consistency;
        case 'age-asc':
          return (a.age ?? 25) - (b.age ?? 25);
        case 'age-desc':
          return (b.age ?? 25) - (a.age ?? 25);
        case 'experience-desc':
          return (b.experienceYears ?? 0) - (a.experienceYears ?? 0);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    const view = document.createElement('div');
    view.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-dark); padding: 20px; display: flex; flex-direction: column;';

    // Build platform tabs
    const platformTabs = unlockedPlatforms.map(pKey => {
      const p = PLATFORMS[pKey as keyof typeof PLATFORMS];
      const isSelected = pKey === selectedPlatform;
      return `
        <button class="btn ${isSelected ? '' : 'btn-secondary'}"
                data-platform="${pKey}"
                style="background: ${isSelected ? p.color : ''}; border-color: ${p.color};">
          ${p.name}
        </button>
      `;
    }).join('');

    const currentPlatform = PLATFORMS[selectedPlatform as keyof typeof PLATFORMS];

    // Build genre options
    const genreOptions = genres.map((g: string) =>
      `<option value="${g}" ${this.scoutFilterNiche === g ? 'selected' : ''}>${g}</option>`
    ).join('');

    view.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
        <div>
          <h2 style="color: var(--text-primary); margin: 0;">Scout Talent</h2>
          <p style="color: var(--text-secondary); margin: 4px 0 0 0;">Treasury: $${money.toLocaleString()}</p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" id="skills-btn">🔍 ${currentTier.name}</button>
          <button class="btn btn-secondary" id="back-btn">← Back to Office</button>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-shrink: 0;" id="platform-tabs">
        ${platformTabs}
      </div>

      <div style="background: var(--bg-panel); border-radius: 4px; padding: 12px; margin-bottom: 12px; font-size: 13px; display: flex; gap: 24px; align-items: center; flex-shrink: 0;">
        <div style="color: var(--text-secondary); flex: 1;">${currentPlatform.description}</div>
        <div style="display: flex; gap: 16px; flex-shrink: 0;">
          <span>💰 ${currentPlatform.revenueMultiplier}x</span>
          <span>📈 ${currentPlatform.growthMultiplier}x</span>
          <span>🎲 ${Math.round(currentPlatform.volatility * 100)}%</span>
          <span>🔥 ${currentPlatform.dramaMultiplier}x</span>
        </div>
      </div>

      <div class="scout-toolbar" style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px; flex-shrink: 0; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="color: var(--text-secondary); font-size: 13px;">Sort:</label>
          <select id="sort-select" class="scout-select">
            <option value="followers-desc" ${this.scoutSortBy === 'followers-desc' ? 'selected' : ''}>Followers ↓</option>
            <option value="followers-asc" ${this.scoutSortBy === 'followers-asc' ? 'selected' : ''}>Followers ↑</option>
            <option value="revenue-desc" ${this.scoutSortBy === 'revenue-desc' ? 'selected' : ''}>Revenue ↓</option>
            <option value="cost-asc" ${this.scoutSortBy === 'cost-asc' ? 'selected' : ''}>Cost ↑</option>
            <option value="cost-desc" ${this.scoutSortBy === 'cost-desc' ? 'selected' : ''}>Cost ↓</option>
            <option value="consistency-desc" ${this.scoutSortBy === 'consistency-desc' ? 'selected' : ''}>Consistency ↓</option>
            <option value="age-asc" ${this.scoutSortBy === 'age-asc' ? 'selected' : ''}>Age (Youngest)</option>
            <option value="age-desc" ${this.scoutSortBy === 'age-desc' ? 'selected' : ''}>Age (Oldest)</option>
            <option value="experience-desc" ${this.scoutSortBy === 'experience-desc' ? 'selected' : ''}>Experience ↓</option>
            <option value="name-asc" ${this.scoutSortBy === 'name-asc' ? 'selected' : ''}>Name A-Z</option>
          </select>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="color: var(--text-secondary); font-size: 13px;">Niche:</label>
          <select id="niche-select" class="scout-select">
            <option value="all" ${this.scoutFilterNiche === 'all' ? 'selected' : ''}>All Niches</option>
            ${genreOptions}
          </select>
        </div>

        <label style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-size: 13px; cursor: pointer;">
          <input type="checkbox" id="affordable-check" ${this.scoutFilterAffordable ? 'checked' : ''} style="cursor: pointer;">
          Can Afford Only
        </label>

        <div style="flex: 1;"></div>

        <div style="color: var(--text-secondary); font-size: 13px;">
          Showing <span style="color: var(--text-primary); font-weight: 600;">${filteredProspects.length}</span> of ${prospects.length}
        </div>
      </div>

      <div class="scout-container">
        <div class="scout-grid" id="scout-grid"></div>
      </div>
    `;

    const grid = view.querySelector('#scout-grid')!;

    if (filteredProspects.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">🔍</div>
          <div>No streamers match your filters</div>
          <button class="btn btn-secondary" id="clear-filters-btn" style="margin-top: 16px;">Clear Filters</button>
        </div>
      `;
    } else {
      for (const prospect of filteredProspects) {
        const cost = Streamer.getSigningCost(prospect);
        const canAfford = money >= cost;
        const visibleStats = getVisibleStats(prospect.stats, scoutingLevel);
        const revenueInfo = getEstimatedRevenue(prospect.followers, prospect.stats, prospect.platform, prospect.genre, prospect.revenueSplit, scoutingLevel, prospect.burnout);

        const card = document.createElement('div');
        card.className = 'scout-card';
        // Burnout indicator
        const burnoutLevel = prospect.burnout > 70 ? 'high' : prospect.burnout > 40 ? 'medium' : 'low';
        const burnoutColor = prospect.burnout > 70 ? 'var(--accent-red)' : prospect.burnout > 40 ? 'var(--accent-yellow)' : 'var(--accent-green)';

        card.innerHTML = `
          <div class="scout-avatar">
            <img src="${prospect.getAvatarUrl(80)}" alt="${prospect.name}" class="avatar-img">
          </div>
          <div class="scout-name">${prospect.name}</div>
          <div class="scout-niche">${prospect.getGenreName()}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
            Age ${prospect.age ?? '?'} · ${prospect.experienceYears ?? 0}yr exp
          </div>
          <div class="scout-stats">
            ${this.renderScoutStatBar('Charisma', visibleStats.charisma)}
            <div class="scout-stat">
              <div class="scout-stat-label">Consistency <span class="stat-value">${visibleStats.consistency.display}</span></div>
              <div class="scout-stat-bar"><div class="scout-stat-fill" style="width: ${visibleStats.consistency.value * 10}%"></div></div>
            </div>
            ${this.renderScoutStatBar('Drama Risk', visibleStats.dramaRisk, 'var(--accent-red)')}
            ${this.renderScoutStatBar('Skill', visibleStats.skill)}
          </div>
          <div class="scout-stats" style="margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--border-color);">
            ${this.renderScoutStatBar('Adaptability', visibleStats.adaptability, 'var(--accent-cyan)')}
            ${this.renderScoutStatBar('Loyalty', visibleStats.loyalty, 'var(--accent-green)')}
            ${this.renderScoutStatBar('Ambition', visibleStats.ambition, 'var(--accent-yellow)')}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin: 8px 0; font-size: 12px;">
            <div style="color: var(--text-secondary);">
              <span style="color: var(--text-primary);">${this.formatNumber(prospect.followers)}</span> followers
            </div>
            <div style="color: ${burnoutColor};" title="Burnout: ${prospect.burnout}%">
              ${burnoutLevel === 'high' ? '🔥 Burned out' : burnoutLevel === 'medium' ? '⚠️ Fatigued' : '✓ Fresh'}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div class="scout-cost">Est. Bonus: ~$${cost.toLocaleString()}</div>
            <div style="font-size: 12px; color: ${revenueInfo.isExact ? 'var(--accent-green)' : 'var(--accent-yellow)'};" ${!revenueInfo.isExact ? 'title="Estimate based on limited intel"' : ''}>
              ${revenueInfo.isExact ? '' : '~'}$${(revenueInfo.estimate * 7).toLocaleString()}/wk${!revenueInfo.isExact ? ' ?' : ''}
            </div>
          </div>
          <button class="btn ${canAfford ? 'btn-success' : ''}" ${!canAfford ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
            ${canAfford ? 'Negotiate' : 'Cannot Afford'}
          </button>
        `;

        if (canAfford) {
          card.querySelector('button')?.addEventListener('click', () => onNegotiate(prospect));
        }

        grid.appendChild(card);
      }
    }

    this.container.appendChild(view);

    // Bind platform tabs
    const tabContainer = document.getElementById('platform-tabs');
    tabContainer?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const platform = btn.getAttribute('data-platform');
        if (platform) onPlatformChange(platform);
      });
    });

    // Bind sort/filter controls
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.scoutSortBy = (e.target as HTMLSelectElement).value;
      this.renderScoutViewWithPlatforms(prospects, unlockedPlatforms, selectedPlatform, onPlatformChange, onNegotiate, onBack, onSkillsClick);
    });

    document.getElementById('niche-select')?.addEventListener('change', (e) => {
      this.scoutFilterNiche = (e.target as HTMLSelectElement).value;
      this.renderScoutViewWithPlatforms(prospects, unlockedPlatforms, selectedPlatform, onPlatformChange, onNegotiate, onBack, onSkillsClick);
    });

    document.getElementById('affordable-check')?.addEventListener('change', (e) => {
      this.scoutFilterAffordable = (e.target as HTMLInputElement).checked;
      this.renderScoutViewWithPlatforms(prospects, unlockedPlatforms, selectedPlatform, onPlatformChange, onNegotiate, onBack, onSkillsClick);
    });

    document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
      this.scoutFilterNiche = 'all';
      this.scoutFilterAffordable = false;
      this.renderScoutViewWithPlatforms(prospects, unlockedPlatforms, selectedPlatform, onPlatformChange, onNegotiate, onBack, onSkillsClick);
    });

    document.getElementById('back-btn')?.addEventListener('click', onBack);
    document.getElementById('skills-btn')?.addEventListener('click', () => {
      if (onSkillsClick) onSkillsClick();
    });
  }

  // Streamer detail modal with platform switching
  showStreamerDetail(
    streamer: Streamer,
    unlockedPlatforms: string[],
    onPlatformSwitch: (newPlatform: PlatformKey) => void,
    onDrop: () => void,
    onClose: () => void
  ): void {
    if (!this.container) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const currentPlatform = PLATFORMS[streamer.platform];
    const currentDay = GameManager.getCurrentDay();
    const daysLeft = streamer.contractEndDay - currentDay;

    // Build platform switch buttons
    const otherPlatforms = unlockedPlatforms.filter(p => p !== streamer.platform);
    const platformSwitchButtons = otherPlatforms.length > 0 ? otherPlatforms.map(pKey => {
      const p = PLATFORMS[pKey as keyof typeof PLATFORMS];
      return `
        <button class="btn btn-secondary platform-switch-btn" data-platform="${pKey}" style="border-color: ${p.color};">
          Switch to ${p.name}
        </button>
      `;
    }).join('') : '<div style="color: var(--text-secondary); font-size: 13px;">No other platforms unlocked yet</div>';

    backdrop.innerHTML = `
      <div class="modal" style="max-width: 500px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="scout-avatar" style="width: 64px; height: 64px;">
              <img src="${streamer.getAvatarUrl(64)}" alt="${streamer.name}" class="avatar-img">
            </div>
            <div>
              <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);">${streamer.name}</div>
              <div style="color: var(--text-secondary);">${streamer.getGenreName()}</div>
              <div style="font-size: 12px; color: var(--text-secondary); margin: 4px 0;">
                Age ${streamer.age ?? '?'} · ${streamer.experienceYears ?? 0} ${(streamer.experienceYears ?? 0) === 1 ? 'year' : 'years'} streaming
              </div>
              <span class="platform-badge platform-${currentPlatform.id}">${currentPlatform.name}</span>
            </div>
          </div>
          <button class="btn btn-secondary" id="close-detail-btn" style="padding: 4px 12px;">✕</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div style="background: var(--bg-card); border-radius: 4px; padding: 12px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px;">Followers</div>
            <div style="font-size: 18px; font-weight: 600; color: var(--text-primary);">${this.formatNumber(streamer.followers)}</div>
          </div>
          <div style="background: var(--bg-card); border-radius: 4px; padding: 12px;">
            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 4px;">Est. Weekly Revenue</div>
            <div style="font-size: 18px; font-weight: 600; color: var(--accent-green);">~$${streamer.getEstimatedWeeklyRevenue().toLocaleString()}</div>
          </div>
        </div>

        <div style="background: var(--bg-card); border-radius: 4px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">Stats</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 13px;">
            <div>Charisma: <span style="color: var(--accent-blue);">${streamer.stats.charisma}/10</span></div>
            <div>Consistency: <span style="color: var(--accent-blue);">${streamer.stats.consistency}/10</span></div>
            <div>Drama Risk: <span style="color: var(--accent-red);">${streamer.stats.dramaRisk}/10</span></div>
          </div>
        </div>

        <div style="background: var(--bg-card); border-radius: 4px; padding: 12px; margin-bottom: 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">Contract</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
            <div>Days Left: <span style="color: ${daysLeft <= 7 ? 'var(--accent-yellow)' : 'var(--text-primary)'};">${Math.max(0, daysLeft)}</span></div>
            <div>Agency Cut: <span style="color: var(--accent-green);">${Math.round(streamer.revenueSplit * 100)}%</span></div>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">Platform Migration</div>
          <div style="color: var(--accent-yellow); font-size: 12px; margin-bottom: 8px;">
            ⚠️ Switching platforms costs 40% of followers (audience doesn't fully migrate)
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${platformSwitchButtons}
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 16px; display: flex; gap: 12px;">
          <button class="btn" id="close-btn" style="flex: 1;">Close</button>
          <button class="btn btn-secondary" id="drop-btn" style="color: var(--accent-red); border-color: var(--accent-red);">Drop Streamer</button>
        </div>
      </div>
    `;

    this.container.appendChild(backdrop);

    // Bind platform switch buttons
    backdrop.querySelectorAll('.platform-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const platform = btn.getAttribute('data-platform') as PlatformKey;
        if (platform) {
          this.closeModalWithAnimation(backdrop, () => {
            this.showPlatformSwitchConfirm(streamer, platform, onPlatformSwitch, () => {
              this.showStreamerDetail(streamer, unlockedPlatforms, onPlatformSwitch, onDrop, onClose);
            });
          });
        }
      });
    });

    document.getElementById('close-detail-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onClose);
    });

    document.getElementById('close-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onClose);
    });

    document.getElementById('drop-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, () => {
        this.showDropConfirm(streamer, onDrop, () => {
          this.showStreamerDetail(streamer, unlockedPlatforms, onPlatformSwitch, onDrop, onClose);
        });
      });
    });
  }

  // Confirm platform switch
  private showPlatformSwitchConfirm(
    streamer: Streamer,
    newPlatform: PlatformKey,
    onConfirm: (platform: PlatformKey) => void,
    onCancel: () => void
  ): void {
    if (!this.container) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const platform = PLATFORMS[newPlatform];
    const newFollowers = Math.floor(streamer.followers * 0.6);

    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">🔄 Confirm Platform Switch</div>
        <div class="modal-body">
          <div style="margin-bottom: 12px;">
            Move <strong>${streamer.name}</strong> to <span style="color: ${platform.color}; font-weight: 600;">${platform.name}</span>?
          </div>
          <div style="background: var(--bg-card); border-radius: 4px; padding: 12px; margin-bottom: 12px;">
            <div style="color: var(--accent-red); margin-bottom: 8px;">
              ⚠️ This will cost 40% of their followers
            </div>
            <div style="font-size: 13px;">
              ${this.formatNumber(streamer.followers)} → ${this.formatNumber(newFollowers)} followers
            </div>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary);">
            ${platform.description}
          </div>
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn" id="confirm-switch-btn" style="flex: 1; background: ${platform.color};">Switch to ${platform.name}</button>
          <button class="btn btn-secondary" id="cancel-switch-btn">Cancel</button>
        </div>
      </div>
    `;

    this.container.appendChild(backdrop);

    document.getElementById('confirm-switch-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, () => onConfirm(newPlatform));
    });

    document.getElementById('cancel-switch-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onCancel);
    });
  }

  // Confirm drop streamer
  private showDropConfirm(
    streamer: Streamer,
    onConfirm: () => void,
    onCancel: () => void
  ): void {
    if (!this.container) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">👋 Drop Streamer</div>
        <div class="modal-body">
          <div style="margin-bottom: 12px;">
            Are you sure you want to drop <strong>${streamer.name}</strong>?
          </div>
          <div style="color: var(--accent-yellow); font-size: 13px;">
            They will leave immediately with no compensation. This cannot be undone.
          </div>
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-secondary" id="cancel-drop-btn" style="flex: 1;">Keep Them</button>
          <button class="btn" id="confirm-drop-btn" style="background: var(--accent-red);">Drop Streamer</button>
        </div>
      </div>
    `;

    this.container.appendChild(backdrop);

    document.getElementById('confirm-drop-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onConfirm);
    });

    document.getElementById('cancel-drop-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onCancel);
    });
  }

  // Main menu
  renderMainMenu(hasSave: boolean, onNewGame: () => void, onContinue: () => void): void {
    if (!this.container) return;
    this.clear();

    const menu = document.createElement('div');
    menu.className = 'main-menu';
    menu.innerHTML = `
      <div class="menu-title">StreamLord</div>
      <div class="menu-subtitle">Agency Tycoon</div>
      <div class="menu-buttons">
        <button class="btn menu-btn" id="new-game-btn">New Game</button>
        ${hasSave ? '<button class="btn btn-secondary menu-btn" id="continue-btn">Continue</button>' : ''}
      </div>
    `;

    this.container.appendChild(menu);

    document.getElementById('new-game-btn')?.addEventListener('click', onNewGame);
    document.getElementById('continue-btn')?.addEventListener('click', onContinue);
  }

  private formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  // Helper to render a scout stat bar with uncertainty
  private renderScoutStatBar(
    label: string,
    stat: { display: string; min: number | null; max: number | null; exact: boolean },
    color: string = 'var(--accent-blue)'
  ): string {
    const isHidden = isStatHidden(stat);
    const width = getStatBarWidth(stat);

    if (isHidden) {
      return `
        <div class="scout-stat">
          <div class="scout-stat-label">${label} <span class="stat-unknown">???</span></div>
          <div class="scout-stat-bar stat-hidden"><div class="scout-stat-fill stat-unknown-fill" style="width: 100%"></div></div>
        </div>
      `;
    }

    return `
      <div class="scout-stat">
        <div class="scout-stat-label">${label} ${!stat.exact ? `<span class="stat-range">${stat.display}</span>` : `<span class="stat-value">${stat.display}</span>`}</div>
        <div class="scout-stat-bar ${!stat.exact ? 'stat-uncertain' : ''}"><div class="scout-stat-fill" style="width: ${width}%; background: ${color};"></div></div>
      </div>
    `;
  }

  // Scouting skill upgrade panel
  renderScoutingSkillPanel(onUpgrade: () => void, onClose: () => void): void {
    if (!this.container) return;

    const agency = GameManager.getAgency();
    const currentTier = agency.getCurrentScoutingTier();
    const nextTier = agency.getNextScoutingTier();
    const canAfford = nextTier ? agency.money >= nextTier.cost : false;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal" style="max-width: 450px;">
        <div class="modal-header">🔍 Scouting Skills</div>
        <div style="margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="font-size: 32px;">🎯</div>
            <div>
              <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${currentTier.name}</div>
              <div style="font-size: 13px; color: var(--text-secondary);">${currentTier.description}</div>
            </div>
          </div>
          <div style="background: var(--bg-card); border-radius: 4px; padding: 12px; font-size: 13px;">
            <div style="color: var(--text-secondary); margin-bottom: 8px;">Current Abilities:</div>
            <div style="display: grid; gap: 4px;">
              <div>• Consistency: <span style="color: var(--accent-green);">Always visible</span></div>
              <div>• Charisma: <span style="color: ${currentTier.charismaRange === null ? 'var(--accent-red)' : currentTier.charismaRange === 0 ? 'var(--accent-green)' : 'var(--accent-yellow)'};">${currentTier.charismaRange === null ? 'Hidden' : currentTier.charismaRange === 0 ? 'Exact' : `±${Math.floor(currentTier.charismaRange / 2)} range`}</span></div>
              <div>• Drama Risk: <span style="color: ${currentTier.dramaRange === null ? 'var(--accent-red)' : currentTier.dramaRange === 0 ? 'var(--accent-green)' : 'var(--accent-yellow)'};">${currentTier.dramaRange === null ? 'Hidden' : currentTier.dramaRange === 0 ? 'Exact' : `±${Math.floor(currentTier.dramaRange / 2)} range`}</span></div>
            </div>
          </div>
        </div>

        ${nextTier ? `
        <div style="border-top: 1px solid var(--border-color); padding-top: 16px; margin-bottom: 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 12px;">Next Tier</div>
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="font-size: 32px;">⬆️</div>
            <div>
              <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${nextTier.name}</div>
              <div style="font-size: 13px; color: var(--text-secondary);">${nextTier.description}</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="color: var(--accent-green); font-size: 16px; font-weight: 600;">$${nextTier.cost.toLocaleString()}</div>
            <button class="btn ${canAfford ? 'btn-success' : ''}" id="upgrade-btn" ${!canAfford ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              ${canAfford ? 'Upgrade' : 'Cannot Afford'}
            </button>
          </div>
        </div>
        ` : `
        <div style="border-top: 1px solid var(--border-color); padding-top: 16px; margin-bottom: 16px; text-align: center;">
          <div style="font-size: 24px; margin-bottom: 8px;">🏆</div>
          <div style="color: var(--accent-green); font-weight: 600;">Maximum Level Reached!</div>
          <div style="font-size: 13px; color: var(--text-secondary);">You have mastered the art of talent scouting.</div>
        </div>
        `}

        <button class="btn btn-secondary" id="close-skill-btn" style="width: 100%;">Close</button>
      </div>
    `;

    this.container.appendChild(backdrop);

    if (nextTier && canAfford) {
      document.getElementById('upgrade-btn')?.addEventListener('click', () => {
        this.closeModalWithAnimation(backdrop, onUpgrade);
      });
    }

    document.getElementById('close-skill-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onClose);
    });
  }

  // ==========================================
  // WORLD UI COMPONENTS
  // ==========================================

  /**
   * Show the weekly summary modal after world simulation
   */
  showWeeklySummary(result: WeeklySimulationResult, onContinue: () => void): void {
    if (!this.container) {
      onContinue();
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop weekly-summary-backdrop';

    // Get agency rankings to find player position
    const playerRank = this.getPlayerAgencyRank();
    const playerRankChange = 0; // Would need previous week to calculate

    // Format news highlights
    const newsHighlights = result.snapshot.newsEvents?.slice(-5) || [];

    backdrop.innerHTML = `
      <div class="modal weekly-summary-modal">
        <div class="weekly-summary-header">
          <div class="weekly-summary-week">Week ${result.weekNumber}</div>
          <div class="weekly-summary-title">Weekly Summary</div>
        </div>

        <div class="weekly-summary-content">
          <!-- World Changes Section -->
          <div class="summary-section">
            <div class="summary-section-title">📈 World Changes</div>
            <div class="summary-stats-grid">
              <div class="summary-stat">
                <span class="summary-stat-value">${result.newStreamers.length}</span>
                <span class="summary-stat-label">New Streamers</span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-value">${result.retirements.length}</span>
                <span class="summary-stat-label">Retirements</span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-value">${result.comebacks.length}</span>
                <span class="summary-stat-label">Comebacks</span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-value">${result.snapshot.totalActiveStreamers}</span>
                <span class="summary-stat-label">Active Streamers</span>
              </div>
            </div>
          </div>

          <!-- Trend Update Section -->
          ${(result.trendChanges.started.length > 0 || result.trendChanges.ended.length > 0) ? `
          <div class="summary-section">
            <div class="summary-section-title">🔥 Trend Update</div>
            <div class="trend-changes">
              ${result.trendChanges.started.map(t => `
                <div class="trend-change trend-started">
                  <span class="trend-icon">✨</span>
                  <span class="trend-name">${t.name}</span>
                  <span class="trend-effect">${t.followerMultiplier > 1 ? '+' : ''}${Math.round((t.followerMultiplier - 1) * 100)}% growth</span>
                </div>
              `).join('')}
              ${result.trendChanges.ended.map(t => `
                <div class="trend-change trend-ended">
                  <span class="trend-icon">⏹️</span>
                  <span class="trend-name">${t.name}</span>
                  <span class="trend-effect">Ended</span>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          <!-- Your Agency Section -->
          <div class="summary-section">
            <div class="summary-section-title">🏆 Your Agency</div>
            <div class="agency-summary">
              <div class="agency-rank">
                <span class="rank-number">#${playerRank}</span>
                <span class="rank-change ${playerRankChange > 0 ? 'rank-up' : playerRankChange < 0 ? 'rank-down' : ''}">
                  ${playerRankChange > 0 ? `▲ ${playerRankChange}` : playerRankChange < 0 ? `▼ ${Math.abs(playerRankChange)}` : '—'}
                </span>
              </div>
              <div class="agency-stats">
                <span>Weekly Revenue: <strong class="money">$${GameManager.getEstimatedWeeklyRevenue().toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          <!-- Top Streamers Section -->
          <div class="summary-section">
            <div class="summary-section-title">⭐ Top Streamers</div>
            <div class="top-streamers-list">
              ${result.snapshot.topStreamers.slice(0, 5).map((s, i) => `
                <div class="top-streamer-row">
                  <span class="top-rank">${i + 1}</span>
                  <span class="top-name">${s.name}</span>
                  <span class="top-followers">${this.formatNumber(s.followers)}</span>
                  <span class="top-growth ${s.growth >= 0 ? 'positive' : 'negative'}">
                    ${s.growth >= 0 ? '+' : ''}${s.growth}%
                  </span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Headlines Section -->
          ${newsHighlights.length > 0 ? `
          <div class="summary-section">
            <div class="summary-section-title">📰 Headlines</div>
            <div class="news-headlines">
              ${newsHighlights.map(n => `
                <div class="headline-item">
                  <span class="headline-icon">${this.getNewsIcon(n.type)}</span>
                  <span class="headline-text">${n.title}</span>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}
        </div>

        <button class="btn weekly-summary-continue" id="weekly-continue-btn">Continue</button>
      </div>
    `;

    this.container.appendChild(backdrop);

    // Animate in
    const modal = backdrop.querySelector('.weekly-summary-modal')!;
    modal.classList.add('summary-enter');

    document.getElementById('weekly-continue-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onContinue);
    });
  }

  /**
   * Get news icon based on event type
   */
  private getNewsIcon(type: NewsEvent['type']): string {
    switch (type) {
      case 'milestone': return '🎉';
      case 'signing': return '✍️';
      case 'retirement': return '👋';
      case 'comeback': return '🔄';
      case 'trend': return '📊';
      case 'ranking': return '🏅';
      default: return '📰';
    }
  }

  /**
   * Get player's agency rank among all agencies
   */
  private getPlayerAgencyRank(): number {
    if (!WorldState.isInitialized) return 1;

    const aiAgencies = WorldState.getAIAgencies();
    const roster = GameManager.getRoster();

    // Calculate player's score
    const playerFollowers = roster.reduce((sum, s) => sum + s.followers, 0);
    const playerRevenue = GameManager.getEstimatedWeeklyRevenue();
    const playerReputation = GameManager.getAgency().reputation;
    const playerScore = playerFollowers * 0.3 + playerRevenue * 0.3 + playerReputation * 100 * 0.2;

    // Calculate AI scores and compare
    let rank = 1;
    for (const agency of aiAgencies) {
      const agencyRoster = WorldState.getAgencyRoster(agency.id);
      const agencyFollowers = agencyRoster.reduce((sum, s) => sum + s.followers, 0);
      const agencyScore = agencyFollowers * 0.3 + agency.weeklyRevenue * 0.3 + agency.reputation * 100 * 0.2;

      if (agencyScore > playerScore) {
        rank++;
      }
    }

    return rank;
  }

  /**
   * Render the World Rankings panel - with incremental updates
   */
  renderWorldRankingsPanel(): void {
    if (!this.container || !WorldState.isInitialized) return;

    const snapshot = WorldState.getLatestSnapshot();
    const aiAgencies = WorldState.getAIAgencies();
    const trends = WorldState.getActiveTrends();
    const news = WorldState.getRecentNews(5);
    const weekNumber = WorldState.weekNumber;
    const playerRank = this.getPlayerAgencyRank();

    // Create hash for dirty checking
    const rankingsData = {
      weekNumber,
      playerRank,
      topStreamers: snapshot?.topStreamers?.slice(0, 5).map(s => ({ id: s.id, followers: s.followers })) || [],
      agencies: aiAgencies.slice(0, 4).map(a => ({ id: a.id, rosterCount: a.roster.length })),
      trends: trends.map(t => ({ id: t.id, weeksRemaining: t.weeksRemaining })),
      newsIds: news.map(n => n.id),
    };
    const hash = this.simpleHash(rankingsData);

    // Check if panel exists and needs update
    let panel = document.getElementById('component-rankings') as HTMLElement | null;

    if (panel && !this.needsUpdate('rankings', hash)) {
      return; // No update needed
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'component-rankings';
      panel.className = 'world-rankings-panel panel';
      this.container.appendChild(panel);
      this.componentCache.set('rankings', { element: panel, hash: '' });
    }

    panel.innerHTML = `
      <div class="panel-header">World Rankings <span class="week-badge">Week ${weekNumber}</span></div>

      <!-- Top Streamers -->
      <div class="rankings-section">
        <div class="rankings-section-title">Top Streamers</div>
        <div class="rankings-list">
          ${(snapshot?.topStreamers || []).slice(0, 5).map((s, i) => `
            <div class="ranking-row">
              <span class="rank-position">${i + 1}</span>
              <span class="rank-name">${s.name}</span>
              <span class="rank-value">${this.formatNumber(s.followers)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Agency Rankings -->
      <div class="rankings-section">
        <div class="rankings-section-title">Agencies</div>
        <div class="rankings-list">
          <div class="ranking-row ${playerRank === 1 ? 'rank-highlight' : ''}">
            <span class="rank-position">${playerRank}</span>
            <span class="rank-name">Your Agency</span>
            <span class="rank-value player">You</span>
          </div>
          ${aiAgencies.slice(0, 4).map((a, i) => `
            <div class="ranking-row">
              <span class="rank-position">${i + 2 > playerRank ? i + 2 : i + 1}</span>
              <span class="rank-name" style="color: ${a.color}">${a.name}</span>
              <span class="rank-value">${a.roster.length} talent</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Active Trends -->
      ${trends.length > 0 ? `
      <div class="rankings-section">
        <div class="rankings-section-title">Active Trends</div>
        <div class="trends-list">
          ${trends.map(t => `
            <div class="trend-row">
              <span class="trend-name">${t.name}</span>
              <span class="trend-duration">${t.weeksRemaining}w left</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Recent News -->
      ${news.length > 0 ? `
      <div class="rankings-section">
        <div class="rankings-section-title">Recent News</div>
        <div class="news-list">
          ${news.map(n => `
            <div class="news-row">
              <span class="news-icon">${this.getNewsIcon(n.type)}</span>
              <span class="news-text">${n.title}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    `;

    this.updateComponentHash('rankings', hash);
  }

  // ============================================
  // WEEKLY SYSTEM UI METHODS
  // ============================================

  /**
   * Show the pre-week setup screen where player configures all streamers
   */
  showPreWeekSetup(
    roster: Streamer[],
    currentSchedules: Map<string, WeeklySchedule>,
    unlockedPlatforms: string[],
    onConfirm: (schedules: Map<string, WeeklySchedule>) => void
  ): void {
    if (!this.container) {
      onConfirm(currentSchedules);
      return;
    }

    const weekNumber = GameManager.getCurrentWeek() + 1;

    // Create a working copy of schedules
    const workingSchedules = new Map<string, WeeklySchedule>();
    for (const streamer of roster) {
      const existing = currentSchedules.get(streamer.id);
      if (existing) {
        workingSchedules.set(streamer.id, { ...existing });
      } else {
        workingSchedules.set(streamer.id, createDefaultSchedule(streamer.id, streamer.platform));
      }
    }

    // Track which streamer is selected
    let selectedStreamerId = roster.length > 0 ? roster[0].id : null;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop pre-week-backdrop';

    const renderSetupUI = () => {
      const totalEstRevenue = roster.reduce((sum, s) => {
        const schedule = workingSchedules.get(s.id);
        if (!schedule) return sum;
        return sum + s.getWeeklyStreamingRevenue(schedule) + getEstimatedSponsorshipRevenue(s, schedule);
      }, 0);

      backdrop.innerHTML = `
        <div class="pre-week-screen">
          <div class="pre-week-header">
            <div class="pre-week-title">Week ${weekNumber} Planning</div>
            <div class="pre-week-estimate">Est. Revenue: <span class="money">$${totalEstRevenue.toLocaleString()}</span></div>
          </div>

          <div class="pre-week-content">
            <!-- Roster List -->
            <div class="pre-week-roster">
              <div class="pre-week-roster-header">Your Roster</div>
              <div class="pre-week-roster-list" id="roster-list">
                ${roster.map(streamer => {
                  const schedule = workingSchedules.get(streamer.id)!;
                  const estRev = streamer.getWeeklyStreamingRevenue(schedule) + getEstimatedSponsorshipRevenue(streamer, schedule);
                  const isSelected = streamer.id === selectedStreamerId;
                  const statusIcon = schedule.takingBreak ? '💤' :
                    streamer.burnout >= 70 ? '⚠️' :
                    streamer.contractEndDay <= GameManager.getCurrentDay() + 7 ? '⏰' : '✓';

                  return `
                    <div class="pre-week-streamer-row ${isSelected ? 'selected' : ''}" data-streamer-id="${streamer.id}">
                      <div class="streamer-avatar-small" style="background: ${streamer.avatarColor}">
                        ${streamer.getInitials()}
                      </div>
                      <div class="streamer-info-brief">
                        <div class="streamer-name-brief">${streamer.name}</div>
                        <div class="streamer-meta-brief">
                          ${streamer.getGenreName()} · ${this.formatNumber(streamer.followers)}
                        </div>
                      </div>
                      <div class="streamer-week-status">
                        <div class="status-icon">${statusIcon}</div>
                        <div class="est-revenue">$${estRev.toLocaleString()}</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Schedule Editor -->
            <div class="pre-week-editor" id="schedule-editor">
              ${selectedStreamerId ? this.renderScheduleEditor(
                roster.find(s => s.id === selectedStreamerId)!,
                workingSchedules.get(selectedStreamerId)!,
                unlockedPlatforms
              ) : '<div class="no-selection">Select a streamer to configure their week</div>'}
            </div>
          </div>

          <div class="pre-week-footer">
            <button class="btn btn-secondary" id="cancel-week-btn">Cancel</button>
            <button class="btn btn-primary" id="start-week-btn">Start Week →</button>
          </div>
        </div>
      `;

      // Bind event listeners
      backdrop.querySelectorAll('.pre-week-streamer-row').forEach(row => {
        row.addEventListener('click', () => {
          selectedStreamerId = row.getAttribute('data-streamer-id');
          renderSetupUI();
        });
      });

      // Hours slider
      const hoursSlider = backdrop.querySelector('#hours-slider') as HTMLInputElement;
      if (hoursSlider && selectedStreamerId) {
        hoursSlider.addEventListener('input', () => {
          const schedule = workingSchedules.get(selectedStreamerId!)!;
          schedule.totalHoursPerWeek = parseInt(hoursSlider.value);
          // Update primary platform allocation to match
          if (schedule.platformAllocations.length > 0) {
            schedule.platformAllocations[0].hoursPerWeek = schedule.totalHoursPerWeek;
          }
          renderSetupUI();
        });
      }

      // Break toggle
      const breakToggle = backdrop.querySelector('#break-toggle') as HTMLInputElement;
      if (breakToggle && selectedStreamerId) {
        breakToggle.addEventListener('change', () => {
          const schedule = workingSchedules.get(selectedStreamerId!)!;
          schedule.takingBreak = breakToggle.checked;
          renderSetupUI();
        });
      }

      // Sponsorship toggle
      const sponsorToggle = backdrop.querySelector('#sponsor-toggle') as HTMLInputElement;
      if (sponsorToggle && selectedStreamerId) {
        sponsorToggle.addEventListener('change', () => {
          const schedule = workingSchedules.get(selectedStreamerId!)!;
          schedule.sponsorshipOptIn = sponsorToggle.checked;
          renderSetupUI();
        });
      }

      // Platform allocation changes
      unlockedPlatforms.forEach(platform => {
        const platformSlider = backdrop.querySelector(`#platform-${platform}-slider`) as HTMLInputElement;
        if (platformSlider && selectedStreamerId) {
          platformSlider.addEventListener('input', () => {
            const schedule = workingSchedules.get(selectedStreamerId!)!;
            const hours = parseInt(platformSlider.value);

            // Find or create allocation for this platform
            let allocation = schedule.platformAllocations.find(a => a.platform === platform);
            if (!allocation && hours >= 5) {
              allocation = { platform: platform as PlatformKey, hoursPerWeek: hours };
              schedule.platformAllocations.push(allocation);
            } else if (allocation) {
              allocation.hoursPerWeek = hours;
            }

            // Remove allocations with < 5 hours
            schedule.platformAllocations = schedule.platformAllocations.filter(a => a.hoursPerWeek >= 5);

            // Recalculate total
            schedule.totalHoursPerWeek = schedule.platformAllocations.reduce((sum, a) => sum + a.hoursPerWeek, 0);

            renderSetupUI();
          });
        }
      });

      // Cancel button
      backdrop.querySelector('#cancel-week-btn')?.addEventListener('click', () => {
        this.closeModalWithAnimation(backdrop);
      });

      // Start week button
      backdrop.querySelector('#start-week-btn')?.addEventListener('click', () => {
        this.closeModalWithAnimation(backdrop, () => onConfirm(workingSchedules));
      });
    };

    renderSetupUI();
    this.container.appendChild(backdrop);
  }

  /**
   * Render the schedule editor for a single streamer
   */
  private renderScheduleEditor(
    streamer: Streamer,
    schedule: WeeklySchedule,
    unlockedPlatforms: string[]
  ): string {
    const estStreamingRev = streamer.getWeeklyStreamingRevenue(schedule);
    const estSponsorRev = getEstimatedSponsorshipRevenue(streamer, schedule);
    const burnoutChange = streamer.calculateBurnoutChange(schedule);
    const projectedBurnout = Math.max(0, Math.min(100, streamer.burnout + burnoutChange));

    // Calculate hours per platform
    const platformHours: Record<string, number> = {};
    for (const platform of unlockedPlatforms) {
      const allocation = schedule.platformAllocations.find(a => a.platform === platform);
      platformHours[platform] = allocation?.hoursPerWeek || 0;
    }

    const contractDaysLeft = streamer.contractEndDay - GameManager.getCurrentDay();

    return `
      <div class="editor-header">
        <div class="editor-streamer-name">${streamer.name}</div>
        <div class="editor-streamer-meta">${streamer.getGenreName()} · Age ${streamer.age} · ${streamer.experienceYears}yr exp</div>
      </div>

      <div class="editor-section">
        <div class="editor-section-title">Streaming Hours</div>
        <div class="hours-control">
          <input type="range" id="hours-slider" min="${CONFIG.HOURS_MIN_PER_WEEK}" max="${CONFIG.HOURS_MAX_PER_WEEK}"
            value="${schedule.totalHoursPerWeek}" ${schedule.takingBreak ? 'disabled' : ''}>
          <div class="hours-display">
            <span class="hours-value">${schedule.totalHoursPerWeek}</span> hrs/week
          </div>
        </div>
        <div class="hours-warning ${schedule.totalHoursPerWeek > CONFIG.BURNOUT_HEAVY_THRESHOLD ? 'visible' : ''}">
          ⚠️ Heavy schedule increases burnout
        </div>
      </div>

      <div class="editor-section">
        <div class="editor-section-title">Platform Split</div>
        <div class="platform-allocation">
          ${unlockedPlatforms.map(platform => {
            const platformData = PLATFORMS[platform as PlatformKey];
            const hours = platformHours[platform];
            return `
              <div class="platform-row">
                <div class="platform-info">
                  <span class="platform-name" style="color: ${platformData.color}">${platformData.name}</span>
                  <span class="platform-hours">${hours}hrs</span>
                </div>
                <input type="range" id="platform-${platform}-slider" min="0" max="60"
                  value="${hours}" ${schedule.takingBreak ? 'disabled' : ''}>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="editor-section">
        <div class="editor-section-title">Options</div>
        <div class="editor-toggles">
          <label class="toggle-row">
            <input type="checkbox" id="break-toggle" ${schedule.takingBreak ? 'checked' : ''}>
            <span>Take Break (no streaming, recover burnout)</span>
          </label>
          <label class="toggle-row">
            <input type="checkbox" id="sponsor-toggle" ${schedule.sponsorshipOptIn ? 'checked' : ''} ${schedule.takingBreak ? 'disabled' : ''}>
            <span>Accept Sponsorships</span>
          </label>
        </div>
      </div>

      <div class="editor-section">
        <div class="editor-section-title">Projections</div>
        <div class="projections-grid">
          <div class="projection-item">
            <span class="projection-label">Streaming</span>
            <span class="projection-value money">$${estStreamingRev.toLocaleString()}</span>
          </div>
          <div class="projection-item">
            <span class="projection-label">Sponsors (est.)</span>
            <span class="projection-value money">~$${estSponsorRev.toLocaleString()}</span>
          </div>
          <div class="projection-item">
            <span class="projection-label">Burnout</span>
            <span class="projection-value ${projectedBurnout >= 70 ? 'burnout-high' : projectedBurnout >= 50 ? 'burnout-med' : ''}">
              ${streamer.burnout}% → ${Math.round(projectedBurnout)}%
              <span class="${burnoutChange > 0 ? 'burnout-up' : 'burnout-down'}">(${burnoutChange > 0 ? '+' : ''}${Math.round(burnoutChange)})</span>
            </span>
          </div>
          <div class="projection-item">
            <span class="projection-label">Contract</span>
            <span class="projection-value ${contractDaysLeft <= 7 ? 'contract-expiring' : ''}">${contractDaysLeft} days left</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Show weekly results summary after simulation
   */
  showWeeklyAgencyResults(result: AgencyWeeklyResult, onContinue: () => void): void {
    if (!this.container) {
      onContinue();
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop weekly-results-backdrop';

    // Sort streamers by revenue for display
    const sortedResults = [...result.streamerResults].sort((a, b) => b.agencyRevenue - a.agencyRevenue);

    backdrop.innerHTML = `
      <div class="modal weekly-results-modal">
        <div class="weekly-results-header">
          <div class="results-week">Week ${result.weekNumber}</div>
          <div class="results-title">Results</div>
        </div>

        <div class="weekly-results-summary">
          <div class="results-total">
            <div class="results-total-label">Total Revenue</div>
            <div class="results-total-value money">$${result.totalRevenue.toLocaleString()}</div>
          </div>
          <div class="results-breakdown">
            <div class="breakdown-item">
              <span class="breakdown-label">Streaming</span>
              <span class="breakdown-value">$${result.streamingRevenue.toLocaleString()}</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-label">Sponsorships</span>
              <span class="breakdown-value">$${result.sponsorshipRevenue.toLocaleString()}</span>
            </div>
          </div>
          <div class="results-treasury">
            Treasury: <span class="money">$${result.moneyBefore.toLocaleString()}</span> →
            <span class="${result.moneyAfter >= 0 ? 'money' : 'debt'}">$${result.moneyAfter.toLocaleString()}</span>
          </div>
        </div>

        <div class="weekly-results-streamers">
          <div class="results-streamers-header">Streamer Performance</div>
          <div class="results-streamers-list">
            ${sortedResults.map(sr => this.renderStreamerResult(sr)).join('')}
          </div>
        </div>

        ${result.contractsExpiringSoon.length > 0 ? `
          <div class="results-warnings">
            <div class="warning-icon">⏰</div>
            <div class="warning-text">
              Contract expiring soon: ${result.contractsExpiringSoon.map(id => {
                const streamer = GameManager.getRoster().find(s => s.id === id);
                return streamer?.name || 'Unknown';
              }).join(', ')}
            </div>
          </div>
        ` : ''}

        <button class="btn weekly-results-continue" id="results-continue-btn">Continue</button>
      </div>
    `;

    this.container.appendChild(backdrop);

    backdrop.querySelector('#results-continue-btn')?.addEventListener('click', () => {
      this.closeModalWithAnimation(backdrop, onContinue);
    });
  }

  /**
   * Render a single streamer's weekly result
   */
  private renderStreamerResult(sr: StreamerWeeklyResult): string {
    const followerClass = sr.totalNewFollowers >= 0 ? 'positive' : 'negative';
    const followerSign = sr.totalNewFollowers >= 0 ? '+' : '';

    // Platform breakdown
    const platformBreakdown = sr.platformResults.map(pr => {
      const platform = PLATFORMS[pr.platform];
      return `
        <div class="platform-result">
          <span class="platform-name-small" style="color: ${platform.color}">${platform.name}</span>
          <span class="platform-stats">${pr.hoursStreamed}hrs · ${this.formatNumber(pr.viewsGenerated)} views</span>
        </div>
      `;
    }).join('');

    // Sponsorship info
    const sponsorInfo = sr.sponsorships.length > 0
      ? sr.sponsorships.map(s => `<span class="sponsor-badge">${s.sponsorName} ($${s.agencyCut})</span>`).join(' ')
      : '';

    // Events
    const eventsInfo = sr.events.length > 0
      ? `<div class="streamer-events">${sr.events.map(e => `<span class="event-badge">${e}</span>`).join(' ')}</div>`
      : '';

    // Burnout indicator
    const burnoutClass = sr.burnoutAfter >= 70 ? 'burnout-critical' : sr.burnoutAfter >= 50 ? 'burnout-warning' : '';
    const burnoutChange = sr.burnoutChange > 0 ? `+${Math.round(sr.burnoutChange)}` : Math.round(sr.burnoutChange).toString();

    return `
      <div class="streamer-result-row ${sr.wasOnBreak ? 'on-break' : ''}">
        <div class="result-main">
          <div class="result-name">${sr.streamerName}${sr.wasOnBreak ? ' 💤' : ''}</div>
          <div class="result-metrics">
            <span class="result-followers ${followerClass}">${followerSign}${this.formatNumber(sr.totalNewFollowers)}</span>
            <span class="result-revenue money">$${sr.agencyRevenue.toLocaleString()}</span>
            <span class="result-burnout ${burnoutClass}">${sr.burnoutAfter}% (${burnoutChange})</span>
          </div>
        </div>
        ${!sr.wasOnBreak ? `
          <div class="result-details">
            <div class="platform-breakdown">${platformBreakdown}</div>
            ${sponsorInfo ? `<div class="sponsor-info">${sponsorInfo}</div>` : ''}
            ${eventsInfo}
          </div>
        ` : '<div class="break-message">Took a break - recovered burnout</div>'}
      </div>
    `;
  }
}

export const DOMOverlay = new DOMOverlayClass();
