import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../../core/config.js';
import { adapterRegistry } from '../../adapters/index.js';
import { SupportedAgent } from '../../core/schema.js';

interface PushOptions {
  scope?: 'global' | 'project' | 'local';
  merge?: boolean;
}

export async function pushCommand(
  agent: string | undefined,
  options: PushOptions,
  cmd: { parent?: { opts: () => { config?: string; dryRun?: boolean } } }
): Promise<void> {
  const globalOpts = cmd.parent?.opts() ?? {};
  const configManager = new ConfigManager({
    configPath: globalOpts.config,
  });

  try {
    if (!configManager.exists()) {
      console.log(chalk.yellow('No config file found. Run "mcp-sync init" first.'));
      process.exit(1);
    }

    const config = configManager.get();
    const serverCount = Object.keys(config.servers).length;

    if (serverCount === 0) {
      console.log(chalk.yellow('No servers configured.'));
      console.log(chalk.gray('Use "mcp-sync add <n>" to add servers first.'));
      return;
    }

    // Get adapters to sync to
    let adaptersToSync = await adapterRegistry.getInstalled();

    if (agent) {
      // Sync to specific agent
      const adapter = adapterRegistry.get(agent as SupportedAgent);
      if (!adapter) {
        console.log(chalk.red(`Unknown agent: ${agent}`));
        console.log(chalk.gray(`Available: ${adapterRegistry.getNames().join(', ')}`));
        process.exit(1);
      }

      const detection = await adapter.detect();
      if (!detection.installed) {
        console.log(chalk.red(`${adapter.displayName} is not installed`));
        process.exit(1);
      }

      adaptersToSync = [adapter];
    }

    if (adaptersToSync.length === 0) {
      console.log(chalk.yellow('No supported agents installed.'));
      return;
    }

    console.log(chalk.bold(`\nSyncing ${serverCount} server(s) to ${adaptersToSync.length} agent(s)...\n`));

    if (globalOpts.dryRun) {
      console.log(chalk.yellow('(dry run - no changes will be made)\n'));
    }

    let successCount = 0;
    let errorCount = 0;

    for (const adapter of adaptersToSync) {
      const spinner = ora(`${adapter.displayName}`).start();

      // Check agent config
      const agentConfig = config.agents?.[adapter.name];
      if (agentConfig?.enabled === false) {
        spinner.info(chalk.gray(`${adapter.displayName} - disabled in config`));
        continue;
      }

      // Validate config for this adapter
      const validation = adapter.validate(config);

      if (!validation.valid) {
        const errors = validation.issues.filter(i => i.type === 'error');
        spinner.fail(chalk.red(`${adapter.displayName} - ${errors.length} error(s)`));
        for (const issue of errors) {
          console.log(chalk.red(`    ${issue.message}`));
        }
        errorCount++;
        continue;
      }

      if (globalOpts.dryRun) {
        const serverNames = Object.keys(config.servers).filter(name => {
          const server = config.servers[name];
          return !config.exclusions?.some(e => e.server === name && e.agent === adapter.name) &&
                 server.agents?.[adapter.name]?.enabled !== false;
        });
        spinner.succeed(chalk.gray(`${adapter.displayName} - would write ${serverNames.length} server(s)`));
        successCount++;
        continue;
      }

      // Write config
      try {
        const scope = options.scope ?? (agentConfig?.scope as 'global' | 'project' | 'local') ?? 'global';
        const result = await adapter.write(config, { scope, merge: options.merge });

        if (result.success) {
          spinner.succeed(`${adapter.displayName} ${chalk.gray(`(${result.serversWritten} servers)`)}`);

          // Show warnings
          for (const warning of result.warnings) {
            console.log(chalk.yellow(`    ⚠ ${warning}`));
          }
          successCount++;
        } else {
          spinner.fail(chalk.red(`${adapter.displayName} - ${result.error}`));
          errorCount++;
        }
      } catch (error) {
        spinner.fail(chalk.red(`${adapter.displayName} - ${error instanceof Error ? error.message : error}`));
        errorCount++;
      }
    }

    // Summary
    console.log();
    if (errorCount === 0) {
      console.log(chalk.green(`✓ Synced to ${successCount} agent(s)`));
    } else {
      console.log(chalk.yellow(`Synced to ${successCount} agent(s), ${errorCount} failed`));
    }

  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}
