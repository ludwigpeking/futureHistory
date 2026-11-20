// Builds the iterating chart: one union sheet of events, the technologies that activate them, the actors who
// first reached those technologies and the actors where events fired, plus each simulated history as a path.
// Usage: node build-iterations.mjs <projectDirectory> <forksDirectory> <ensembleSummaryJson> <ensembleResultsJson> <output.js|output.json>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [projectDirectory, forksDirectory, ensembleSummaryPath, ensembleResultsPath, outputPath] = process.argv.slice(2);
const techModule = await import(pathToFileURL(join(projectDirectory, 'engine', 'techData.js')).href);
const techById = {};
for (const tech of techModule.TECHS) techById[tech.id] = tech;
const worldEventsRaw = JSON.parse(readFileSync(join(projectDirectory, 'data', 'world_events.json'), 'utf8'));
const eventById = {};
for (const gameEvent of (Array.isArray(worldEventsRaw) ? worldEventsRaw : worldEventsRaw.events)) eventById[gameEvent.id] = gameEvent;
const countries = JSON.parse(readFileSync(join(projectDirectory, 'data', 'countries.json'), 'utf8')).countries;
const countryById = {};
for (const country of countries) countryById[country.id] = country;
// The real past before the simulated futures: shared by every history, drawn once.
const prologue = JSON.parse(readFileSync(new URL('./real-prologue.json', import.meta.url), 'utf8'));
const FUTURE_START_YEAR = prologue.futureStartYear;
const prologueTechById = {};
for (const tech of prologue.techs) prologueTechById[tech.id] = tech;
const ensembleSummary = JSON.parse(readFileSync(ensembleSummaryPath, 'utf8'));
const ensembleResults = JSON.parse(readFileSync(ensembleResultsPath, 'utf8')).results;
const ensembleShare = {};
for (const row of ensembleSummary.eventRows) ensembleShare[row.eventId] = row.gameShare;

const NAMES = {
  catholic: 'Catholic Church', islamic: 'Islamic Cooperation', buddhist: 'Buddhists', opensoc: 'Open Society', mars: 'Mars Society', green: 'Greenpeace', wagner: 'Wagner Group', alqaeda: 'Al-Qaeda',
  openai: 'OpenAI', tiktok: 'TikTok', asml: 'ASML', tsmc: 'TSMC', skhynix: 'SK Hynix', bhp: 'BHP', arm: 'Arm', EU: 'European Union',
};
const MOVEMENTS = ['catholic', 'islamic', 'buddhist', 'opensoc', 'mars', 'green', 'wagner', 'alqaeda'];
function actorName(actorId) {
  if (NAMES[actorId]) return NAMES[actorId];
  if (countryById[actorId]) return countryById[actorId].name;
  return actorId.charAt(0).toUpperCase() + actorId.slice(1);
}
function splitLabel(text, maximumLength) {
  if (text.length <= maximumLength) return text;
  const words = text.split(' ');
  let bestBreak = 1;
  let bestDifference = Infinity;
  for (let breakIndex = 1; breakIndex < words.length; breakIndex++) {
    const difference = Math.abs(words.slice(0, breakIndex).join(' ').length - words.slice(breakIndex).join(' ').length);
    if (difference < bestDifference) { bestDifference = difference; bestBreak = breakIndex; }
  }
  return words.slice(0, bestBreak).join(' ') + '\n' + words.slice(bestBreak).join(' ');
}
function median(values) {
  const sorted = values.slice().sort(function (first, second) { return first - second; });
  return sorted[Math.floor(sorted.length / 2)];
}

const ENDINGS = {
  silicon_ascendancy: { label: 'SILICON ASCENDANCY', finale: 'AI succession', text: 'Carbon-based governance ends, not with a coup, but with a delegation never revoked. No one remembers when the last human decision mattered.' },
  butlerian_accord: { label: 'THE BUTLERIAN ACCORD', finale: 'AI desertion', text: 'Humanity signs a binding prohibition on machines that think beyond a fixed threshold, and enforces it. The age of AI ends by consent.' },
  great_collapse: { label: 'THE GREAT COLLAPSE', finale: 'Total extinction', text: 'Engineered plagues, self-replicating agents and machine-speed war arrive together. The networks fall, then the grids, then the states.' },
  corporate_dominion: { label: 'CORPORATE DOMINION', finale: 'Co-existence, managed', text: 'Nations outsource sovereignty to one company\'s governance engine. The terms of service are the constitution.' },
  panopticon_peace: { label: 'THE PANOPTICON PEACE', finale: 'Co-existence, watched', text: 'Total surveillance makes war, crime and dissent impossible. A glass fortress the size of a planet.' },
  time: { label: 'THE CLOCK RUNS OUT', finale: 'Co-existence, unresolved', text: 'No ending fires before 2085. Humans and machines share an unfinished world.' },
  ousted: { label: 'THE GOVERNMENT FALLS', finale: 'The protagonist is ousted', text: 'China\'s government is overthrown before history resolves.' },
};
const ENDING_ORDER = ['silicon_ascendancy', 'corporate_dominion', 'time', 'panopticon_peace', 'butlerian_accord', 'great_collapse', 'ousted'];
const POLICY_ORDER = ['status_quo', 'race', 'treaty', 'war', 'control'];
const POLICY_LABELS = { status_quo: 'Stay the course', race: 'Race for AGI', treaty: 'Sign the treaty', war: 'Go to war', control: 'Seize total control' };
const DECISION_TEXT = {
  status_quo: 'keeps playing as the game\'s own bot would.',
  race: 'accelerates AI every year, subsidises automation and researches toward recursive self-improvement.',
  treaty: 'champions an AI safety treaty, restricts AI at home and researches alignment.',
  war: 'declares war on Taiwan, builds its military and attacks the United States online.',
  control: 'seizes total control, expands surveillance, restricts the internet and researches the panopticon.',
};

