#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['scripts/restore-pre-sidebar-arturito.mjs', ...process.argv.slice(2)], {
  stdio:'inherit',
  env:process.env
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
