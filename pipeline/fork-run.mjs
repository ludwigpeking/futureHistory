// Plays one seed to the fork year with the engine's smart bot, snapshots the world, then replays
// the rest of history once per decision policy for the protagonist (and optionally with re-rolled dice).
// Usage: node fork-run.mjs <projectDirectory> <seed> <forkYear> <policyIdsCsv> <rerollIndicesCsv> <outputJson> [protagonistId]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [projectDirectory, seedText, forkYearText, policyCsv, rerollCsv, outputPath, protagonistArgument] = process.argv.slice(2);
const seed = Number(seedText);
const forkYear = Number(forkYearText);
const protagonistId = protagonistArgument || 'CHN';
const policyIds = policyCsv.split(',');
const rerollIndices = rerollCsv.split(',').map(Number);

const loaderModule = await import(pathToFileURL(join(projectDirectory, 'tools', 'loadGameData.mjs')).href);
const engine = await import(pathToFileURL(join(projectDirectory, 'engine', 'index.js')).href);
const gameData = loaderModule.loadGameData();
const eventById = {};
for (const gameEvent of gameData.events) eventById[gameEvent.id] = gameEvent;

// Decision policies: actions tried every turn (in order, while affordable) and research priorities.
const POLICIES = {
  status_quo: { label: 'Stay the course', actions: null, research: null },
  race: {
    label: 'Race for AGI',
    actions: [['accelerate_ai', 'self'], ['fund_research', 'self'], ['automate_economy', 'self'], ['fund_research', 'self']],
    research: ['recursive_code', 'multi_agent', 'automated_rnd', 'quantum_ml', 'world_model', 'strat_forecasting', 'daga', 'sim_governance', 'value_alignment', 'recursive_si', 'inter_agi_games', 'self_replicating'],
  },
  treaty: {
    label: 'Sign the treaty',
    actions: [['ai_safety_treaty', 'self'], ['restrict_ai', 'self'], ['preserve_culture', 'self'], ['invest_education', 'self']],
    research: ['agi_interp', 'formal_safety', 'value_learning', 'value_alignment', 'oversight_protocols', 'intl_treaty', 'daga', 'const_agi'],
  },
  war: {
    label: 'Go to war',
    actions: [['declare_war', 'TWN'], ['build_military', 'self'], ['cyber_attack', 'USA'], ['build_military', 'self'], ['information_warfare', 'USA']],
    research: ['autonomous_drone', 'drone_swarms', 'cyberweapons', 'ooda', 'asym_warfare', 'science_agi', 'bioweapons', 'darkweb_cults', 'open_src_weapons', 'pandemic_warfare'],
  },
  control: {
    label: 'Seize total control',
    actions: [['seize_total_control', 'self'], ['expand_surveillance', 'self'], ['restrict_internet', 'self'], ['crackdown', 'self'], ['propaganda', 'self']],
    research: ['behavioral_pred', 'social_credit', 'pred_detention', 'strategic_intel', 'panopticon', 'glass_fortress', 'bci', 'neural_surv'],
  },
};

function allActors(world) {
  return Object.values(world.countries).concat(Object.values(world.corporations), Object.values(world.nonStateActors));
}

function playScriptedTurn(world, policy) {
  const actor = engine.getActor(world, protagonistId);
  const performed = [];
  for (const actionSpec of policy.actions) {
    const result = engine.performAction(world, protagonistId, actionSpec[0], actionSpec[1] === 'self' ? protagonistId : actionSpec[1]);
    if (result.ok) performed.push({ actionId: actionSpec[0], targetId: actionSpec[1] === 'self' ? null : actionSpec[1] });
    if (actor.powerPoints <= 0 || world.status !== 'running') break;
  }
  if (policy.research) {
    const available = engine.availableTechsFor(world, protagonistId);
    const current = actor.research.techId;
    if (!current || policy.research.indexOf(current) < 0) {
      const preferred = policy.research.find(function (techId) { return available.indexOf(techId) >= 0; });
      if (preferred) engine.setResearch(world, protagonistId, preferred);
    }
  }
  return performed;
}

function createRecorder(world) {
  const firstTech = {};
  for (const actor of allActors(world)) for (const techId of actor.techs) if (!firstTech[techId]) firstTech[techId] = { year: 2024, holder: actor.id };
  return { firstTech: firstTech, events: [], decisions: [], regimeChanges: [], globals: [], seenEventCount: world.stats.eventsFired.length, seenRegimeCount: world.stats.regimeChanges.length };
}

