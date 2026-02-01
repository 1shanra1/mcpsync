import chalk from 'chalk';
import { table } from 'table';
import { ConfigManager } from '../../core/config.js';

interface ListOptions {
  json?: boolean;
}

export async function listCommand(
  options: ListOptions,
  cmd: { parent?: { opts: () => { config?: string } } }
): Promise<void> {
  const configManager = new ConfigManager({
    configPath: cmd.parent?.opts().config,
  });

  try {
    if (!configManager.exists()) {
      console.log(chalk.yellow('No config file found. Run "mcp-sync init" first.'));
      process.exit(1);
    }

    const servers = configManager.listServers();

    if (servers.length === 0) {
      console.log(chalk.gray('No servers configured.'));
      console.log(chalk.gray('Use "mcp-sync add <n>" to add one.'));
      return;
    }

    if (options.json) {
      const output: Record<string, unknown> = {};
      for (const { name, server } of servers) {
        output[name] = server;
      }
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Table output
    const data: string[][] = [
      [chalk.bold('Name'), chalk.bold('Type'), chalk.bold('Target'), chalk.bold('Description')],
    ];

    for (const { name, server } of servers) {
      const type = server.type;
      let target: string;

      if (server.type === 'stdio') {
        target = `${server.command} ${(server.args ?? []).join(' ')}`.trim();
        if (target.length > 50) {
          target = target.substring(0, 47) + '...';
        }
      } else {
        target = server.url;
        if (target.length > 50) {
          target = target.substring(0, 47) + '...';
        }
      }

      data.push([
        chalk.cyan(name),
        type,
        chalk.gray(target),
        server.description ?? '',
      ]);
    }

    console.log();
    console.log(table(data, {
      border: {
        topBody: '',
        topJoin: '',
        topLeft: '',
        topRight: '',
        bottomBody: '',
        bottomJoin: '',
        bottomLeft: '',
        bottomRight: '',
        bodyLeft: '',
        bodyRight: '',
        bodyJoin: chalk.gray('│'),
        joinBody: chalk.gray('─'),
        joinLeft: '',
        joinRight: '',
        joinJoin: chalk.gray('┼'),
      },
      drawHorizontalLine: (index, size) => index === 1,
    }));

    console.log(chalk.gray(`${servers.length} server(s) configured`));

  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}
