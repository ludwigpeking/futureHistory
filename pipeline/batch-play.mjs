// Batch test plays of "The Last Day of AIs" using the game's own engine and bots.
// Usage: node batch-play.mjs <projectDirectory> <gamesPerEntity> <maxTurns> <outputJsonPath>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [projectDirectory, gamesPerEntityText, maxTurnsText, outputJsonPath] = process.argv.slice(2);
const gamesPerEntity = Number(gamesPerEntityText);
const maxTurns = Number(maxTurnsText);

const loaderModule = await import(pathToFileURL(join(projectDirectory, 'tools', 'loadGameData.mjs')).href);
const engineModule = await import(pathToFileURL(join(projectDirectory, 'engine', 'index.js')).href);
const gameData = loaderModule.loadGameData();
const eventNameById = {};
for (const gameEvent of gameData.events) eventNameById[gameEvent.id] = gameEvent.name;

// One player per actor family, played by the engine's 'smart' bot; every other actor is an NPC.
const PLAYER_ENTITIES = process.argv[6] ? process.argv[6].split(',') : ['USA', 'CHN', 'EU', 'IND', 'RUS', 'PRK', 'SGP', 'openai', 'google', 'huawei', 'mars', 'green', 'alqaeda', 'catholic'];
const SEED_OFFSET = Number(process.argv[7] || 0);

function listAllActors(world) {
  return Object.values(world.countries).concat(Object.values(world.corporations), Object.values(world.nonStateActors));
}

function playOneGame(entityId, seed) {
  const world = engineModule.createGame(gameData, { playerId: entityId, seed: seed, autoResearch: true, maxTurns: maxTurns });
  const firstTechYear = {};
  const firstTechHolder = {};
  for (const actor of listAllActors(world)) {
    for (const techId of actor.techs) { if (!(techId in firstTechYear)) { firstTechYear[techId] = world.year - 1; firstTechHolder[techId] = actor.id; } }
  }
  const yearlyGlobals = [];
  while (world.status === 'running') {
    engineModule.playTurnForActor(world, entityId, 'smart');
    const yearBeforeTurn = world.year;
    engineModule.endTurn(world, gameData);
    for (const actor of listAllActors(world)) {
      for (const techId of actor.techs) {
        if (!(techId in firstTechYear)) { firstTechYear[techId] = yearBeforeTurn; firstTechHolder[techId] = actor.id; }
      }
    }
    yearlyGlobals.push({ year: yearBeforeTurn, agiProgress: world.globals.agiProgress, aiRisk: world.globals.aiRisk, globalTension: world.globals.globalTension });
  }
  const startYear = world.year - world.turn + 1;
  return {
    entityId: entityId, seed: seed,
    ending: world.ending, endReason: world.endReason, finalYear: world.year,
    firstTechYear: firstTechYear, firstTechHolder: firstTechHolder,
    eventsFired: world.stats.eventsFired.map(function (fired) { return { year: startYear + fired.turn - 1, eventId: fired.eventId, targetId: fired.targetId, category: fired.category }; }),
    regimeChanges: world.stats.regimeChanges.map(function (change) { return { year: startYear + change.turn - 1, countryId: change.countryId, from: change.from, to: change.to, cause: change.cause }; }),
    warsStarted: world.nextWarId - 2,
    yearlyGlobals: yearlyGlobals,
    finalRegimes: Object.values(world.countries).reduce(function (counts, country) { counts[country.regime] = (counts[country.regime] || 0) + 1; return counts; }, {}),
  };
}

const results = [];
const startTime = Date.now();
for (const entityId of PLAYER_ENTITIES) {
  for (let gameIndex = 0; gameIndex < gamesPerEntity; gameIndex++) {
    results.push(playOneGame(entityId, 1000 + (gameIndex + SEED_OFFSET) * 7919));
  }
}
writeFileSync(outputJsonPath, JSON.stringify({ maxTurns: maxTurns, eventNameById: eventNameById, results: results }));
const endingCounts = {};
for (const result of results) { const key = result.ending || result.endReason; endingCounts[key] = (endingCounts[key] || 0) + 1; }
console.log('games', results.length, 'seconds', ((Date.now() - startTime) / 1000).toFixed(1), 'endings', JSON.stringify(endingCounts));