function recordTurn(world, recorder, yearOfTurn, performed) {
  if (performed && performed.length) recorder.decisions.push({ year: yearOfTurn, actions: performed });
  const techsAnywhere = new Set();
  for (const actor of allActors(world)) for (const techId of actor.techs) {
    techsAnywhere.add(techId);
    if (!recorder.firstTech[techId]) recorder.firstTech[techId] = { year: yearOfTurn, holder: actor.id };
  }
  for (const fired of world.stats.eventsFired.slice(recorder.seenEventCount)) {
    const gameEvent = eventById[fired.eventId];
    let present;
    if (fired.targetId === 'world') present = techsAnywhere;
    else if (world.countries[fired.targetId]) present = new Set(engine.presentTechsOf(world, fired.targetId));
    else present = new Set(engine.getActor(world, fired.targetId).techs);
    const activeDrivers = gameEvent.drivers.filter(function (driver) { return present.has(driver.tech); })
      .sort(function (first, second) { return second.probability - first.probability; })
      .map(function (driver) { return { tech: driver.tech, probability: driver.probability }; });
    recorder.events.push({ year: yearOfTurn, eventId: fired.eventId, targetId: fired.targetId, scope: gameEvent.scope, category: gameEvent.category, drivers: activeDrivers });
  }
  recorder.seenEventCount = world.stats.eventsFired.length;
  for (const change of world.stats.regimeChanges.slice(recorder.seenRegimeCount)) recorder.regimeChanges.push({ year: yearOfTurn, countryId: change.countryId, from: change.from, to: change.to, cause: change.cause });
  recorder.seenRegimeCount = world.stats.regimeChanges.length;
  recorder.globals.push({ year: yearOfTurn, agiProgress: +world.globals.agiProgress.toFixed(1), aiRisk: +world.globals.aiRisk.toFixed(1), globalTension: +world.globals.globalTension.toFixed(1) });
}

function runTurns(world, recorder, policy, stopYear) {
  while (world.status === 'running' && world.year < stopYear) {
    const yearOfTurn = world.year;
    const performed = policy && policy.actions ? playScriptedTurn(world, policy) : engine.playTurnForActor(world, protagonistId, 'smart');
    engine.endTurn(world, gameData);
    recordTurn(world, recorder, yearOfTurn, performed.map(function (entry) { return { actionId: entry.actionId, targetId: entry.targetId || null }; }));
  }
}

const world = engine.createGame(gameData, { playerId: protagonistId, seed: seed, autoResearch: true, maxTurns: 60 });
const sharedRecorder = createRecorder(world);
runTurns(world, sharedRecorder, null, forkYear);
const snapshot = JSON.stringify(world);
const sharedRecorderSnapshot = JSON.stringify(sharedRecorder);

const branches = [];
for (const policyId of policyIds) {
  for (const rerollIndex of rerollIndices) {
    const branchWorld = JSON.parse(snapshot);
    if (rerollIndex > 0) branchWorld.randomState = (branchWorld.randomState + rerollIndex * 2654435761) >>> 0;
    const recorder = JSON.parse(sharedRecorderSnapshot);
    recorder.events = []; recorder.decisions = []; recorder.regimeChanges = []; recorder.globals = [];
    runTurns(branchWorld, recorder, POLICIES[policyId], 9999);
    branches.push({
      policyId: policyId, policyLabel: POLICIES[policyId].label, rerollIndex: rerollIndex,
      ending: branchWorld.ending, endReason: branchWorld.endReason, endYear: branchWorld.year - 1,
      firstTech: recorder.firstTech, events: recorder.events, decisions: recorder.decisions, regimeChanges: recorder.regimeChanges, globals: recorder.globals,
    });
  }
}
const sharedEnding = world.status === 'running' ? null : (world.ending || world.endReason);
writeFileSync(outputPath, JSON.stringify({
  seed: seed, forkYear: forkYear, protagonistId: protagonistId, sharedEnding: sharedEnding,
  shared: { firstTech: sharedRecorder.firstTech, events: sharedRecorder.events, decisions: sharedRecorder.decisions, regimeChanges: sharedRecorder.regimeChanges, globals: sharedRecorder.globals },
  branches: branches,
}));
console.log('seed', seed, 'shared ending', sharedEnding, branches.map(function (branch) { return branch.policyId + '#' + branch.rerollIndex + ':' + (branch.ending || branch.endReason) + '@' + branch.endYear; }).join(' '));
