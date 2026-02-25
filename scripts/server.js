#!/usr/bin/env node
import { execSync } from 'child_process';
import prompts from 'prompts';
import chalk from 'chalk';

const args = process.argv.slice(2);
const [mode, cmd] = args[0] === 'static' || args[0] === 'calc' || args[0] === 'hybrid' 
  ? [args[0], args[1]] 
  : [args[0], args[1]];

const exec = (command) => {
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
  } catch (error) {
    process.exit(error.status || 1);
  }
};

const dockerCommands = {
  up: () => exec('docker compose up -d'),
  down: () => exec('docker compose down'),
  logs: (service) => exec(`docker compose logs -f ${service}`),
  restart: (service) => exec(`docker compose restart ${service}`),
  status: () => exec('docker compose ps'),
  build: (service) => exec(`docker compose build ${service}`)
};

const devCommands = {
  static: () => exec('node apps/web/static-server.js'),
  calc: () => exec('node apps/calc/server.js'),
  hybrid: () => exec('node apps/web/simple-server.js')
};

async function main() {
  let selectedMode = mode;
  let selectedCmd = cmd;

  if (!selectedMode || !['static', 'calc', 'hybrid', 'up', 'down', 'logs', 'restart', 'status', 'build', 'dev'].includes(selectedMode)) {
    const { mode: chosenMode } = await prompts({
      type: 'select',
      name: 'mode',
      message: '🖥️  Select server mode:',
      choices: [
        { title: '🔀 Hybrid (static + calc)', value: 'hybrid' },
        { title: '📦 Static only', value: 'static' },
        { title: '⚡ Calc only', value: 'calc' }
      ]
    });
    if (!chosenMode) process.exit(0);
    selectedMode = chosenMode;
  }

  if (dockerCommands[selectedMode]) {
    dockerCommands[selectedMode]();
    return;
  }

  if (!selectedCmd) {
    const { cmd: chosenCmd } = await prompts({
      type: 'select',
      name: 'cmd',
      message: `🎯 Select operation for ${chalk.cyan(selectedMode)}:`,
      choices: [
        { title: '🚀 Start (docker)', value: 'up' },
        { title: '🛑 Stop (docker)', value: 'down' },
        { title: '📋 Logs (docker)', value: 'logs' },
        { title: '🔄 Restart (docker)', value: 'restart' },
        { title: '📊 Status (docker)', value: 'status' },
        { title: '🔨 Build (docker)', value: 'build' },
        { title: '💻 Dev (local node)', value: 'dev' }
      ]
    });
    if (!chosenCmd) process.exit(0);
    selectedCmd = chosenCmd;
  }

  if (selectedCmd === 'dev') {
    devCommands[selectedMode]();
  } else if (dockerCommands[selectedCmd]) {
    dockerCommands[selectedCmd](selectedMode);
  } else {
    console.log(chalk.red('Invalid command'));
    process.exit(1);
  }
}

main();
