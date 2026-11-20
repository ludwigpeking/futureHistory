'use strict';
// Renders the page at several moments with headless Chrome or Edge and writes PNGs to qa/shots.
// Usage: node qa/screenshots.cjs [page.html] [position ...]   positions are fractions of the whole loop (0–1)
const childProcess = require('node:child_process');
const filesystem = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const pageArgument = process.argv[2] || path.join(__dirname, '..', 'index.html');
const positions = process.argv.length > 3 ? process.argv.slice(3) : ['overview', '0.004', '0.031', '0.31', '0.6'];
const browserCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const browserPath = browserCandidates.find(function (candidate) { return filesystem.existsSync(candidate); });
if (!browserPath) { console.error('No Chrome or Edge found.'); process.exit(1); }

const shotsDirectory = path.join(__dirname, 'shots');
filesystem.mkdirSync(shotsDirectory, { recursive: true });
const profileDirectory = path.join(shotsDirectory, '.profile');
const pageUrl = url.pathToFileURL(path.resolve(pageArgument)).href;

positions.forEach(function (position) {
  const target = position === 'overview' ? pageUrl : /^(view|panels)=/.test(position) ? pageUrl + '?' + position : pageUrl + '?at=' + position;
  const shotPath = path.join(shotsDirectory, 'shot-' + position.replace(/[^0-9a-z.]+/gi, '_') + '.png');
  childProcess.spawnSync(browserPath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1500,1150', '--virtual-time-budget=12000',
    '--user-data-dir=' + profileDirectory, '--screenshot=' + shotPath, target,
  ], { stdio: 'ignore' });
  console.log((filesystem.existsSync(shotPath) ? 'wrote ' : 'FAILED ') + shotPath);
});
