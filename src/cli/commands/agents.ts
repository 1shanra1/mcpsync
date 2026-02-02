import chalk from 'chalk';
import { table } from 'table';
import { adapterRegistry } from '../../adapters/index.js';

interface AgentsOptions {
  json?: boolean;
}

export async function agentsCommand(options: AgentsOptions, _cmd: unknown): Promise<void> {
  try {
    const detections = await adapterRegistry.detectAll();
    const adapters = adapterRegistry.getAll();

    if (options.json) {
      const output: Record<string, unknown> = {};
      for (const adapter of adapters) {
        const detection = detections.get(adapter.name);
        output[adapter.name] = {
          displayName: adapter.displayName,
          installed: detection?.installed ?? false,
          version: detection?.version,
          configPath: detection?.configPath,
          configExists: detection?.configExists ?? false,
          capabilities: adapter.capabilities,
        };
      }
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log(chalk.bold('\nDetected Coding Agents\n'));

    const data: string[][] = [
      [chalk.bold('Agent'), chalk.bold('Status'), chalk.bold('Version'), chalk.bold('Config')],
    ];

    let installedCount = 0;

    for (const adapter of adapters) {
      const detection = detections.get(adapter.name);
      const installed = detection?.installed ?? false;

      if (installed) installedCount++;

      const status = installed ? chalk.green('✓ Installed') : chalk.gray('Not found');

      const version = detection?.version ?? '-';

      let configStatus: string;
      if (!installed) {
        configStatus = '-';
      } else if (detection?.configExists) {
        configStatus = chalk.green('✓ Exists');
      } else {
        configStatus = chalk.yellow('Missing');
      }

      data.push([adapter.displayName, status, version, configStatus]);
    }

    console.log(
      table(data, {
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
        drawHorizontalLine: (index, _size) => index === 1,
      })
    );

    console.log(chalk.gray(`${installedCount}/${adapters.length} agents installed\n`));

    // Show capabilities legend
    console.log(chalk.bold('Capabilities by Agent:\n'));

    for (const adapter of adapters) {
      const detection = detections.get(adapter.name);
      if (!detection?.installed) continue;

      const caps = adapter.capabilities;
      const capList: string[] = [];

      if (caps.supportsHttp) capList.push('HTTP');
      if (caps.supportsOAuth) capList.push('OAuth');
      if (caps.supportsToolFiltering) capList.push('Tool Filtering');
      if (caps.supportsAutoApprove) capList.push('Auto Approve');
      if (caps.supportsTimeout) capList.push('Timeout');
      if (caps.supportsProjectScope) capList.push('Project Scope');

      console.log(
        `  ${chalk.cyan(adapter.displayName)}: ${chalk.gray(capList.join(', ') || 'Basic')}`
      );
    }

    console.log();
  } catch (error) {
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}
