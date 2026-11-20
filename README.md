# HISTORY / PATHS — The Last Day of AI, replayed

A standalone, dependency-free HTML/JS page that replays simulated futures of the game *The Last Day of AIs* on one chart drawn after Alfred H. Barr, Jr.'s 1936 diagram for *Cubism and Abstract Art*. It opens with the real past (2015–2026). From 2027 each history is a full game played by the game's own engine, drawn at the years it actually happened. Events emerge one at a time with the technology that activated them; each history leaves a trace, and the next one shows where it diverges.

## Start

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
```

and open **http://localhost:8000**. There is no install or build step. The data ships as a script (`story-data.js`), so `file://` works too. The Jost and Oswald fonts load from Google Fonts; offline, the page falls back to Futura / Century Gothic / Arial Narrow.

`Last_Day_of_AI_Pathways.html` is the portable single-file copy. Regenerate it after editing the sources:

```bash
node build-standalone.cjs
```

## What the chart shows

- **The real past (2015–2026), at the top.** Real technologies at the year they first appeared, with who made them (Transformer, 2017, Google; RLHF, 2022, OpenAI; …), and familiar real events they made possible: AlphaGo beats Lee Sedol, the Cambridge Analytica scandal, AlphaFold, the US chip export controls, ChatGPT, the pause letter, the Hollywood strikes, Bletchley Park, the Biden deepfake robocall, the EU AI Act, the Nobel prizes for AI, DeepSeek-R1 and Stargate. The source is `pipeline/real-prologue.json`. This part is shared by every history: it plays once at the start of the loop and then stays on the sheet. The real past is spread wider (70 px a year) than the future (42 px a year), because it holds several events a year.
- **The red 2027 line.** From here on, every history is simulated by the game's engine. Simulated events before 2027 are not shown. Just below the line is a strip for the game's starting conditions: technologies the game gives actors at the start that are not part of the real past, marked "held at the start" with the actor. The strip is not on the time scale.
- **A fully developed future.** Each history from 2027 draws:
  - every technology the game's actors reach (about 51), at its year and with who reached it first, linked to its prerequisites, plus about 21 the game hands out at the start, in the starting strip;
  - about one game event a year (about 47), where an event can recur in a new place ten or more years after it was last shown;
  - the more notable regime changes from the game's politics (about 7: coups, revolutions, corporate takeovers, seizures of total control), at most one every three years;
  - milestones of the game's world measures (AGI progress at 50 and 100, AI risk at 50 and 75, global tension at 60), in spaced capitals;
  - published forecasts that fit the history (`pipeline/forecasts.json`), in italics with their source: the AI 2027 scenario, Aschenbrenner, Kurzweil, IBM, the IEA, Epoch AI, Goldman Sachs, Amodei, McKinsey, the 2024 survey of AI researchers and Hinton. A forecast appears from its forecast year at the first year its conditions hold (its technology reached, any world measure met), only within its window and before the history ends; the mark says whether the history keeps the date.
