import chalk from 'chalk';
import { ConfigManager } from '../../core/config.js';
import { adapterRegistry } from '../../adapters/index.js';
import { validateConfigSafe } from '../../core/schema.js';

export async function doctorCommand(
  _options: unknown,
  cmd: { parent?: { opts: () => { config?: string } } }
): Promise<void> {
  const configManager = new ConfigManager({
    configPath: cmd.parent?.opts().config,
  });

  let hasErrors = false;
  let hasWarnings = false;

  console.log(chalk.bold('\n🩺 MCP Sync Health Check\n'));

  // ==========================================================================
  // Check canonical config
  // ==========================================================================

  console.log(chalk.bold('Canonical Configuration'));
  console.log(chalk.gray('─'.repeat(50)));

  const configPath = configManager.getConfigPath();
  console.log(`  Path: ${chalk.cyan(configPath)}`);

  if (!configManager.exists()) {
    console.log(chalk.red('  ✗ Config file not found'));
    console.log(chalk.gray('    Run "mcp-sync init" to create one'));
    hasErrors = true;
  } else {
    console.log(chalk.green('  ✓ Config file exists'));

    try {
      const config = configManager.get();
      console.log(chalk.green('  ✓ Valid YAML'));

      const validation = validateConfigSafe(config);
      if (validation.success) {
        console.log(chalk.green('  ✓ Schema valid'));
      } else {
        console.log(chalk.red('  ✗ Schema validation failed'));
        for (const error of validation.error.errors) {
          console.log(chalk.red(`    - ${error.path.join('.')}: ${error.message}`));
        }
        hasErrors = true;
      }

      const serverCount = Object.keys(config.servers).length;
      console.log(`  ${chalk.gray('Servers:')} ${serverCount}`);

      if (serverCount === 0) {
        console.log(chalk.yellow('  ⚠ No servers configured'));
        hasWarnings = true;
      }
    } catch (error) {
      console.log(chalk.red(`  ✗ ${error instanceof Error ? error.message : error}`));
      hasErrors = true;
    }
  }

  console.log();

  // ==========================================================================
  // Check agents
  // ==========================================================================

  console.log(chalk.bold('Agent Status'));
  console.log(chalk.gray('─'.repeat(50)));

  const detections = await adapterRegistry.detectAll();
  const adapters = adapterRegistry.getAll();

  let config;
  try {
    config = configManager.exists() ? configManager.get() : null;
  } catch {
    config = null;
  }

  for (const adapter of adapters) {
    const detection = detections.get(adapter.name);

    console.log(`\n  ${chalk.bold(adapter.displayName)}`);

    if (!detection?.installed) {
      console.log(chalk.gray('    Not installed'));
      continue;
    }

    console.log(
      chalk.green(`    ✓ Installed`) +
        chalk.gray(detection.version ? ` (v${detection.version})` : '')
    );

    if (detection.configPath) {
      console.log(`    ${chalk.gray('Config:')} ${detection.configPath}`);
    }

    if (detection.configExists) {
      console.log(chalk.green('    ✓ Config exists'));
    } else {
      console.log(chalk.yellow('    ⚠ Config file missing'));
      hasWarnings = true;
    }

    // Check sync status if we have a canonical config
    if (config && detection.configExists) {
      try {
        const agentConfig = await adapter.read();

        if (agentConfig) {
          const canonicalServers = Object.keys(config.servers).filter((name) => {
            const server = config.servers[name];
            const excluded = config.exclusions?.some(
              (e) => e.server === name && e.agent === adapter.name
            );
            const disabled = server.agents?.[adapter.name]?.enabled === false;
            return !excluded && !disabled;
          });

          const agentServers = Object.keys(agentConfig.servers);

          // Find missing in agent
          const missingInAgent = canonicalServers.filter((s) => !agentServers.includes(s));
          // Find extra in agent (not in canonical)
          const extraInAgent = agentServers.filter((s) => !canonicalServers.includes(s));

          if (missingInAgent.length === 0 && extraInAgent.length === 0) {
            console.log(chalk.green('    ✓ In sync'));
          } else {
            if (missingInAgent.length > 0) {
              console.log(chalk.yellow(`    ⚠ Missing: ${missingInAgent.join(', ')}`));
              hasWarnings = true;
            }
            if (extraInAgent.length > 0) {
              console.log(chalk.gray(`    ℹ Extra (not in canonical): ${extraInAgent.join(', ')}`));
            }
          }
        }
      } catch (error) {
        console.log(
          chalk.yellow(
            `    ⚠ Could not read config: ${error instanceof Error ? error.message : error}`
          )
        );
        hasWarnings = true;
      }
    }

    // Validate capabilities vs config
    if (config) {
      const validation = adapter.validate(config);
      for (const issue of validation.issues) {
        if (issue.type === 'error') {
          console.log(chalk.red(`    ✗ ${issue.message}`));
          hasErrors = true;
        } else {
          console.log(chalk.yellow(`    ⚠ ${issue.message}`));
          hasWarnings = true;
        }
      }
    }
  }

  console.log();

  // ==========================================================================
  // Summary
  // ==========================================================================

  console.log(chalk.gray('─'.repeat(50)));

  if (hasErrors) {
    console.log(chalk.red('\n✗ Issues found that need attention'));
    process.exit(1);
  } else if (hasWarnings) {
    console.log(chalk.yellow('\n⚠ Some warnings - review above'));
    process.exit(0);
  } else {
    console.log(chalk.green('\n✓ Everything looks good!'));
    process.exit(0);
  }
}
