import chalk from 'chalk';
import { input, select, confirm } from '@inquirer/prompts';
import { parse as parseShellArgs } from 'shell-quote';
import { ConfigManager, createStdioServer, createHttpServer } from '../../core/config.js';
import { StdioServer, HttpServer } from '../../core/schema.js';
import { redactSecrets } from '../utils/redact.js';

interface AddOptions {
  type?: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: string[];
  header?: string[];
  description?: string;
}

export async function addCommand(
  name: string,
  options: AddOptions,
  cmd: { parent?: { opts: () => { config?: string } } }
): Promise<void> {
  const configManager = new ConfigManager({
    configPath: cmd.parent?.opts().config,
  });

  try {
    // Ensure config exists
    if (!configManager.exists()) {
      console.log(chalk.yellow('No config file found. Run "mcp-sync init" first.'));
      process.exit(1);
    }

    // Check if server already exists
    const existing = configManager.getServer(name);
    if (existing) {
      console.log(chalk.red(`Server '${name}' already exists.`));
      console.log(chalk.gray(`Use 'mcp-sync remove ${name}' to remove it first.`));
      process.exit(1);
    }

    let server: StdioServer | HttpServer;

    // Interactive mode if minimal options provided
    const isInteractive = !options.command && !options.url;

    if (isInteractive) {
      server = await interactiveAdd(name, options);
    } else {
      server = buildServerFromOptions(name, options);
    }

    // Add server to config
    configManager.addServer(name, server);
    console.log(chalk.green(`✓ Added server '${name}'`));

    // Show what was added
    console.log(chalk.gray('\nServer configuration:'));
    console.log(chalk.gray(JSON.stringify(redactSecrets(server), null, 2)));

    console.log(
      chalk.cyan('\nRun ') + chalk.bold('mcp-sync push') + chalk.cyan(' to sync to all agents')
    );
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      // User cancelled
      process.exit(0);
    }
    console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

async function interactiveAdd(
  name: string,
  options: AddOptions
): Promise<StdioServer | HttpServer> {
  console.log(chalk.bold(`\nAdding server: ${name}\n`));

  // Server type
  const serverType =
    options.type ??
    (await select({
      message: 'Server type',
      choices: [
        { name: 'stdio - Local command', value: 'stdio' as const },
        { name: 'http - Remote URL', value: 'http' as const },
      ],
    }));

  if (serverType === 'stdio') {
    return await interactiveAddStdio(options);
  } else {
    return await interactiveAddHttp(options);
  }
}

async function interactiveAddStdio(options: AddOptions): Promise<StdioServer> {
  // Command
  const command =
    options.command ??
    (await input({
      message: 'Command',
      default: 'npx',
      validate: (v) => v.length > 0 || 'Command is required',
    }));

  // Args
  let args: string[] = options.args ?? [];
  if (args.length === 0) {
    const argsStr = await input({
      message: 'Arguments (supports quoted strings)',
      default: '',
    });
    if (argsStr.trim()) {
      const parsed = parseShellArgs(argsStr);
      // Filter to only string entries (shell-quote can return operators)
      args = parsed.filter((arg): arg is string => typeof arg === 'string');
    }
  }

  // Environment variables
  const env: Record<string, string> = {};
  if (options.env) {
    for (const e of options.env) {
      const [key, ...valueParts] = e.split('=');
      env[key] = valueParts.join('=');
    }
  }

  const addEnv = await confirm({
    message: 'Add environment variables?',
    default: false,
  });

  if (addEnv) {
    let addMore = true;
    while (addMore) {
      const key = await input({
        message: 'Variable name',
        validate: (v) => v.length > 0 || 'Name is required',
      });

      const value = await input({
        message: `Value for ${key} (use \${VAR} to reference env)`,
      });

      env[key] = value;

      addMore = await confirm({
        message: 'Add another variable?',
        default: false,
      });
    }
  }

  // Description
  const description =
    options.description ??
    (await input({
      message: 'Description (optional)',
      default: '',
    }));

  return createStdioServer(command, args, env, {
    description: description || undefined,
  });
}

async function interactiveAddHttp(options: AddOptions): Promise<HttpServer> {
  // URL
  const url =
    options.url ??
    (await input({
      message: 'Server URL',
      validate: (v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return 'Invalid URL';
        }
      },
    }));

  // Headers
  const headers: Record<string, string> = {};

  const addHeaders = await confirm({
    message: 'Add headers?',
    default: false,
  });

  if (addHeaders) {
    let addMore = true;
    while (addMore) {
      const key = await input({
        message: 'Header name',
        validate: (v) => v.length > 0 || 'Name is required',
      });

      const value = await input({
        message: `Value for ${key} (use \${VAR} to reference env)`,
      });

      headers[key] = value;

      addMore = await confirm({
        message: 'Add another header?',
        default: false,
      });
    }
  }

  // Auth
  const auth = await select({
    message: 'Authentication',
    choices: [
      { name: 'None', value: 'none' as const },
      { name: 'OAuth', value: 'oauth' as const },
      { name: 'Bearer token', value: 'bearer' as const },
    ],
  });

  // Description
  const description =
    options.description ??
    (await input({
      message: 'Description (optional)',
      default: '',
    }));

  return createHttpServer(url, headers, {
    auth,
    description: description || undefined,
  });
}

function buildServerFromOptions(name: string, options: AddOptions): StdioServer | HttpServer {
  if (options.type === 'http' || options.url) {
    if (!options.url) {
      throw new Error('URL is required for HTTP servers');
    }
    // Parse headers from --header flag
    const headers: Record<string, string> = {};
    if (options.header) {
      for (const h of options.header) {
        const [key, ...valueParts] = h.split('=');
        headers[key] = valueParts.join('=');
      }
    }
    return createHttpServer(options.url, headers, {
      description: options.description,
    });
  }

  // stdio server - use --env for environment
  const env: Record<string, string> = {};
  if (options.env) {
    for (const e of options.env) {
      const [key, ...valueParts] = e.split('=');
      env[key] = valueParts.join('=');
    }
  }

  if (!options.command) {
    throw new Error('Command is required for stdio servers');
  }

  return createStdioServer(options.command, options.args ?? [], env, {
    description: options.description,
  });
}
