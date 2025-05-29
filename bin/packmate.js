#!/usr/bin/env node
import { runUpdateCheck } from '../src/update-checker.js';
import { runUnusedCheck } from '../src/unused-checker.js';
import { promptActions } from '../src/ui.js';

const run = async () => {
  const [updates, unused] = await Promise.all([
    runUpdateCheck(),
    runUnusedCheck()
  ]);

  await promptActions(updates, unused);
};

run();
