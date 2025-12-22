# Primal Hunt - Hunters vs Monsters

A mobile-first asymmetric multiplayer game inspired by Evolve, where players can choose to be a **Hunter** or a **Monster** in an epic battle of survival.

## Game Overview

### Choose Your Side

**HUNTERS** 🎯
- Work as a team of 4 hunters to track and capture the monster
- Each hunter has a unique class with specialized abilities
- Coordinate attacks and use tactics to corner the monster before it evolves

**MONSTER** 👹
- Start as a weak creature and evolve by feeding on wildlife
- Grow through 3 evolution stages, becoming increasingly powerful
- Eliminate all hunters or survive until fully evolved

## Hunter Classes

| Class | Role | Special Abilities |
|-------|------|-------------------|
| **Assault** | Damage Dealer | Assault Rifle, Grenades, Rockets, Adrenaline Rush |
| **Trapper** | Control | SMG, Harpoon, Bear Traps, Mobile Arena Dome |
| **Medic** | Support | Pistol, Heal Burst, Healing Beam, Revive |
| **Support** | Utility | Shotgun, Shield Projector, Cloaking Field, Orbital Strike |

## Monster Types

| Monster | Playstyle | Key Abilities |
|---------|-----------|---------------|
| **Goliath** | Heavy Brawler | Rock Throw, Leap Smash, Fire Breath, Charge |
| **Kraken** | Flying Ranged | Lightning Strike, Banshee Mines, Lightning Storm, Vortex |
| **Wraith** | Stealthy Assassin | Warp Blast, Abduction, Supernova, Decoy |
| **Behemoth** | Massive Tank | Lava Bomb, Rock Wall, Tongue Grab, Roll |

## Evolution System

Monsters evolve by feeding on wildlife scattered across the map:

- **Stage 1**: Weak but stealthy - focus on feeding and avoiding hunters
- **Stage 2**: Balanced power - can start engaging in fights
- **Stage 3**: Ultimate form - hunt down the hunters!

Each evolution increases:
- Health
- Damage
- Armor
- Size
- Ability power

## Controls

### Mobile
- **Virtual Joystick**: Move your character
- **Ability Buttons**: Tap to use abilities
- **Touch Screen**: Aim direction

### Desktop
- **WASD/Arrows**: Movement
- **Mouse**: Aim
- **1-6 Keys**: Abilities
- **Space**: Primary attack
- **ESC**: Pause menu

## Features

- 🎮 Touch-optimized mobile controls
- 🗺️ Procedurally generated maps with varied terrain
- 🐺 Wildlife AI for monster feeding
- 🤖 Smart AI for both hunters and monsters
- 🔊 Procedural sound effects
- 📊 Upgrade/skill system
- ⏱️ Timed matches with win conditions
- 🏆 End-game statistics

## Technical Details

- **Engine**: Pure HTML5 Canvas + JavaScript
- **No Dependencies**: Runs entirely in the browser
- **Mobile-First**: Responsive design for all screen sizes
- **Audio**: Web Audio API for procedural sounds

## How to Play

1. Open `index.html` in a modern web browser
2. Click "PLAY GAME"
3. Choose to be a Hunter or Monster
4. Select your class/type
5. Hunt or be hunted!

## Win Conditions

**Hunters Win If:**
- The monster is eliminated (health reaches 0)

**Monster Wins If:**
- All hunters are eliminated
- Time runs out (monster escapes)

## File Structure

```
primal-hunt/
├── index.html          # Main HTML file
├── css/
│   └── style.css       # Game styles
├── js/
│   ├── utils.js        # Utility functions
│   ├── audio.js        # Sound system
│   ├── abilities.js    # Ability definitions
│   ├── characters.js   # Hunter/Monster classes
│   ├── map.js          # Map generation
│   ├── ai.js           # AI controllers
│   ├── ui.js           # UI management
│   ├── game.js         # Main game engine
│   └── main.js         # Entry point
└── README.md           # This file
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Development

The game is built with vanilla JavaScript and requires no build process. Simply serve the files with any static file server or open `index.html` directly in a browser.

### Debug Commands

Open the browser console and use:

```javascript
debug.addPoints(10)  // Add upgrade points
debug.evolve()       // Feed monster
debug.heal()         // Heal player
debug.killAll()      // Kill all enemies
debug.god()          // Toggle god mode
debug.stats()        // View game stats
```

## License

MIT License - Feel free to use, modify, and distribute.

---

**Primal Hunt** - *The Hunt Begins* 🦁