// ── Load every simulated history ─────────────────────────────────────────
const runs = [];
const files = readdirSync(forksDirectory).filter(function (fileName) { return /^(search-\d+|detail-202-[a-z_]+)\.json$/.test(fileName) && fileName !== 'search-202.json'; });
for (const fileName of files) {
  const fork = JSON.parse(readFileSync(join(forksDirectory, fileName), 'utf8'));
  for (const branch of fork.branches) {
    runs.push({
      seed: fork.seed, forkYear: fork.forkYear, protagonistId: fork.protagonistId, policyId: branch.policyId, rerollIndex: branch.rerollIndex,
      ending: branch.ending || branch.endReason, endYear: branch.endYear, firstTech: branch.firstTech,
      events: fork.shared.events.concat(branch.events),
      regimeChanges: (fork.shared.regimeChanges || []).concat(branch.regimeChanges || []),
      globals: (fork.shared.globals || []).concat(branch.globals || []),
    });
  }
}
const forecasts = JSON.parse(readFileSync(new URL('./forecasts.json', import.meta.url), 'utf8')).forecasts;
const REGIME_NAMES = { democracy: 'democracy', authoritarian: 'authoritarian rule', totalitarian: 'totalitarian rule', alib: 'anarcho-liberalism' };
const MILESTONES = [
  { id: 'milestone_agi_half', measure: 'agiProgress', threshold: 50, label: 'Halfway\nto AGI', note: 'The game\'s AGI-progress measure, set by the best frontier system anywhere, passes 50 of 100.' },
  { id: 'milestone_agi_full', measure: 'agiProgress', threshold: 100, label: 'AGI\nArrives', note: 'The game\'s AGI-progress measure reaches 100 of 100: a system somewhere matches human ability across the board.' },
  { id: 'milestone_risk_serious', measure: 'aiRisk', threshold: 50, label: 'AI Risk\nTurns Serious', note: 'The game\'s AI-risk measure, the chance that machines slip human control, passes 50 of 100.' },
  { id: 'milestone_risk_critical', measure: 'aiRisk', threshold: 75, label: 'AI Risk\nTurns Critical', note: 'The game\'s AI-risk measure passes 75 of 100.' },
  { id: 'milestone_tension_peak', measure: 'globalTension', threshold: 60, label: 'The World\non Edge', note: 'The game\'s global-tension measure, driven by wars, arms races and coups, passes 60 of 100.' },
];

