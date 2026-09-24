# FOG AND FIRE: THE LUNAR PACT

A co-op mech action game. Two pilots, one hive, and a cult that runs the solar system.

## ▶ [PLAY IT IN YOUR BROWSER](https://anderspartnersck.github.io/FOG-FIRE/)

A Castle Killscreen game by **Anders & Partners**.

> ### ⚠︎ Working build — not a finished game
>
> **Early.** Every mech, starfield and explosion is drawn procedurally — there is no sprite art in this game yet at all. It plays, but it looks like what it is: a blockout.
>
> The finished Castle Killscreen titles are **[SUCK UP](https://anderspartnersck.github.io/suck-up/)**
> and **[ONE-TIMER: THE HIGH TABLE](https://anderspartnersck.github.io/high-table/)**. This repo
> exists so the work can happen in the open, not because the work is done.

## About

2D side-view mech combat in the Gundam Battle Assault mould — big readable suits,
health bars, melee and charging supers, a boss-duel campaign. The tone is Gundam
Wing: pilots over machines. Pick a pilot, deploy from the Lunar Crawler, and fight
the cult outward until the bio-beasts of *Tears of Phobos*.

Tight to Joe's *FOG AND FIRE* screenplays.

> *See it with your own two eyes — the hive says obey.*

## How to play

| | |
|---|---|
| **P1** | ◄ ▼ ▲ ► move and jump · **A** jab · **S** heavy · **D** WAVE special |
| **P2** | press **C** to join · **F/H/T/G** move · **J/K/L** attacks |

Stand by a downed ally to revive them.

## What still needs work

- **No sprite art.** The whole game is procedural geometry — the concept renders exist but nothing has been drawn into the engine.
- The campaign structure is in place ahead of the art and the balance.

## Rebuilding this bundle

This repo is **generated** — never edit it directly. Everything here is built from the
private Castle Killscreen tree:

```
cd "ANDERS CASTLE KILLSCREEN/FOG AND FIRE"
python3 tools/build_pages.py
```

The bundler shrinks art by **resolution, not by pruning**: these engines build most asset
paths by string concatenation, so a static scan can't see what's used, and a wrongly-cut
sprite doesn't error — it just silently fails to draw.

## Credits

Created by **Joseph Coleman**, with Claude and ChatGPT.
Anders & Partners.

<sub>Generated from the private Castle Killscreen tree. Edit there, not here.</sub>
