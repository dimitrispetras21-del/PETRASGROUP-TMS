// Shared scan learning: config.js must point at a table the Worker maps, and
// every label the front writes/reads must exist in that map — the facade drops
// unknown labels silently (CLAUDE.md, facade trap #1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('TABLES.SCAN_TRAINING is declared once and is not empty', () => {
  const cfg = read('config.js');
  const tablesBlock = cfg.slice(cfg.indexOf('const TABLES'), cfg.indexOf('};', cfg.indexOf('const TABLES')))
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.equal((tablesBlock.match(/\bSCAN_TRAINING\s*:/g) || []).length, 1, 'duplicate key: the last one silently wins');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(cfg + '\n;globalThis.__T = TABLES;', ctx);
  assert.ok(ctx.__T.SCAN_TRAINING, 'empty → shared learning is off');
});

test('every scan_examples label used by the front is in the Worker map', () => {
  const cfg = read('config.js');
  const id = cfg.match(/SCAN_TRAINING\s*:\s*'([^']+)'/)[1];
  const w = read('worker/src/index.js');
  const at = w.indexOf(`${id}: {`);
  assert.ok(at > 0, `Worker has no facade table ${id}`);
  const block = w.slice(at, w.indexOf('}\n  }', at));
  assert.match(block, /pg: "scan_examples"/);
  const labels = new Set([...block.matchAll(/(?:"([^"]+)"|(\w+)):\s*"[a-z_]+"/g)].map(m => m[1] || m[2]));
  const helpers = read('core/scan-helpers.js');
  const start = helpers.indexOf('function scanSaveCorrection');
  const end = helpers.indexOf('function scanGetTrainingExamples');
  const used = new Set([...helpers.slice(start, end).matchAll(/(?:fields|r\.fields)\['([^']+)'\]/g)].map(m => m[1]));
  assert.ok(used.size >= 3, 'did not find the labels — test out of date');
  for (const l of used) assert.ok(labels.has(l), `label «${l}» is not mapped for scan_examples → silently dropped`);
});
