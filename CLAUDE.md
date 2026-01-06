# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StreamLord Agency Tycoon - A Phaser 3 game where players manage a talent agency of live streamers. Built with TypeScript, Vite, and Phaser.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Type-check and build for production
npm run preview  # Preview production build
```

## Architecture

### Core Systems

- **GameManager** (`src/core/GameManager.ts`): Singleton controlling all game state. All state modifications go through here to ensure auto-save and event emission. Never modify agency/streamer state directly.

- **EventBus** (`src/core/EventBus.ts`): Pub/sub system for decoupled communication. Scenes subscribe to events like `STATE_CHANGED`, `DAY_ADVANCED`, `GAME_OVER`.

- **SaveManager** (`src/core/SaveManager.ts`): Handles localStorage persistence with auto-save.

### Entities

- **Agency** (`src/entities/Agency.ts`): Player's agency state - money, roster, unlocked platforms, debt tracking.

- **Streamer** (`src/entities/Streamer.ts`): Talent with stats (charisma, consistency, dramaRisk, skill, adaptability, loyalty, ambition), followers, platform, contract terms. Includes age and experienceYears which affect growth rate, signing cost, and retirement probability.

- **Contract** (`src/entities/Contract.ts`): Negotiation system with multi-round offers, mood tracking, counter-offers.

### Living World System (`src/world/`)

The game features a persistent world of 500+ streamers managed by these systems:

- **WorldState** (`src/world/WorldState.ts`): Global singleton managing all streamers, AI agencies, trends, and weekly snapshots. Tracks free agents, retired streamers, and news events.

- **WorldSimulator** (`src/world/WorldSimulator.ts`): Weekly simulation engine that processes all streamers' growth, handles retirements/comebacks, generates new streamers, and updates rankings. Runs automatically at end of each in-game week.

- **AIAgency** (`src/world/AIAgency.ts`): 5 competing AI agencies (Titan Talent, Nova Management, Pulse Media, Vertex Agency, Shadow Collective) with different strategies (aggressive, conservative, niche, balanced) that sign and drop streamers.

#### Age & Experience System
- **Age** (18-55): Affects growth rate (young = faster), signing cost (young = cheaper), and retirement probability (older = higher)
- **Experience** (years streaming): Derived from career weeks, offsets age discount for veterans
- Ages progress every 52 game weeks (1 year)

### Scenes (Phaser)

- `BootScene` → `MainMenuScene` → `OfficeScene` ↔ `ScoutScene`
- OfficeScene is the main gameplay loop (advance day, manage roster)
- ScoutScene handles finding and negotiating with new talent

### UI

- **DOMOverlay** (`src/ui/DOMOverlay.ts`): All UI rendered as DOM elements overlaying the Phaser canvas. Singleton with methods for HUD, modals, panels.

### Game Systems

- **EventSystem** (`src/systems/EventSystem.ts`): Random events loaded from `src/data/events.json`. Platform-filtered, weighted random selection.

### Config

- `src/config.ts`: All game constants (economy, platforms, genres, AI agencies). Platforms have unique mechanics:
  - Switch: Baseline streaming platform
  - YeTube: Higher revenue/growth, more volatile
  - OhFans: High revenue, slow growth, double drama risk

- World constants: `WORLD_STREAMER_COUNT` (500), `AI_AGENCY_COUNT` (5), `DAYS_PER_WEEK` (7), retirement thresholds, comeback chances

## Key Patterns

- State flows through GameManager → EventBus → UI re-render
- All UI is DOM-based, not Phaser graphics
- Platforms unlock via totalRevenue thresholds
- Contracts expire and require renewal negotiation
- Bankruptcy after 7 consecutive days in debt
- Weekly simulation runs at end of each 7-day week (WorldSimulator.simulateWeek())
- World state persists in save file (schema v5)
