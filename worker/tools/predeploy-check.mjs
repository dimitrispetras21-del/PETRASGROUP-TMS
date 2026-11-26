#!/usr/bin/env node
// predeploy-check.mjs: runs by itself before every `wrangler deploy` and `wrangler versions upload`
// (wrangler.toml [build] command; ValueDriven 26/11/2026). Rule 2 of «Τρεις κανόνες μίας πηγής», checked by the tool
// instead of by memory. It stops the upload when:
//   1. this branch does not contain origin/main. A Worker built from an older branch removes what main already has
//      live (e.g. POST /changes, #346), and no user sees an error: the pages just stop refreshing.
//   2. worker-guard fails on the source, with the flags in worker/guard-flags.txt (the one place they are kept).
// `wrangler dev` and `wrangler types` run the build command too: skipped. `wrangler rollback` never runs it.
// Emergency only: PETRAS_SKIP_PREDEPLOY=1 npx wrangler deploy (nothing is checked, a warning says so).
// --guard-only runs check 2 alone (CI: worker/test/guard-flags.test.mjs, where the branch check has no meaning).
// Exit 0 = the upload goes on, 1 = stop (wrangler aborts before uploading anything).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPLOADS = ['deploy', 'versions upload'];
const command = process.env.WRANGLER_COMMAND;   // set by wrangler 4.149+; unset (older wrangler) counts as a deploy
const guardOnly = process.argv.includes('--guard-only');

function stop(message) {
  console.error(`predeploy: STOP, nothing was uploaded. ${message}`);
  console.error('  Emergency only: PETRAS_SKIP_PREDEPLOY=1 npx wrangler deploy');
  process.exit(1);
}

if (command && !UPLOADS.includes(command)) {
  console.log(`predeploy: skipped for wrangler ${command} (the checks run only before an upload)`);
  process.exit(0);
}
if (process.env.PETRAS_SKIP_PREDEPLOY === '1') {
  console.warn('predeploy: WARNING, skipped by PETRAS_SKIP_PREDEPLOY=1: the branch and the guard were NOT checked');
  process.exit(0);
}

// 1. The branch holds everything on main.
if (!guardOnly) checkBranch();
function checkBranch() {
  console.log('predeploy 1/2: does this branch contain origin/main?');
  const git = (...args) => execFileSync('git', args, { cwd: WORKER, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('fetch', '--quiet', 'origin', 'main');
  } catch (e) {
    stop(`git fetch origin main failed, so the branch cannot be checked: ${(e.stderr || e.message).trim()}`);
  }
  const missing = Number(git('rev-list', '--count', 'HEAD..FETCH_HEAD'));
  if (missing > 0) {
    stop(`this branch lacks ${missing} commit(s) of origin/main, and a Worker built from it would remove what main already has. `
      + 'Bring main in first (git merge origin/main), then deploy again.');
  }
  console.log('  ok: origin/main is in this branch');
}

// 2. The guard, on src/index.js plus the local files it imports (the markers of the DKV parser and the import rules
// live there; wrangler bundles them together, so the guard reads them together).
console.log('predeploy 2/2: worker-guard with the flags of worker/guard-flags.txt');
const flagLines = readFileSync(path.join(WORKER, 'guard-flags.txt'), 'utf8').split('\n')
  .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
if (flagLines.length !== 1) stop(`worker/guard-flags.txt must hold exactly one line of flags, it holds ${flagLines.length}`);
const entry = path.join(WORKER, 'src', 'index.js');
const source = readFileSync(entry, 'utf8');
const imported = [...source.matchAll(/^import .* from "(\.{1,2}\/[^"]+)";$/gm)]
  .map((m) => readFileSync(path.join(path.dirname(entry), m[1]), 'utf8'));
const bundle = path.join(mkdtempSync(path.join(tmpdir(), 'predeploy-')), 'bundle.js');
writeFileSync(bundle, [source, ...imported].join('\n'));
const guard = spawnSync(process.execPath, [path.join(WORKER, 'tools', 'worker-guard.mjs'), bundle, ...flagLines[0].split(/\s+/)], { stdio: 'inherit' });
if (guard.status !== 0) stop(`worker-guard said STOP (exit ${guard.status}); its lines are above.`);
console.log('predeploy: OK, wrangler goes on with the upload');
