#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { pushCommand } from './commands/push.js';
import { agentsCommand } from './commands/agents.js';
import { doctorCommand } from './commands/doctor.js';
import { redactSecrets } from './utils/redact.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

// =============================================================================
// CLI Setup
// =============================================================================

const program = new Command();

program
  .name('mcp-sync')
  .description('Unified MCP server configuration for all your coding agents')
  .version(version)
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Verbose output')
  .option('-n, --dry-run', 'Show what would be done without doing it')
  .option('--no-color', 'Disable colored output');

// =============================================================================
// Commands
// =============================================================================

program
  .command('init')
  .description('Initialize mcp-sync configuration')
  .option('-f, --force', 'Overwrite existing config')
  .action(initCommand);

program
  .command('add <name>')
  .description('Add a new MCP server')
  .option('-t, --type <type>', 'Server type (stdio or http)', 'stdio')
  .option('--command <cmd>', 'Command to run (for stdio)')
  .option('--args <args...>', 'Command arguments (for stdio)')
  .option('--url <url>', 'Server URL (for http)')
  .option('-e, --env <env...>', 'Environment variables (KEY=VALUE, for stdio type)')
  .option('-H, --header <headers...>', 'HTTP headers (KEY=VALUE, for http type)')
  .option('-d, --description <desc>', 'Server description')
  .action(addCommand);

program
  .command('remove <name>')
  .description('Remove an MCP server')
  .action(async (name, options, cmd) => {
    const { ConfigManager } = await import('../core/config.js');
    const configManager = new ConfigManager({
      configPath: cmd.parent?.opts().config,
    });

    const removed = configManager.removeServer(name);
    if (removed) {
      console.log(chalk.green(`✓ Removed server '${name}'`));
    } else {
      console.log(chalk.yellow(`Server '${name}' not found`));
    }
  });

program
  .command('list')
  .description('List all configured servers')
  .option('--json', 'Output as JSON')
  .action(listCommand);

program
  .command('show <name>')
  .description('Show details of a server')
  .action(async (name, options, cmd) => {
    const { ConfigManager } = await import('../core/config.js');
    const configManager = new ConfigManager({
      configPath: cmd.parent?.opts().config,
    });

    const server = configManager.getServer(name);
    if (!server) {
      console.log(chalk.red(`Server '${name}' not found`));
      process.exit(1);
    }

    console.log(chalk.bold(`\n${name}`));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(JSON.stringify(redactSecrets(server), null, 2));
  });

program
  .command('edit')
  .description('Open config in $EDITOR')
  .action(async (options, cmd) => {
    const { ConfigManager } = await import('../core/config.js');
    const { spawn } = await import('child_process');

    const configManager = new ConfigManager({
      configPath: cmd.parent?.opts().config,
    });

    const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'vi';
    const configPath = configManager.getConfigPath();

    const child = spawn(editor, [configPath], {
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  });

program
  .command('push [agent]')
  .description('Sync config to agents')
  .option('--scope <scope>', 'Config scope (global, project, local)', 'global')
  .option('--merge', 'Merge with existing servers instead of replacing')
  .option('--force', 'Overwrite malformed agent configs (creates backup)')
  .action(pushCommand);

program
  .command('agents')
  .description('List detected agents and status')
  .option('--json', 'Output as JSON')
  .action(agentsCommand);

program.command('doctor').description('Check configuration health').action(doctorCommand);

// =============================================================================
// Error Handling
// =============================================================================

program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  throw err;
});

// Parse and run
program.parse();
