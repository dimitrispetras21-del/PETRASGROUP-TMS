#!/usr/bin/env node
// stdin: the JSON of monitoring.build_package(id) → stdout: the enriched package (code pointers, SHA, Athens times).
import { enrich } from './package.mjs';
let s = ''; for await (const c of process.stdin) s += c;
process.stdout.write(JSON.stringify(enrich(JSON.parse(s)), null, 1));
