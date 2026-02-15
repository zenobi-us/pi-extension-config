import nconf from 'nconf';
import { homedir } from 'os';
import path from 'path';

export type ConfigParseFn<TConfig> = (config: unknown) => TConfig | Promise<TConfig>;

export interface CreateConfigServiceOptions<TConfig> {
  defaults?: Partial<TConfig>;
  parse?: ConfigParseFn<TConfig>;
}

async function discoverGitRoot(): Promise<string | null> {
  try {
    const root = await Bun.$`git rev-parse --show-toplevel`.text();
    const trimmedRoot = root.trim();
    if (trimmedRoot.length === 0) {
      return null;
    }

    return trimmedRoot;
  } catch {
    return null;
  }
}

export async function createConfigService<TConfig = Record<string, unknown>>(
  name: string,
  options?: CreateConfigServiceOptions<TConfig>
): Promise<TConfig> {
  const appname = name;
  const envprefix = appname.toUpperCase().replace(/-/g, '_') + '_';

  const provider = new nconf.Provider();

  // Env
  provider.env({
    separator: '__',
    match: new RegExp(`^${envprefix}`),
  });

  const root = await discoverGitRoot();

  // Files
  // The local config file is stored in the git root directory under .pi/<app>.config.json
  provider.file('project', {
    file: path.join(root || process.cwd(), '.pi', `${appname}.config.json`),
  });

  // The main config file is stored in the user's home directory under .pi/agent/<app>.config.json
  provider.file('home', {
    file: path.join(homedir(), '.pi', 'agent', `${appname}.config.json`),
  });

  /*
   * Reload values from env + config file and return the normalized config snapshot.
   */
  provider.load();

  const loadedConfig: unknown = provider.get();
  const rawConfig: unknown =
    loadedConfig !== null && typeof loadedConfig === 'object'
      ? {
          ...(options?.defaults || {}),
          ...(loadedConfig as Record<string, unknown>),
        }
      : { ...(options?.defaults || {}) };
  if (!options?.parse) {
    return rawConfig as TConfig;
  }

  return await options.parse(rawConfig);
}
