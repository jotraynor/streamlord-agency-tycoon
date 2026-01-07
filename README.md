# StreamLord Agency Tycoon

A management simulation game where you run a talent agency for live streamers. Built with Phaser 3, TypeScript, and Vite.

## Play the Game

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Gameplay

You manage a talent agency, signing streamers and helping them grow their audiences across multiple platforms.

### Core Loop
1. **Scout** new talent from the streamer pool
2. **Negotiate** contracts with signing bonuses and revenue splits
3. **Manage** your roster's weekly streaming schedules
4. **Grow** your agency by unlocking new platforms and building reputation

### Platforms
- **Switch** - Baseline platform, steady growth
- **YeTube** - Higher revenue and growth, but more volatile
- **OhFans** - Premium revenue, slower growth, higher drama risk

### Streamer Stats
- **Charisma** - Affects revenue and follower growth
- **Skill** - Base streaming quality
- **Consistency** - Reduces volatility
- **Adaptability** - Platform switching ability
- **Loyalty** - Contract renewal likelihood
- **Ambition** - Growth drive (affects demands)
- **Drama Risk** - Chance of negative events

### Burnout System
Streaming too many hours leads to burnout:
- 0-50: Minimal impact
- 51-70: Moderate revenue/growth penalties
- 71-90: Severe penalties (up to -45%)
- 90+: Critical - streamer may retire

### Living World
- 500+ AI streamers competing for viewers
- 5 AI agencies with different strategies
- Weekly world simulation with rankings
- Streamers age, retire, and make comebacks

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview build
```

## Tech Stack
- [Phaser 3](https://phaser.io/) - Game framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vite](https://vitejs.dev/) - Build tool

## License

ISC
