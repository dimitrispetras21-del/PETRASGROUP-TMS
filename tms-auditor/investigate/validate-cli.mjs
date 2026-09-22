#!/usr/bin/env node
// node validate-cli.mjs <package.json> <answer.txt> → prints {ok, errs, report}; exit 0 only if the report passes.
import fs from 'node:fs';
import { validateReport, extractReport } from './validate.mjs';
const [pkgFile, ansFile] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const { report, err } = extractReport(fs.readFileSync(ansFile, 'utf8'));
const v = report ? validateReport(report, pkg) : { ok: false, errs: [err] };
console.log(JSON.stringify({ ok: v.ok, errs: v.errs, report: v.ok ? report : null }, null, 1));
process.exit(v.ok ? 0 : 1);