- **Endings at their year.** A history's ending appears at the year the history ended, with the arrow from the technology that triggered it; when it is over, a small red square stays in the traces, so the sheet shows when futures end. The row at the foot of the sheet is only the tally of endings so far.
- **Each history at its own years.** The history being played puts every event at the year it happened in that history, so its path always runs down the sheet in time order. The red cursor sits on the event's row. An event keeps its horizontal position in every history (the embedding below) and only moves sideways if another label is in the way. A technology sits at the year it was first reached (or in the starting strip), above the events it activates and above the technologies it leads to.
- **Traces.** When a history ends, its labels fade, and its arrows plus a dot for each event remain as faint lines. Over 115 histories, each event leaves a column of dots, which shows how widely its timing varies across futures. Routes taken often grow darker.
- **Nodes:** events (lower case, 17 px), the technologies that activate them (capitals in Barr's arcs, 16 px), China's decision at 2040 (black boxes, fixed), and the endings along the foot of the sheet (fixed, with a tally).
- **Actors are marks, not nodes.** In red inside each arc is who reached the technology first; in red under each event is where it fired.
- **Tech tree:** fine arrows with open heads link each technology to the prerequisites it builds on (the game's `pre` field, and the real lineage in the prologue). A link may pass through prerequisites that are not drawn, and a link implied by a longer drawn chain is left out. In a history, a link draws on when the second of its two technologies appears; it can start from a real technology in the prologue.
- **Arrows:** technology → event (or ending), and China's decision → its own events after 2040. Arrows are vertical-tangent spline chains. They detour around words, choosing the side that crosses fewer other labels. Anything that cannot get around passes under an opaque paper backing shaped to the text.
- **Changes between histories:** events missing from the previous history get a red NEW tag, and the first of them is marked "history diverges here". At the ending, the caption counts the new events and names the events of the last history that did not happen this time.
- **Order of histories:** the first five share one past (seed 202) and differ only in China's 2040 decision. The rest mix 14 other seeds and re-rolled dice for seed 202.

## Controls

The sheet fills the window. The title, the endings tally, the caption and the transport bar float over it.

- The panels are **hidden by default**. **Show panels / Hide panels** (top right, or the H key) toggles them all at once; the choice is remembered in this browser. `?panels=shown` opens with them shown, `?panels=hidden` forces them off.
- Play / Pause (Space), Previous history, Next history.
- **Sound on / Sound off** (top right, or the M key). Sounds are synthesised in the browser (`sound.js`, Web Audio, no files) and play only while the sequence plays forward. Pitch follows the horizontal position on the sheet, on a pentatonic scale from left to right, so a cluster keeps its register. Technologies ring as small bells; events knock like a marimba, with an added fifth when the event is new and a low tritone where a history diverges; China's decision is a low drum; each ending has its own chord (Great Collapse with a rumble, the fall of the government sliding down). Browsers start audio only after a click, so sound begins with Play.
- The scrubber covers the real past and all 115 histories; Previous from the first history goes back to the real past.
- **Pace** sets steps per second (0.2–6, default 0.5). A technology takes half a step. The camera centres on each emerging event or technology.
- Hovering a name while paused explains it: for the real past, what happened; for a technology, what it builds on.
- `?at=0.31` in the URL opens at that fraction of the loop (used by the QA screenshots).

## Spatial embedding (horizontal axis)

Computed in `pipeline/build-iterations.mjs`:

1. Each node gets an ending profile: the share of each ending's histories it appears in (normalised per ending, so frequent endings do not dominate).
2. Endings are ordered by brute force over permutations so that endings sharing many events sit next to each other (cosine similarity of their profiles).
3. A node starts at the profile-weighted average of the ending positions.
4. Twelve smoothing rounds pull each event toward the events it most often shares a history with (top 5 by co-occurrence cosine) and toward the technologies that activate it, keeping 45 % of its own ending signature. Tech-tree links pull linked technologies together with a smaller weight.
5. Events are spaced evenly by rank (the embedding sets the order; even spacing keeps labels legible). Technologies sit above the events they activate; decisions are ordered by the futures they lead to. In the real past, a game technology keeps its embedded position, and the others sit between their tech-tree neighbours.

## Data pipeline

The pipeline drives the game's engine directly. Paths below assume the game lives at `../../2603_theLastDayOfAIs`.

```bash
GAME=../../2603_theLastDayOfAIs
mkdir -p pipeline/output

# 1. Ensemble: 126 full games (14 player roles × 9 seeds, 60 turns), 14 processes in parallel
node pipeline/parallel-batch.mjs $GAME 9 60 pipeline/output/ensemble.json 20
node pipeline/analyze-plays.mjs $GAME pipeline/output/ensemble.json pipeline/output/ensemble-summary.json

# 2. Forks: 14 seeds × 5 China policies from 2040, plus seed 202 × 5 policies × 9 dice rolls
node pipeline/run-forks.mjs $GAME pipeline/output/forks 202

# 3. Story graph, embedding and iteration list → story-data.js
node pipeline/build-iterations.mjs $GAME pipeline/output/forks pipeline/output/ensemble-summary.json pipeline/output/ensemble.json story-data.js

# 4. Portable copy
node build-standalone.cjs
```

| Script | Role |
| --- | --- |
| `pipeline/batch-play.mjs` | Plays full games with the engine's smart bot for given roles and records techs, events, regime changes and world metrics. |
| `pipeline/parallel-batch.mjs` | Runs `batch-play.mjs` for 14 roles in parallel and merges the results. |
| `pipeline/analyze-plays.mjs` | Summaries: endings, tech timing, event frequencies, world metrics, each terminal ending's cumulative chance. |
| `pipeline/fork-run.mjs` | Plays a seed to the fork year, snapshots the world (the RNG state lives in it), then replays history per decision policy, optionally with re-seeded dice. |
| `pipeline/run-forks.mjs` | Runs all fork experiments in parallel processes. |
| `pipeline/forecasts.json` | Published forecasts: label, forecast year, window, causing technology, required world measures, source, text. |
| `pipeline/real-prologue.json` | The real past: technologies (year, maker, game technology id where there is one, real prerequisites) and events (year with the month as a fraction, place, activating technology, text). Edit it to change the prologue, then re-run `build-iterations.mjs`. |
| `pipeline/build-iterations.mjs` | Selects each history's telling events, builds the union graph and the tech-tree links between the technologies on it, computes the embedding, writes `story-data.js`. |
| `pipeline/tune-endings.mjs` | Edits one condition range of a terminal ending in the game's `data/world_events.json`, leaving the rest of the file untouched. |

The narrated seed (202) and the fork year (2040) are set in `run-forks.mjs` and assumed by `build-iterations.mjs` (it reads `search-*.json` and `detail-202-*.json`).

### China's decision policies (from 2040)

| Policy | Scripted every turn |
| --- | --- |
| Stay the course | The engine's own smart bot |
| Race for AGI | Accelerate AI, fund research, subsidise automation; research toward recursive self-improvement |
| Sign the treaty | Champion an AI safety treaty, restrict AI, preserve culture; research alignment and constitutional AGI |
| Go to war | Declare war on Taiwan, build the military, cyber-attack and info-war the US; research military AI and bioweapons |
| Seize total control | Seize total control, expand surveillance, restrict the internet, crack down; research the panopticon line |

## Changes made to the game for this work

In `2603_theLastDayOfAIs` (uncommitted):

- `engine/world.js`: `DEFAULT_MAX_TURNS` 30 → 60, so games run 2025–2085.
- `data/world_events.json`: world-tension conditions of three endings that never fired:
  - Butlerian Accord: falls 50→25 → falls 50→27
  - Great Collapse: rises 75→95 → rises 50→75
  - Panopticon Peace: falls 35→15 → falls 45→25

Resulting ending shares in 126 games: Silicon Ascendancy 27 %, Corporate Dominion 22 %, clock runs out 10 %, Great Collapse 8 %, Panopticon Peace 6 %, Butlerian Accord 5 %, player ousted 21 %. `tools/playtest.mjs` in the game still runs 30-turn games, and its targets are calibrated for that length.

## QA

```bash
node qa/screenshots.cjs                     # index.html at the overview and four moments
node qa/screenshots.cjs Last_Day_of_AI_Pathways.html 0.31 0.6
node qa/screenshots.cjs index.html view=100,150,1500   # overview camera fixed on one region: x,y,width in sheet units
node qa/screenshots.cjs index.html "panels=hidden&at=0.31"
```

Uses headless Chrome or Edge and writes PNGs to `qa/shots/`.

## Limitations

- The game's simulation starts in 2025; its first two years are hidden behind the real prologue, so what it reached by 2027 appears in the starting strip.
- A technology placed in the same year as the event it activates is lifted about two years up the sheet so its arc fits above the event; its mark still gives the true year.
- Labels exist only for the history being played. Earlier histories are lines and dots; hover works on the live history and the real past.
- Event selection keeps about one game event a year from 2027 (scored by rarity, world scope and the protagonist); the engine fires several hundred per history.
- Most forecasts fit every history, because the game reaches their technologies early; the Singularity and Hinton's extinction odds appear only in a few.
- Each history is laid out when it is first needed; the traces of later histories fill in over a few seconds after the page opens.
- Real technologies in the prologue appear with their real maker and year even when the game's data gives a different first holder.
