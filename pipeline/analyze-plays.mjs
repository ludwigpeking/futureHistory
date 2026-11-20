// Summarises batch test plays: endings, tech timing, event frequency, world metrics,
// and the cumulative chance each terminal ending had of firing in each game.
// Usage: node analyze-plays.mjs <projectDirectory> <resultsJson> [summaryJsonOut]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [projectDirectory, resultsPath, summaryOutputPath] = process.argv.slice(2);
const batch = JSON.parse(readFileSync(resultsPath, 'utf8'));
const worldEvents = JSON.parse(readFileSync(join(projectDirectory, 'data', 'world_events.json'), 'utf8'));
const worldEventList = Array.isArray(worldEvents) ? worldEvents : (worldEvents.events || Object.values(worldEvents));
const TERMINAL_IDS = ['silicon_ascendancy', 'butlerian_accord', 'great_collapse', 'corporate_dominion', 'panopticon_peace'];
const terminalEvents = worldEventList.filter(function (gameEvent) { return TERMINAL_IDS.indexOf(gameEvent.id) >= 0; });
const games = batch.results;
const gameCount = games.length;

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort(function (first, second) { return first - second; });
  return sorted[Math.floor(sorted.length / 2)];
}
function clampUnit(value) { return Math.max(0, Math.min(1, value)); }

// Endings
const endingCounts = {};
for (const game of games) { const key = game.ending || game.endReason; endingCounts[key] = (endingCounts[key] || 0) + 1; }

// Techs: share of games reached, median first year, most frequent first holder
const techSummary = {};
for (const game of games) {
  for (const techId of Object.keys(game.firstTechYear)) {
    const entry = techSummary[techId] || (techSummary[techId] = { reachedGames: 0, firstYears: [], holders: {} });
    entry.reachedGames++;
    entry.firstYears.push(game.firstTechYear[techId]);
    const holderId = game.firstTechHolder[techId];
    entry.holders[holderId] = (entry.holders[holderId] || 0) + 1;
  }
}
const techRows = Object.keys(techSummary).map(function (techId) {
  const entry = techSummary[techId];
  const topHolders = Object.entries(entry.holders).sort(function (first, second) { return second[1] - first[1]; }).slice(0, 3);
  return { techId: techId, reachedShare: entry.reachedGames / gameCount, medianFirstYear: median(entry.firstYears), topHolders: topHolders };
}).sort(function (first, second) { return first.medianFirstYear - second.medianFirstYear; });

// Events: share of games, median first year, total firings, top targets
const eventSummary = {};
for (const game of games) {
  const seenInGame = {};
  for (const fired of game.eventsFired) {
    const entry = eventSummary[fired.eventId] || (eventSummary[fired.eventId] = { games: 0, firstYears: [], firings: 0, targets: {} });
    entry.firings++;
    entry.targets[fired.targetId] = (entry.targets[fired.targetId] || 0) + 1;
    if (!seenInGame[fired.eventId]) { seenInGame[fired.eventId] = true; entry.games++; entry.firstYears.push(fired.year); }
  }
}
const eventRows = Object.keys(eventSummary).map(function (eventId) {
  const entry = eventSummary[eventId];
  return {
    eventId: eventId, name: batch.eventNameById[eventId] || eventId, gameShare: entry.games / gameCount,
    medianFirstYear: median(entry.firstYears), firingsPerGame: entry.firings / gameCount,
    topTargets: Object.entries(entry.targets).sort(function (first, second) { return second[1] - first[1]; }).slice(0, 3),
  };
}).sort(function (first, second) { return second.gameShare - first.gameShare; });

// World metrics by year (median across games)
const metricsByYear = {};
for (const game of games) {
  for (const yearly of game.yearlyGlobals) {
    const entry = metricsByYear[yearly.year] || (metricsByYear[yearly.year] = { agiProgress: [], aiRisk: [], globalTension: [] });
    entry.agiProgress.push(yearly.agiProgress); entry.aiRisk.push(yearly.aiRisk); entry.globalTension.push(yearly.globalTension);
  }
}
const metricRows = Object.keys(metricsByYear).map(Number).sort(function (first, second) { return first - second; }).map(function (year) {
  const entry = metricsByYear[year];
  return { year: year, games: entry.aiRisk.length, agiProgress: median(entry.agiProgress), aiRisk: median(entry.aiRisk), globalTension: median(entry.globalTension) };
});

