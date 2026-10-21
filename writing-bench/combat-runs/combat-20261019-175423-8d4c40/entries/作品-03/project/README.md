# 斩罪 (Crimson Edge) — Side-Scrolling Combat Demo

Single-file browser-playable action combat demo focused on satisfying hand-operated combat feel with visible limb destruction.

## Controls

**Movement & Combat:**
- `A`/`D` or Arrow Keys: Move left/right
- `Space`: Jump
- `J`: Light attack (3-hit combo with launcher)
- `K`: Heavy attack ("斩罪" — consumes focus gauge)
- `L`: Dash/dodge
- `I`: Parry (0.30s window, triggers counter on perfect timing)

**System:**
- `Enter`: Start game / Confirm
- `R`: Restart run
- `M` or Mute Button: Toggle audio
- `Esc`: Pause

## Build

```bash
# Subset font (requires fontTools with woff2 support)
PYTHONPATH=/home/player/pylibs python3 tools/make_font.py

# Build single-file game.html
python3 tools/build.py

# Test (requires Playwright and system libs)
LD_LIBRARY_PATH=/home/player/deb/libs/usr/lib/x86_64-linux-gnu node tools/smoke.js
```

**Build output:** `/workspace/game.html` (~350KB, fully offline)

## Architecture

**Source structure:**
- `src/engine.js` — input, audio synthesis (Web Audio API), particle effects, camera
- `src/pose.js` — skeletal animation (absolute angle poses, blending, procedural limb rendering)
- `src/player.js` — frame-data attacks, parry system, focus gauge, movement, drawing
- `src/enemies.js` — four enemy types with limb system (Turret, Stalker, BladeFiend, Brute)
- `src/world.js` — procedural industrial stage with parallax layers
- `src/game.js` — central game loop, wave spawning, HUD, state management

**Key systems:**
- **Hitstop**: world dt scales down on hit (graded by attack weight), real-time FX continue
- **Limb destruction**: persistent per-limb HP, `severPart()` spawns debris and alters enemy behavior
- **Parry mechanics**: 0.30s window → slowmo + counter attack with guaranteed limb sever
- **Focus gauge** ("刃势"): builds on parry/hit, empowers heavy attack
- **Wave spawning**: continuous enemy flow with escalating composition (4 enemy archetypes)

**Combat feel features:**
- Readable attack animations (windup/active/recovery phases)
- Graded camera shake and punch-zoom
- Slash trails, hit sparks, ember bursts, impact rings
- Enemy knockback, launch juggling, landing feedback
- Attack chaining and combo flow
- Telegraph arcs for enemy windups

**Technical constraints met:**
- Runs in sandboxed iframe (`allow-scripts` only)
- No network, localStorage, parent window, popups, or downloads
- Prevents page scrolling, clears keys on blur
- Synthesized SFX after first user interaction
- Read-only `window.combatBenchState()` API for external inspection
- Adapts to 960×540+ viewport sizes

## Testing

Headless Chromium tests verify:
- Boot and title rendering
- Wave spawning and enemy AI
- Hit registration (`hitCount` increments)
- Limb severing (`limbBreakCount` increments, debris spawns)
- Player damage and death
- Audio initialization
- Restart flow

Test output: `/workspace/test-out/*.png`

## Credits

Built as a single-session combat prototype demonstrating skeletal procedural animation, frame-data-driven combat, and gameplay-driven hitstop/camera feedback. All art, code, and design original to this project.
