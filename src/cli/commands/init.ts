import chalk from 'chalk';
import { ConfigManager } from '../../core/config.js';
import { adapterRegistry } from '../../adapters/index.js';

export async function initCommand(
  options: { force?: boolean },
  cmd: { parent?: { opts: () => { config?: string } } }
): Promise<void> {
  const configManager = new ConfigManager({
    configPath: cmd.parent?.opts().config,
  });

  const configPath = configManager.getConfigPath();

  try {
    // Check if already exists
    if (configManager.exists() && !options.force) {
      console.log(chalk.yellow(`Config file already exists: ${configPath}`));
      console.log(chalk.gray('Use --force to overwrite'));
      return;
    }

    // Initialize config
    configManager.init(options.force);
    console.log(chalk.green(`✓ Created ${configPath}`));

    // Detect agents
    console.log(chalk.gray('\nDetecting installed agents...'));
    const detections = await adapterRegistry.detectAll();

    const installed: string[] = [];
    for (const [name, detection] of detections) {
      if (detection.installed) {
        installed.push(name);
        console.log(
          chalk.green(`  ✓ ${name}`) +
            chalk.gray(detection.version ? ` (v${detection.version})` : '')
        );
      }
    }

    if (installed.length === 0) {
      console.log(chalk.yellow('  No supported agents detected'));
    } else {
      console.log(chalk.gray(`\nDetected ${installed.length} agent(s)`));
    }

    console.log(chalk.cyan('\nNext steps:'));
    console.log(chalk.gray('  1. Add servers:    ') + 'mcp-sync add github');
    console.log(chalk.gray('  2. Push to agents: ') + 'mcp-sync push');
    console.log(chalk.gray('  3. Check status:   ') + 'mcp-sync doctor');
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}
