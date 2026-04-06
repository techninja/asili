/**
 * Trait management CLI — command router.
 * Each subcommand is a separate function to stay under 150 lines.
 */
import prompts from 'prompts';
import { closeDb } from './shared-db.js';
import { listTraits } from './cmd/list.js';
import { seedTraits } from './cmd/seed.js';
import { addTrait } from './cmd/add.js';
import { refreshTraits } from './cmd/refresh.js';
import { syncOverrides } from './cmd/sync.js';
import { freshStart } from './cmd/fresh.js';
import { publishData } from './cmd/publish.js';

const COMMANDS = {
  list: listTraits,
  seed: seedTraits,
  add: (_, arg) => addTrait(arg),
  refresh: (_, arg) => refreshTraits(arg),
  sync: syncOverrides,
  fresh: freshStart,
  publish: publishData,
};

const MENU_CHOICES = [
  { title: '📋 List current traits', value: 'list' },
  { title: '🌱 Seed from PGS Catalog API', value: 'seed' },
  { title: '➕ Add a new trait', value: 'add' },
  { title: '🔄 Refresh trait data', value: 'refresh' },
  { title: '🔄 Sync overrides to DB', value: 'sync' },
  { title: '🆕 Fresh start', value: 'fresh' },
  { title: '🚀 Publish to R2', value: 'publish' },
  { title: '🚪 Exit', value: 'exit' },
];

/**
 * @param {string[]} args - CLI arguments after `pnpm traits`
 */
export async function run(args) {
  const [command, ...rest] = args;

  if (command && COMMANDS[command]) {
    try {
      await COMMANDS[command](command, rest.join(',') || null);
    } finally {
      closeDb();
    }
    return;
  }

  if (command) {
    console.error(`Unknown command: ${command}`);
    console.error('Available: ' + Object.keys(COMMANDS).join(', '));
    process.exit(1);
  }

  await interactiveMenu();
}

/**
 *
 */
async function interactiveMenu() {
  console.log('\n🧬 Asili Trait Manager\n');

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: MENU_CHOICES,
  });

  if (!action || action === 'exit') {
    closeDb();
    return;
  }

  try {
    if (action === 'add') {
      const { id } = await prompts({
        type: 'text',
        name: 'id',
        message: 'Trait ID (e.g. EFO_0004340):',
        validate: v => v.trim().length > 0 || 'Required',
      });
      if (id) await addTrait(id);
    } else if (action === 'refresh') {
      const { id } = await prompts({
        type: 'text',
        name: 'id',
        message: 'Trait ID to refresh (blank for all):',
      });
      await refreshTraits(id || null);
    } else {
      await COMMANDS[action]();
    }
  } finally {
    closeDb();
  }

  const { again } = await prompts({
    type: 'confirm', name: 'again', message: 'Do something else?', initial: true,
  });
  if (again) await interactiveMenu();
}
