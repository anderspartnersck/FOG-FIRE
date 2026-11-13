# FOG AND FIRE: THE LUNAR PACT

**Play it in your browser: <https://anderspartnersck.github.io/FOG-FIRE/>**

A 1v1 mech fighting game on a 2D plane. Best of three rounds, with chains, target combos, launchers, motion
specials and one super per suit. Every suit is its own 3D-rendered model, and the fight itself plays flat, the
way Gundam Battle Assault and Street Fighter do.

**Status:** a working build, not finished. Every suit is fully playable. The fighter-specific drawings (crouch,
air attacks, throws, a separate drawing for each special) are still to come, and the balance is first-pass.

> *See it with your own two eyes — the hive says obey.*

## Modes

| | |
|---|---|
| **ARCADE** | 8 duels: exhibition bouts at Pod 19, New Qom and the Underhive, then the four Great Ones of THE EXIT, then Kyle in MORNING STAR at Ishtar |
| **VERSUS CPU** | pick both suits and the stage; CPU EASY / NORMAL / HARD / HARDEST (◄ ► on the menu) |
| **VERSUS 2P** | one keyboard, or two gamepads |
| **TRAINING** | the dummy never dies; hitbox view (**TAB**), frame data, input history, dummy stand / crouch / jump / block / CPU, **R** resets |
| **MOVE LIST** | every suit's inputs, damage and startup (also on the pause menu) |
| **SQUAD WAVES** | bonus: the original co-op wave game (`waves.html`) |

## Controls

| | Player 1 | Player 2 |
|---|---|---|
| move / jump / crouch | **W A S D** | arrow keys |
| light / medium / heavy | **J K L** | numpad **1 2 3** (or **, . /**) |
| special | **I** | numpad **0** (or **'**) |
| throw | **U** (or L+M) | — (L+M) |
| super | **O** (or S+H) | — (S+H) |
| pause | **ESC** or **P** | |

Playing alone you can also use the arrow keys with **Z X C** (light / medium / heavy) and **V** (special).

**Gamepads:** stick or D-pad moves; X / Y / B = light / medium / heavy, A = special, LB = throw, triggers = super,
START = pause.

## The system

- **Chains:** light → medium → heavy, on hit or block.
- **Target combos:** a direction + button during a named normal. Each suit's are in the move list.
- **Launcher:** ↓ + heavy. Press ↑ on hit to super jump after them, then air chain; air heavy spikes them down.
- **Sweep:** ↘ + heavy (low, knockdown).
- **Specials:** ↓↘→, ↓↙←, →↓↘, [←]→ charge or [↓]↑ charge + a button. Or, on a keyboard, the special button with
  a direction (→ / ← / ↓ / ↑ / none) gives the same move.
- **Super:** ↓↘→↓↘→ + any button, or special + heavy, with a full meter. Meter builds when you hit, block and get hit.
- **Defence:** hold away to block, down-away to block lows. Overheads must be blocked standing. Throw with L+M;
  press L+M as you're grabbed to tech.

Five suits unlock after an ARCADE clear. That is the only thing the game saves in your browser.

**Options** (add to the link): `?attract=0` turns off the title demo, `?noboot` skips the opening logo.

## Credits

Created by **Joseph Coleman**, with Claude, ChatGPT, and Blender.
A Castle Killscreen game by Anders & Partners.

The 3D suits and stages are built from royalty-free BlenderKit models,
restyled and rendered for this game. Model authors: ALEX SAMUSENKO, Abbos
Mirzayev, Alojis studio Bdl, Avishka Induwara, Bridge Studio, CAN OF TEXTURES,
Crazy0_0Cat, Danil Solomyanko, Demycs, EB Adventure Photoscans, Filipe Lopes,
Filippo Lottici, Gabriel Dobrachinski, James Middleton, Mohammed Hossain, Moslem
Alipour, N9 Studio, Nandu M, OuterSpaceSimon, PKO Studio, Patrik, Per's Scan
Collection, Pierre-Louis Baril, Remnants of Eden Pierre, SHK Studio, Scarit
Editz, Soran Mohammadi, Steven Seidler, Thanh Cong, antoine f, and peeraphon
viriyahirunpaiboon.