// Cumulative chance of each terminal ending per game, from its drivers (techs anywhere) and world conditions.
// Country-level conditions (e.g. aiPolicy) are not recorded per year, so they are treated as fully met: an upper bound.
function terminalChanceForGame(game, terminalEvent) {
  let noFireProbability = 1;
  let peakYearlyProbability = 0;
  for (const yearly of game.yearlyGlobals) {
    let driversNotFiring = 1;
    for (const driver of terminalEvent.drivers) {
      const firstYear = game.firstTechYear[driver.tech];
      if (firstYear !== undefined && firstYear <= yearly.year) driversNotFiring *= 1 - driver.probability;
    }
    let conditionProduct = 1;
    for (const condition of terminalEvent.conditions || []) {
      if (!condition.param.startsWith('world.')) continue;
      const value = yearly[condition.param.slice(6)];
      const floor = condition.floor === undefined ? 0 : condition.floor;
      conditionProduct *= floor + (1 - floor) * clampUnit((value - condition.from) / (condition.to - condition.from));
    }
    const yearlyProbability = Math.min(0.5, (1 - driversNotFiring) * conditionProduct);
    peakYearlyProbability = Math.max(peakYearlyProbability, yearlyProbability);
    noFireProbability *= 1 - yearlyProbability;
  }
  return { cumulative: 1 - noFireProbability, peakYearly: peakYearlyProbability };
}
const terminalRows = terminalEvents.map(function (terminalEvent) {
  const chances = games.map(function (game) { return terminalChanceForGame(game, terminalEvent); });
  const driverReach = terminalEvent.drivers.map(function (driver) {
    const reached = games.filter(function (game) { return game.firstTechYear[driver.tech] !== undefined; });
    return { tech: driver.tech, probability: driver.probability, reachedShare: reached.length / gameCount, medianYear: median(reached.map(function (game) { return game.firstTechYear[driver.tech]; })) };
  });
  return {
    id: terminalEvent.id,
    meanCumulativeChance: chances.reduce(function (sum, chance) { return sum + chance.cumulative; }, 0) / gameCount,
    maxCumulativeChance: Math.max.apply(null, chances.map(function (chance) { return chance.cumulative; })),
    gamesAboveFivePercent: chances.filter(function (chance) { return chance.cumulative > 0.05; }).length,
    driverReach: driverReach,
    conditions: terminalEvent.conditions,
  };
});

// Regime changes
const regimeTransitionCounts = {};
for (const game of games) for (const change of game.regimeChanges) { const key = change.from + '→' + change.to; regimeTransitionCounts[key] = (regimeTransitionCounts[key] || 0) + 1; }
const finalRegimeTotals = {};
for (const game of games) for (const regime of Object.keys(game.finalRegimes)) finalRegimeTotals[regime] = (finalRegimeTotals[regime] || 0) + game.finalRegimes[regime] / gameCount;

const summary = {
  gameCount: gameCount, maxTurns: batch.maxTurns, endingCounts: endingCounts,
  meanWars: games.reduce(function (sum, game) { return sum + game.warsStarted; }, 0) / gameCount,
  meanRegimeChanges: games.reduce(function (sum, game) { return sum + game.regimeChanges.length; }, 0) / gameCount,
  finalRegimeTotals: finalRegimeTotals, regimeTransitionCounts: regimeTransitionCounts,
  metricRows: metricRows, terminalRows: terminalRows, techRows: techRows, eventRows: eventRows,
};
if (summaryOutputPath) writeFileSync(summaryOutputPath, JSON.stringify(summary, null, 1));

console.log('games', gameCount, 'maxTurns', batch.maxTurns, 'endings', JSON.stringify(endingCounts));
console.log('mean wars', summary.meanWars.toFixed(2), 'mean regime changes', summary.meanRegimeChanges.toFixed(2));
console.log('final regimes (mean count)', JSON.stringify(finalRegimeTotals, function (key, value) { return typeof value === 'number' ? +value.toFixed(1) : value; }));
console.log('\nWORLD METRICS (median) year agi risk tension');
metricRows.filter(function (row, index) { return index % 5 === 4 || index === metricRows.length - 1; }).forEach(function (row) { console.log(row.year, row.agiProgress.toFixed(0), row.aiRisk.toFixed(0), row.globalTension.toFixed(0), '(n=' + row.games + ')'); });
console.log('\nTERMINAL ENDINGS: mean cumulative chance | max | games>5% | drivers reached');
terminalRows.forEach(function (row) {
  console.log(row.id, (100 * row.meanCumulativeChance).toFixed(2) + '%', (100 * row.maxCumulativeChance).toFixed(1) + '%', row.gamesAboveFivePercent,
    row.driverReach.map(function (driver) { return driver.tech + ' ' + Math.round(100 * driver.reachedShare) + '%@' + driver.medianYear; }).join(', '));
});
console.log('\nTECHS (reached share, median first year, top first holders)');
techRows.forEach(function (row) { console.log(row.techId, Math.round(100 * row.reachedShare) + '%', row.medianFirstYear, row.topHolders.map(function (holder) { return holder[0] + ':' + holder[1]; }).join(' ')); });
console.log('\nTOP EVENTS (share of games, median first year, firings/game, top targets)');
eventRows.slice(0, 70).forEach(function (row) { console.log(row.eventId, '|', row.name, '|', Math.round(100 * row.gameShare) + '%', row.medianFirstYear, row.firingsPerGame.toFixed(1), row.topTargets.map(function (target) { return target[0] + ':' + target[1]; }).join(' ')); });
