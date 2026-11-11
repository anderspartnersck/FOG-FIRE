# FOG AND FIRE: THE LUNAR PACT

> **Status: working build, early, not finished.** Live at
> **[anderspartnersck.github.io/FOG-FIRE](https://anderspartnersck.github.io/FOG-FIRE/)**.
> It plays start to finish, but every mech, starfield and explosion is drawn
> procedurally. There is no sprite art in it yet, so it looks like what it is: a blockout.
>
> The finished Castle Killscreen titles are **[SUCK UP](https://anderspartnersck.github.io/suck-up/3d.html?arcade)**
> and **[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo
> exists so the work can happen in the open, not because the work is done.

A mech action game for one player, or two in co-op. One hive, and a cult that runs the solar system.

## ▶ [PLAY IT IN YOUR BROWSER](https://anderspartnersck.github.io/FOG-FIRE/)

A Castle Killscreen game by **Anders & Partners**.

## About

2D side-view mech combat in the Gundam Battle Assault mould: big readable suits,
health bars, melee and charging specials. The tone is Gundam Wing: pilots over
machines. Pick a pilot, deploy from the Lunar Crawler, and fight the cult across
seven theaters, from the Luna Dome out to Phobos and Ishtar.

Tight to Joe's *FOG AND FIRE* screenplays.

> *See it with your own two eyes — the hive says obey.*

## How to play

Boots to a Castle Killscreen ident, then the title. **ENTER** or **SPACE** goes to
pilot select. Leave the title alone and a CPU demo plays (`?attract=0` turns it off).

**Pilot select**

| | |
|---|---|
| Arrow keys | choose your pilot |
| **C** (or TAB) | co-op on/off, adds a wingman |
| **A / D** | choose the wingman's pilot |
| **X** | difficulty: NORMAL, HARD, HARDEST |
| **V** | mode: CAMPAIGN or SEEK & DESTROY (endless waves) |
| **ENTER** | deploy |

**In the fight (player 1)**

| | |
|---|---|
| ◄ ► | move |
| ▲ | jump |
| ▼ | block |
| **A** | jab |
| **S** | heavy |
| **D** | your suit's special, once the meter is full |
| **ESC** or **P** | pause (resume, how to play, back to pilot select, quit to title) |

A downed pilot is revived by a squadmate standing close by.

**Co-op.** The wingman is flown by the CPU unless a second gamepad is plugged
in. With two pads connected, player 2 takes over the wingman (pad 2, or
**T F G H** to move/jump/block and **J K L** to attack on the keyboard).

**Gamepads.** Stick or D-pad moves, A jab, X heavy, B special, START pause. In
menus A or START confirms, B goes back, SELECT toggles co-op, Y changes difficulty.

Four more pilots are locked at the start. Clearing the campaign opens three of
them; clearing it on HARDEST opens the last. Those unlocks are the only thing
the game saves in your browser.

## What still needs work

- **No sprite art.** The whole game is procedural geometry. The concept renders
  exist but nothing has been drawn into the engine.
- Balance is first-pass.

## Rebuilding this bundle

This repo is **generated**. Never edit the game files here directly. They are
built from the private Castle Killscreen tree:

```
cd "ANDERS CASTLE KILLSCREEN/FOG AND FIRE"
python3 tools/build_pages.py
```

The build copies `index.html` and `lib/ghost.js` and leaves this README alone.
The README is the one file kept by hand, in this repo.

## Credits

Created by **Joseph Coleman**, with Claude, ChatGPT, and Blender.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here.</sub>
