// Edits one condition range of a terminal ending in data/world_events.json in place, leaving the rest of the file untouched.
// Usage: node tune-endings.mjs <projectDirectory> <eventId> <conditionParam> <from> <to>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [projectDirectory, eventId, conditionParam, fromText, toText] = process.argv.slice(2);
const filePath = join(projectDirectory, 'data', 'world_events.json');
const source = readFileSync(filePath, 'utf8');
const idPattern = new RegExp('"id":\\s*"' + eventId + '"');
const idMatch = idPattern.exec(source);
if (!idMatch) throw new Error('event not found: ' + eventId);
const nextIdIndex = source.indexOf('"id":', idMatch.index + idMatch[0].length);
const blockEnd = nextIdIndex === -1 ? source.length : nextIdIndex;
const block = source.slice(idMatch.index, blockEnd);
const escapedParam = conditionParam.replace('.', '\\.');
const conditionPattern = new RegExp('("param":\\s*"' + escapedParam + '",\\s*"from":\\s*)(-?[\\d.]+)(,\\s*"to":\\s*)(-?[\\d.]+)');
const conditionMatch = conditionPattern.exec(block);
if (!conditionMatch) throw new Error('condition not found: ' + conditionParam + ' in ' + eventId);
const updatedBlock = block.replace(conditionPattern, '$1' + fromText + '$3' + toText);
writeFileSync(filePath, source.slice(0, idMatch.index) + updatedBlock + source.slice(blockEnd));
console.log(eventId, conditionParam, conditionMatch[2] + '→' + conditionMatch[4], 'now', fromText + '→' + toText);
