// Runs the fork experiments in parallel processes:
//   search: each seed is played to the fork year, then replayed once per decision policy;
//   detail: the narrated seed is replayed per policy with extra re-rolled dice.
// Usage: node run-forks.mjs <projectDirectory> <outputDirectory> [narratedSeed]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [projectDirectory, outputDirectory, narratedSeedText] = process.argv.slice(2);
const narratedSeed = narratedSeedText || '202';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const FORK_YEAR = '2040';
const POLICIES = ['status_quo', 'race', 'treaty', 'war', 'control'];
const SEARCH_SEEDS = ['101', '303', '404', '505', '606', '707', '808', '909', '1111', '1212', '1313', '1414', '1515', '1616'];
const DETAIL_REROLLS = '0,1,2,3,4,5,6,7,8';
mkdirSync(outputDirectory, { recursive: true });

function runForkProcess(seed, policyCsv, rerollCsv, outputName) {
  return new Promise(function (resolve, reject) {
    const outputPath = join(outputDirectory, outputName);
    const child = spawn(process.execPath, [join(scriptDirectory, 'fork-run.mjs'), projectDirectory, seed, FORK_YEAR, policyCsv, rerollCsv, outputPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    let summary = '';
    child.stdout.on('data', function (chunk) { summary += chunk; });
    child.on('exit', function (exitCode) {
      if (exitCode !== 0) { reject(new Error(outputName + ' exited ' + exitCode)); return; }
      writeFileSync(outputPath.replace('.json', '.log'), summary);
      process.stdout.write(summary);
      resolve();
    });
  });
}

const jobs = [];
for (const seed of SEARCH_SEEDS) jobs.push(function () { return runForkProcess(seed, POLICIES.join(','), '0', 'search-' + seed + '.json'); });
for (const policyId of POLICIES) jobs.push(function () { return runForkProcess(narratedSeed, policyId, DETAIL_REROLLS, 'detail-' + narratedSeed + '-' + policyId + '.json'); });

// At most 16 processes at a time.
const startTime = Date.now();
let nextJobIndex = 0;
function runNext() {
  if (nextJobIndex >= jobs.length) return Promise.resolve();
  const job = jobs[nextJobIndex++];
  return job().then(runNext);
}
const lanes = [];
for (let laneIndex = 0; laneIndex < Math.min(16, jobs.length); laneIndex++) lanes.push(runNext());
await Promise.all(lanes);
console.log('fork runs finished in ' + ((Date.now() - startTime) / 1000).toFixed(0) + ' s');
