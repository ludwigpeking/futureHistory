// Runs batch-play.mjs for each player role in its own process and merges the results.
// Usage: node parallel-batch.mjs <projectDirectory> <gamesPerEntity> <maxTurns> <outputJsonPath> [seedOffset]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [projectDirectory, gamesPerEntity, maxTurns, outputJsonPath, seedOffset] = process.argv.slice(2);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const ENTITIES = ['USA', 'CHN', 'EU', 'IND', 'RUS', 'PRK', 'SGP', 'openai', 'google', 'huawei', 'mars', 'green', 'alqaeda', 'catholic'];

function runOne(entityId) {
  return new Promise(function (resolve, reject) {
    const partPath = join(scriptDirectory, 'part-' + entityId + '-' + process.pid + '.json');
    const child = spawn(process.execPath, [join(scriptDirectory, 'batch-play.mjs'), projectDirectory, gamesPerEntity, maxTurns, partPath, entityId, seedOffset || '0'], { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', function (exitCode) {
      if (exitCode !== 0) { reject(new Error(entityId + ' exited ' + exitCode)); return; }
      const part = JSON.parse(readFileSync(partPath, 'utf8'));
      unlinkSync(partPath);
      resolve(part);
    });
  });
}

const startTime = Date.now();
const parts = await Promise.all(ENTITIES.map(runOne));
const merged = { maxTurns: Number(maxTurns), eventNameById: parts[0].eventNameById, results: [] };
for (const part of parts) merged.results = merged.results.concat(part.results);
writeFileSync(outputJsonPath, JSON.stringify(merged));
const endingCounts = {};
for (const result of merged.results) { const key = result.ending || result.endReason; endingCounts[key] = (endingCounts[key] || 0) + 1; }
console.log('games', merged.results.length, 'seconds', ((Date.now() - startTime) / 1000).toFixed(0), JSON.stringify(endingCounts));