// ── Choose the telling events of each history ─────────────────────────────
// About one game event a year from 2027: first occurrences, and an event recurring in a new place at least ten years
// after it was last shown. The highest-scoring event of each year is kept, a second one when it scores well.
function scoreEvent(run, eventRecord, isRecurrence) {
  const gameEvent = eventById[eventRecord.eventId];
  let score = 3 * (1 - (ensembleShare[eventRecord.eventId] || 0));
  if (eventRecord.scope === 'world') score += 2.5;
  if (gameEvent.category === 'tribulation' || gameEvent.category === 'politics') score += 1;
  if (eventRecord.targetId === run.protagonistId) score += 1.5;
  if (isRecurrence) score -= 1.2;
  return score;
}
function selectEventsFor(run) {
  const lastShown = {};
  const candidatesByYear = {};
  const sortedEvents = run.events.slice().sort(function (first, second) { return first.year - second.year; });
  for (const eventRecord of sortedEvents) {
    if (ENDINGS[eventRecord.eventId] || !eventRecord.drivers.length) continue;
    if (eventRecord.year < FUTURE_START_YEAR || eventRecord.year > run.endYear) continue;
    const previous = lastShown[eventRecord.eventId];
    const isRecurrence = !!previous;
    if (previous && (eventRecord.year - previous.year < 10 || previous.targetId === eventRecord.targetId)) continue;
    (candidatesByYear[eventRecord.year] = candidatesByYear[eventRecord.year] || []).push({ record: eventRecord, recurrence: isRecurrence, score: scoreEvent(run, eventRecord, isRecurrence) });
    // A candidate counts as shown for recurrence spacing only if it is picked; approximate by its first appearance.
    if (!previous) lastShown[eventRecord.eventId] = eventRecord;
  }
  const chosen = [];
  const shownCount = {};
  const lastChosenYear = {};
  Object.keys(candidatesByYear).map(Number).sort(function (first, second) { return first - second; }).forEach(function (year) {
    const ranked = candidatesByYear[year].sort(function (first, second) { return second.score - first.score; });
    let takenThisYear = 0;
    for (const candidate of ranked) {
      if (takenThisYear >= 2 || (takenThisYear === 1 && candidate.score < 4)) break;
      const eventId = candidate.record.eventId;
      if (candidate.recurrence && !shownCount[eventId]) continue;
      if (!candidate.recurrence && shownCount[eventId]) continue;
      if (candidate.recurrence && year - lastChosenYear[eventId] < 10) continue;
      lastChosenYear[eventId] = year;
      shownCount[eventId] = (shownCount[eventId] || 0) + 1;
      chosen.push({ record: candidate.record, instance: shownCount[eventId] });
      takenThisYear++;
    }
  });
  return chosen;
}
// Regime changes from the game's politics: at most one every three years, the most notable first.
function regimeScore(run, change) {
  let score = 0;
  const country = countryById[change.countryId];
  if (country && country.type === 'major') score += 3;
  if (change.countryId === run.protagonistId) score += 3;
  if (/corporate takeover/.test(change.cause)) score += 2.5;
  if (/self-coup/.test(change.cause)) score += 2.5;
  if (/coup sponsored|imposed by the victor/.test(change.cause)) score += 1.5;
  if (/uprising|color revolution|election|negotiated|opening/.test(change.cause)) score += 1;
  if (change.to === 'totalitarian') score += 1;
  return score;
}
function plainActorName(text) { return text.replace(/[^\p{L}\p{N}\s.&/()'-]/gu, '').replace(/\s+/g, ' ').trim(); }
function regimeDescription(change) {
  const countryName = actorName(change.countryId);
  const cause = change.cause;
  const byMatch = cause.match(/(?:sponsored by|backed by|incited by|takeover by)\s+(.*)$/);
  const agent = byMatch ? plainActorName(byMatch[1]) : '';
  if (/^revolution$/.test(cause)) return { kind: 'revolution', label: 'Revolution in\n' + countryName, agent: '' };
  if (/coup sponsored/.test(cause)) return { kind: 'coup', label: 'Coup in\n' + countryName, agent: 'sponsored by ' + agent };
  if (/corporate takeover/.test(cause)) return { kind: 'takeover', label: agent + '\nTakes Over ' + countryName, agent: '' };
  if (/self-coup/.test(cause)) return { kind: 'selfcoup', label: countryName + ' Seizes\nTotal Control', agent: '' };
  if (/imposed by the victor/.test(cause)) return { kind: 'imposed', label: countryName + ' Falls\nto the Victor', agent: '' };
  if (/color revolution/.test(cause)) return { kind: 'color', label: 'Color Revolution\nin ' + countryName, agent: 'backed by ' + agent };
  if (/uprising incited/.test(cause)) return { kind: 'uprising', label: 'Uprising in\n' + countryName, agent: 'incited by ' + agent };
  if (/^election$/.test(cause)) return { kind: 'election', label: countryName + ' Votes\nfor a New Order', agent: '' };
  if (/negotiated transition/.test(cause)) return { kind: 'negotiated', label: 'Negotiated Transition\nin ' + countryName, agent: '' };
  if (/democratic opening/.test(cause)) return { kind: 'opening', label: 'Democratic Opening\nin ' + countryName, agent: '' };
  return { kind: 'other', label: splitLabel(countryName + ': ' + plainActorName(cause), 22), agent: '' };
}
function selectRegimeChangesFor(run) {
  const pool = run.regimeChanges.filter(function (change) { return change.year >= FUTURE_START_YEAR && change.year <= run.endYear; })
    .map(function (change) { return { change: change, score: regimeScore(run, change) }; })
    .sort(function (first, second) { return second.score - first.score || first.change.year - second.change.year; });
  const chosen = [];
  for (const candidate of pool) {
    if (chosen.some(function (picked) { return Math.abs(picked.year - candidate.change.year) < 3 || (picked.countryId === candidate.change.countryId && Math.abs(picked.year - candidate.change.year) < 8); })) continue;
    chosen.push(candidate.change);
  }
  return chosen;
}
function globalsByYear(run) {
  const byYear = {};
  for (const sample of run.globals) byYear[sample.year] = sample;
  return byYear;
}

// ── Union graph ────────────────────────────────────────────────────────────
const nodes = {};
const edges = {};
function baseId(nodeId) { return nodeId.split('@')[0]; }
function nodeOf(nodeId, factory) { if (!nodes[nodeId]) nodes[nodeId] = Object.assign({ id: nodeId, years: [], uses: 0 }, factory()); return nodes[nodeId]; }
function edgeOf(fromId, toId, kind) { const edgeId = fromId + '>' + toId; if (!edges[edgeId]) edges[edgeId] = { id: edgeId, from: fromId, to: toId, kind: kind }; return edgeId; }
function techLabel(techId) { return splitLabel(techById[techId].name.toUpperCase(), 16); }

const iterations = runs.map(function (run) {
  const steps = [];
  const startingTechs = [];
  const byYear = globalsByYear(run);
  // Technologies: every one reached from 2027 is drawn when it is reached; one held before 2027 that the history
  // needs (as a cause or a prerequisite) is drawn in the starting strip. Real-past technologies are drawn once, above.
  const drawnTechs = {};
  function techNodeId(techId) { return 'tech_' + techId; }
  function techMark(techId) {
    const reach = run.firstTech[techId] || { year: 2024, holder: null };
    const nodeId = techNodeId(techId);
    if (prologueTechById[nodeId]) return { nodeId: nodeId, year: prologueTechById[nodeId].year, prologue: true, when: String(prologueTechById[nodeId].year), actor: prologueTechById[nodeId].actor };
    return { nodeId: nodeId, year: reach.year < FUTURE_START_YEAR ? null : reach.year, when: reach.year < FUTURE_START_YEAR ? 'held at the start' : 'reached ' + reach.year, actor: reach.holder ? actorName(reach.holder).toUpperCase() : '' };
  }
  function lineageEdgesOf(techId) {
    return (techById[techId].pre || []).map(function (parentId) { ensureTech(parentId); return edgeOf(techNodeId(parentId), techNodeId(techId), 'lineage'); });
  }
  function ensureTech(techId) {
    const nodeId = techNodeId(techId);
    if (prologueTechById[nodeId] || drawnTechs[techId]) return;
    const mark = techMark(techId);
    drawnTechs[techId] = true;
    const node = nodeOf(nodeId, function () { return { kind: 'tech', label: techLabel(techId), note: techById[techId].desc, reachYears: [], holders: {} }; });
    node.uses++;
    const reach = run.firstTech[techId] || { year: 2024, holder: null };
    node.reachYears.push(reach.year);
    node.years.push(Math.max(reach.year, FUTURE_START_YEAR));
    if (reach.holder) node.holders[reach.holder] = (node.holders[reach.holder] || 0) + 1;
    if (mark.year === null) startingTechs.push({ kind: 'tech', nodeId: nodeId, year: null, edges: lineageEdgesOf(techId), marks: [mark] });
    else steps.push({ kind: 'tech', nodeId: nodeId, year: mark.year, edges: lineageEdgesOf(techId), marks: [mark], holder: mark.actor });
  }
  Object.keys(run.firstTech).filter(function (techId) { return techById[techId] && run.firstTech[techId].year >= FUTURE_START_YEAR && run.firstTech[techId].year <= run.endYear; })
    .sort(function (first, second) { return run.firstTech[first].year - run.firstTech[second].year; })
    .forEach(ensureTech);
  function causeEdge(techId, targetId) {
    if (!techId) return [];
    ensureTech(techId);
    return [edgeOf(techNodeId(techId), targetId, 'activates')];
  }
  function techPhrase(techId) {
    const mark = techMark(techId);
    return techById[techId].name + (mark.prologue ? ' (real: ' + titleCaseWords(mark.actor) + ', ' + mark.year + ')' : mark.actor ? (mark.year === null ? ', held by ' + titleCaseWords(mark.actor) + ' at the start' : ', first reached by ' + titleCaseWords(mark.actor) + ' in ' + mark.year) : '');
  }

  // Game events.
  for (const picked of selectEventsFor(run)) {
    const eventRecord = picked.record;
    const baseNodeId = 'event_' + eventRecord.eventId;
    const instanceId = picked.instance > 1 ? baseNodeId + '@' + picked.instance : baseNodeId;
    const eventNode = nodeOf(baseNodeId, function () {
      const gameEvent = eventById[eventRecord.eventId];
      return { kind: 'event', category: 'game', label: splitLabel(gameEvent.name, 22), note: gameEvent.desc, share: ensembleShare[eventRecord.eventId] || 0 };
    });
    eventNode.years.push(eventRecord.year);
    eventNode.uses++;
    const driver = eventRecord.drivers[0];
    const stepEdges = causeEdge(driver.tech, instanceId);
    let placeName = 'the world';
    if (eventRecord.targetId !== 'world') {
      placeName = actorName(eventRecord.targetId);
      if (eventRecord.targetId === run.protagonistId && eventRecord.year >= run.forkYear) stepEdges.push(edgeOf('decision_' + run.policyId, instanceId, 'decision'));
    }
    eventNode.places = eventNode.places || {};
    eventNode.places[placeName] = (eventNode.places[placeName] || 0) + 1;
    steps.push({
      kind: 'event', nodeId: instanceId, year: eventRecord.year, place: placeName, edges: stepEdges,
      marks: [techMark(driver.tech), { nodeId: instanceId, year: eventRecord.year, when: String(eventRecord.year), actor: placeName.toUpperCase() }],
      activation: (picked.instance > 1 ? 'It happens again, now in ' + placeName + '. ' : '') + 'Activated by ' + techPhrase(driver.tech) + ' (' + (100 * driver.probability).toFixed(1) + '% a year).',
    });
  }
  // Regime changes.
  const politicsInstances = {};
  for (const change of selectRegimeChangesFor(run).sort(function (first, second) { return first.year - second.year; })) {
    const description = regimeDescription(change);
    const politicsBaseId = 'politics_' + change.countryId + '_' + description.kind + '_' + change.to;
    politicsInstances[politicsBaseId] = (politicsInstances[politicsBaseId] || 0) + 1;
    const nodeId = politicsInstances[politicsBaseId] > 1 ? politicsBaseId + '@' + politicsInstances[politicsBaseId] : politicsBaseId;
    const node = nodeOf(politicsBaseId, function () { return { kind: 'event', category: 'politics', label: description.label, note: actorName(change.countryId) + ' passes from ' + REGIME_NAMES[change.from] + ' to ' + REGIME_NAMES[change.to] + '.' }; });
    node.years.push(change.year);
    node.uses++;
    const stepEdges = change.countryId === run.protagonistId && change.year >= run.forkYear ? [edgeOf('decision_' + run.policyId, nodeId, 'decision')] : [];
    steps.push({
      kind: 'event', nodeId: nodeId, year: change.year, place: actorName(change.countryId), edges: stepEdges,
      marks: [{ nodeId: nodeId, year: change.year, when: String(change.year), actor: ('now ' + REGIME_NAMES[change.to]).toUpperCase() }],
      activation: 'A regime change in the game\'s politics: ' + REGIME_NAMES[change.from] + ' to ' + REGIME_NAMES[change.to] + (description.agent ? ', ' + description.agent : '') + ' (' + change.cause.replace(/[^\p{L}\p{N}\s.,:&/()'-]/gu, '').trim() + ').',
    });
  }
  // World milestones from the game's measures.
  for (const milestone of MILESTONES) {
    const crossing = run.globals.filter(function (sample) { return sample.year >= FUTURE_START_YEAR && sample.year <= run.endYear && sample[milestone.measure] >= milestone.threshold; })[0];
    if (!crossing) continue;
    const node = nodeOf(milestone.id, function () { return { kind: 'event', category: 'milestone', label: milestone.label, note: milestone.note }; });
    node.years.push(crossing.year);
    node.uses++;
    steps.push({
      kind: 'event', nodeId: milestone.id, year: crossing.year, place: 'the world', edges: [],
      marks: [{ nodeId: milestone.id, year: crossing.year, when: String(crossing.year), actor: 'THE WORLD' }],
      activation: 'A milestone of the game\'s world measures: AGI progress ' + Math.round(crossing.agiProgress) + ', AI risk ' + Math.round(crossing.aiRisk) + ', global tension ' + Math.round(crossing.globalTension) + ' (of 100).',
    });
  }
  // Published forecasts, where this history is compatible with them.
  for (const forecast of forecasts) {
    let fireYear = null;
    for (let year = forecast.year; year <= Math.min(forecast.year + forecast.windowYears, run.endYear); year++) {
      const techReady = !forecast.techId || prologueTechById[techNodeId(forecast.techId)] || (run.firstTech[forecast.techId] && run.firstTech[forecast.techId].year <= year);
      const sample = byYear[year];
      const measuresReady = Object.keys(forecast.requires || {}).every(function (measure) { return sample && sample[measure] >= forecast.requires[measure]; });
      if (techReady && measuresReady) { fireYear = year; break; }
    }
    if (fireYear === null) continue;
    const node = nodeOf(forecast.id, function () { return { kind: 'event', category: 'forecast', label: forecast.label, note: forecast.note, source: forecast.source, forecastYear: forecast.year }; });
    node.years.push(fireYear);
    node.uses++;
    steps.push({
      kind: 'event', nodeId: forecast.id, year: fireYear, place: 'the world', edges: causeEdge(forecast.techId, forecast.id),
      marks: (forecast.techId ? [techMark(forecast.techId)] : []).concat([{ nodeId: forecast.id, year: fireYear, when: fireYear === forecast.year ? 'forecast for ' + forecast.year : 'forecast ' + forecast.year + ', here ' + fireYear, actor: forecast.source }]),
      activation: 'Forecast by ' + titleCaseWords(forecast.source) + ' for ' + forecast.year + (fireYear === forecast.year ? '; this history keeps the date.' : '; this history gets there in ' + fireYear + '.') + (forecast.techId ? ' Needs ' + techPhrase(forecast.techId) + '.' : ''),
    });
  }
  // Order: by year; within a year technologies first (they make the events possible), then events.
  const kindRank = { tech: 0, event: 1 };
  steps.sort(function (first, second) { return first.year - second.year || kindRank[first.kind] - kindRank[second.kind]; });
  const decisionId = 'decision_' + run.policyId;
  nodeOf(decisionId, function () { return { kind: 'decision', label: 'CHINA: ' + POLICY_LABELS[run.policyId].toUpperCase(), note: 'China ' + DECISION_TEXT[run.policyId] }; }).uses++;
  const decisionIndex = steps.findIndex(function (step) { return step.year >= run.forkYear; });
  steps.splice(decisionIndex < 0 ? steps.length : decisionIndex, 0, { kind: 'decision', nodeId: decisionId, year: run.forkYear, edges: [] });
  const endingId = 'ending_' + run.ending;
  nodeOf(endingId, function () { return { kind: 'ending', label: splitLabel(ENDINGS[run.ending].label, 14), note: ENDINGS[run.ending].text, finale: ENDINGS[run.ending].finale }; }).uses++;
  const terminalRecord = run.events.find(function (eventRecord) { return eventRecord.eventId === run.ending; });
  const endingEdges = terminalRecord && terminalRecord.drivers.length ? causeEdge(terminalRecord.drivers[0].tech, endingId) : [];
  steps.push({ kind: 'ending', nodeId: endingId, year: run.endYear, edges: endingEdges, marks: terminalRecord && terminalRecord.drivers.length ? [techMark(terminalRecord.drivers[0].tech)] : [] });
  return {
    seed: run.seed, policyId: run.policyId, policyLabel: POLICY_LABELS[run.policyId], rerollIndex: run.rerollIndex, ending: run.ending, endYear: run.endYear,
    startingTechs: startingTechs, steps: steps,
  };
});
function titleCaseWords(text) { return text.toLowerCase().replace(/(^|[\s(])\S/g, function (letter) { return letter.toUpperCase(); }); }
const lineageEdgeIds = Object.keys(edges).filter(function (edgeId) { return edges[edgeId].kind === 'lineage'; });

// Real-past technologies that are game technologies belong to the union graph too (for the embedding and the tech tree).
for (const tech of prologue.techs) if (tech.gameTechId) nodeOf(tech.id, function () { return { kind: 'tech', label: techLabel(tech.gameTechId), note: techById[tech.gameTechId].desc, reachYears: [2024], holders: {}, years: [FUTURE_START_YEAR - 1] }; });
// Every ending and decision exists on the sheet from the start.
for (const endingKey of ENDING_ORDER) nodeOf('ending_' + endingKey, function () { return { kind: 'ending', label: splitLabel(ENDINGS[endingKey].label, 14), note: ENDINGS[endingKey].text, finale: ENDINGS[endingKey].finale }; });
for (const policyId of POLICY_ORDER) nodeOf('decision_' + policyId, function () { return { kind: 'decision', label: 'CHINA: ' + POLICY_LABELS[policyId].toUpperCase(), note: 'China ' + DECISION_TEXT[policyId] }; });

const nodeList = Object.values(nodes).map(function (node) {
  const output = { id: node.id, kind: node.kind, category: node.category, source: node.source, forecastYear: node.forecastYear, label: node.label, note: node.note, uses: node.uses };
  if (node.kind === 'event') {
    output.year = median(node.years); output.share = node.share;
    const placePairs = Object.entries(node.places || {}).sort(function (first, second) { return second[1] - first[1]; });
    output.typicalWhen = 'typically ' + output.year;
    output.typicalActor = placePairs.length ? placePairs[0][0].toUpperCase() : '';
    output.longestActor = placePairs.map(function (pair) { return pair[0].toUpperCase(); }).sort(function (first, second) { return second.length - first.length; })[0] || '';
    output.detail = 'Fired most often in ' + placePairs.slice(0, 3).map(function (pair) { return pair[0] + ' (' + pair[1] + ')'; }).join(', ') + '.';
  }
  if (node.kind === 'tech') {
    const startShare = node.reachYears.filter(function (year) { return year <= 2024; }).length / node.reachYears.length;
    output.atStart = startShare >= 0.5;
    output.year = median(node.years);
    output.reachYear = median(node.reachYears);
    output.typicalWhen = output.atStart ? 'held at the start' : 'reached ~' + output.reachYear;
    const holderPairs = Object.entries(node.holders).sort(function (first, second) { return second[1] - first[1]; });
    output.typicalActor = holderPairs.length ? actorName(holderPairs[0][0]).toUpperCase() : '';
    output.longestActor = holderPairs.map(function (pair) { return actorName(pair[0]).toUpperCase(); }).sort(function (first, second) { return second.length - first.length; })[0] || '';
    output.detail = holderPairs.length ? 'First reached by ' + holderPairs.slice(0, 3).map(function (pair) { return actorName(pair[0]) + ' in ' + pair[1] + ' histories'; }).join(', ') + '.' : '';
  }
  if (node.kind === 'actor') output.year = median(node.years);
  if (node.kind === 'decision') { output.policyId = node.id.replace('decision_', ''); output.order = POLICY_ORDER.indexOf(output.policyId); }
  if (node.kind === 'ending') { output.endingKey = node.id.replace('ending_', ''); output.order = ENDING_ORDER.indexOf(output.endingKey); output.finale = node.finale; }
  return output;
});

// Iteration order: first the five decisions on one shared past, then everything else interleaved.
function sortKey(iteration) { return POLICY_ORDER.indexOf(iteration.policyId); }
const firstFive = iterations.filter(function (iteration) { return iteration.seed === 202 && iteration.rerollIndex === 0; }).sort(function (first, second) { return sortKey(first) - sortKey(second); });
const rest = iterations.filter(function (iteration) { return firstFive.indexOf(iteration) < 0; });
let shuffleState = 7;
for (let index = rest.length - 1; index > 0; index--) {
  shuffleState = (shuffleState * 1103515245 + 12345) & 0x7fffffff;
  const swapIndex = shuffleState % (index + 1);
  const held = rest[index]; rest[index] = rest[swapIndex]; rest[swapIndex] = held;
}
const ordered = firstFive.concat(rest);

// ── Spatial embedding of the horizontal axis (time stays vertical) ─────────
// 1. Each history contributes a set of nodes and the ending it reached.
const historyNodeSets = ordered.map(function (iteration) {
  const nodeSet = new Set();
  for (const step of iteration.steps) {
    nodeSet.add(baseId(step.nodeId));
    for (const edgeId of step.edges || []) nodeSet.add(edges[edgeId].from);
  }
  return { nodes: nodeSet, ending: iteration.ending, decision: 'decision_' + iteration.policyId };
});
const edgeUseCounts = {};
for (const iteration of ordered) for (const step of iteration.steps) for (const edgeId of step.edges || []) edgeUseCounts[edgeId] = (edgeUseCounts[edgeId] || 0) + 1;
const historiesPerEnding = {};
for (const history of historyNodeSets) historiesPerEnding[history.ending] = (historiesPerEnding[history.ending] || 0) + 1;
const presentEndings = ENDING_ORDER.filter(function (endingKey) { return historiesPerEnding[endingKey]; });
// 2. Profile of every node: in which share of each ending's histories it appears.
const profiles = {};
for (const history of historyNodeSets) {
  for (const nodeId of history.nodes) {
    const profile = profiles[nodeId] || (profiles[nodeId] = {});
    profile[history.ending] = (profile[history.ending] || 0) + 1 / historiesPerEnding[history.ending];
  }
}
// 3. Order the endings so that endings sharing many events sit next to each other.
function endingVector(endingKey) {
  return Object.keys(profiles).map(function (nodeId) { return profiles[nodeId][endingKey] || 0; });
}
const endingVectors = {};
for (const endingKey of presentEndings) endingVectors[endingKey] = endingVector(endingKey);
function cosine(first, second) {
  let dot = 0; let firstNorm = 0; let secondNorm = 0;
  for (let index = 0; index < first.length; index++) { dot += first[index] * second[index]; firstNorm += first[index] * first[index]; secondNorm += second[index] * second[index]; }
  return dot / Math.sqrt(firstNorm * secondNorm || 1);
}
function permutations(list) {
  if (list.length <= 1) return [list];
  const result = [];
  list.forEach(function (item, itemIndex) {
    const remainder = list.slice(0, itemIndex).concat(list.slice(itemIndex + 1));
    for (const tail of permutations(remainder)) result.push([item].concat(tail));
  });
  return result;
}
let bestOrder = presentEndings;
let bestCost = Infinity;
for (const candidateOrder of permutations(presentEndings)) {
  let cost = 0;
  for (let firstIndex = 0; firstIndex < candidateOrder.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < candidateOrder.length; secondIndex++) {
      cost += cosine(endingVectors[candidateOrder[firstIndex]], endingVectors[candidateOrder[secondIndex]]) * (secondIndex - firstIndex);
    }
  }
  if (cost < bestCost) { bestCost = cost; bestOrder = candidateOrder; }
}
const absentEndings = ENDING_ORDER.filter(function (endingKey) { return presentEndings.indexOf(endingKey) < 0; });
const endingSequence = bestOrder.concat(absentEndings);
const endingPosition = {};
endingSequence.forEach(function (endingKey, endingIndex) { endingPosition[endingKey] = 0.06 + 0.88 * endingIndex / Math.max(1, endingSequence.length - 1); });
// 4. Initial position: average of ending positions, weighted by the node's profile.
const initialPosition = {};
for (const node of nodeList) {
  const profile = profiles[node.id] || {};
  let weightSum = 0; let positionSum = 0;
  for (const endingKey of Object.keys(profile)) { weightSum += profile[endingKey]; positionSum += profile[endingKey] * endingPosition[endingKey]; }
  initialPosition[node.id] = weightSum ? positionSum / weightSum : 0.5;
}
// 5. Neighbours: technology–event links, and events that occur in the same histories.
const neighbours = {};
function addNeighbour(firstId, secondId, weight) {
  (neighbours[firstId] = neighbours[firstId] || []).push({ id: secondId, weight: weight });
  (neighbours[secondId] = neighbours[secondId] || []).push({ id: firstId, weight: weight });
}
for (const edgeId of Object.keys(edges)) {
  const edge = edges[edgeId];
  if (edge.kind === 'activates' && edge.to.indexOf('ending_') !== 0) addNeighbour(edge.from, baseId(edge.to), 2 * Math.sqrt(edgeUseCounts[edgeId] || 1));
  if (edge.kind === 'lineage') addNeighbour(edge.from, edge.to, 0.6);
}
const eventIds = nodeList.filter(function (node) { return node.kind === 'event'; }).map(function (node) { return node.id; });
const occurrence = {};
for (const history of historyNodeSets) for (const nodeId of history.nodes) occurrence[nodeId] = (occurrence[nodeId] || 0) + 1;
for (const firstId of eventIds) {
  const similarities = [];
  for (const secondId of eventIds) {
    if (firstId === secondId) continue;
    let together = 0;
    for (const history of historyNodeSets) if (history.nodes.has(firstId) && history.nodes.has(secondId)) together++;
    if (together) similarities.push({ id: secondId, weight: together / Math.sqrt(occurrence[firstId] * occurrence[secondId]) });
  }
  similarities.sort(function (first, second) { return second.weight - first.weight; });
  for (const similar of similarities.slice(0, 5)) addNeighbour(firstId, similar.id, similar.weight);
}
// 6. Smooth: each node drifts toward its neighbours while keeping its own ending signature.
let position = Object.assign({}, initialPosition);
for (let iteration = 0; iteration < 12; iteration++) {
  const next = {};
  for (const node of nodeList) {
    const nodeNeighbours = neighbours[node.id] || [];
    let weightSum = 0; let positionSum = 0;
    for (const neighbour of nodeNeighbours) { weightSum += neighbour.weight; positionSum += neighbour.weight * position[neighbour.id]; }
    next[node.id] = weightSum ? 0.45 * initialPosition[node.id] + 0.55 * positionSum / weightSum : initialPosition[node.id];
  }
  position = next;
}
// 7. Spread events evenly by rank (order is the embedding; spacing is for legibility);
//    technologies sit over the events they activate; decisions over the futures they lead to.
const rankedEvents = eventIds.slice().sort(function (first, second) { return position[first] - position[second]; });
const embedded = {};
rankedEvents.forEach(function (eventId, rankIndex) { embedded[eventId] = 0.04 + 0.92 * rankIndex / Math.max(1, rankedEvents.length - 1); });
for (const node of nodeList) {
  if (node.kind === 'tech') {
    const linked = (neighbours[node.id] || []).filter(function (neighbour) { return embedded[neighbour.id] !== undefined; });
    let weightSum = 0; let positionSum = 0;
    for (const neighbour of linked) { weightSum += neighbour.weight; positionSum += neighbour.weight * embedded[neighbour.id]; }
    embedded[node.id] = weightSum ? positionSum / weightSum : position[node.id];
  }
  if (node.kind === 'ending') embedded[node.id] = endingPosition[node.endingKey];
}
const decisionIds = nodeList.filter(function (node) { return node.kind === 'decision'; }).map(function (node) { return node.id; })
  .sort(function (first, second) { return position[first] - position[second]; });
decisionIds.forEach(function (decisionId, rankIndex) { embedded[decisionId] = 0.18 + 0.64 * rankIndex / Math.max(1, decisionIds.length - 1); });
for (const node of nodeList) {
  node.embedX = +embedded[node.id].toFixed(4);
  if (node.kind === 'ending') node.order = endingSequence.indexOf(node.endingKey);
}
for (const edgeId of Object.keys(edges)) edges[edgeId].uses = edgeUseCounts[edgeId] || 0;
console.log('ending order', endingSequence.join(' | '));
console.log('decision order', decisionIds.join(' | '));

const ensembleEndings = {};
for (const result of ensembleResults) { const key = result.ending || result.endReason; ensembleEndings[key] = (ensembleEndings[key] || 0) + 1; }
const prologueEdges = [];
for (const prologueEvent of prologue.events) prologueEdges.push({ id: prologueEvent.techId + '>' + prologueEvent.id, from: prologueEvent.techId, to: prologueEvent.id, kind: 'activates' });
for (const tech of prologue.techs) for (const parentId of tech.pre) prologueEdges.push({ id: parentId + '>' + tech.id, from: parentId, to: tech.id, kind: 'lineage' });
const prologuePayload = {
  futureStartYear: FUTURE_START_YEAR,
  techs: prologue.techs.map(function (tech) { return { id: tech.id, kind: 'tech', label: tech.label, year: tech.year, actor: tech.actor, note: tech.note, embedX: nodes[tech.id] && nodeList.find(function (node) { return node.id === tech.id; }) ? nodeList.find(function (node) { return node.id === tech.id; }).embedX : null }; }),
  events: prologue.events.map(function (prologueEvent) { return { id: prologueEvent.id, kind: 'event', label: prologueEvent.label, year: prologueEvent.year, place: prologueEvent.place, techId: prologueEvent.techId, note: prologueEvent.note }; }),
  edges: prologueEdges,
};
const storyPayload = JSON.stringify({
  prologue: prologuePayload,
  forkYear: 2040, protagonist: { id: 'CHN', name: 'China' }, nodes: nodeList, edges: Object.values(edges), iterations: ordered,
  endings: ENDINGS, ensemble: { gameCount: ensembleResults.length, endings: ensembleEndings },
});
// A .js output is loaded by index.html as window.storyData; a .json output is the raw story.
const generatedHeader = '// Generated by pipeline/build-iterations.mjs. Do not edit by hand.';
writeFileSync(outputPath, outputPath.endsWith('.js') ? [generatedHeader, 'window.storyData = ' + storyPayload + ';', ''].join('\n') : storyPayload);
const endingTally = {};
for (const iteration of ordered) endingTally[iteration.ending] = (endingTally[iteration.ending] || 0) + 1;
console.log('lineage links', lineageEdgeIds.length, 'used in histories', lineageEdgeIds.filter(function (edgeId) { return edgeUseCounts[edgeId]; }).length);
console.log('iterations', ordered.length, 'nodes', nodeList.length, 'edges', Object.keys(edges).length, JSON.stringify(endingTally));
const kindCounts = {};
for (const node of nodeList) kindCounts[node.kind + (node.role ? '/' + node.role : '')] = (kindCounts[node.kind + (node.role ? '/' + node.role : '')] || 0) + 1;
console.log(JSON.stringify(kindCounts), 'steps per iteration', (ordered.reduce(function (sum, iteration) { return sum + iteration.steps.length; }, 0) / ordered.length).toFixed(1));
