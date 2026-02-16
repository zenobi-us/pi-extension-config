import nconf from 'nconf';
import { homedir } from 'os';
import path from 'path';

// eslint-disable-next-line no-unused-vars
export type ConfigParseFn<TConfig> = (config: unknown) => TConfig | Promise<TConfig>;

export interface CreateConfigServiceOptions<TConfig> {
  defaults?: Partial<TConfig>;
  parse?: ConfigParseFn<TConfig>;
}

/* eslint-disable no-unused-vars */
export interface ConfigService<TConfig> {
  readonly config: TConfig;
  set(key: string, value: unknown, target?: 'home' | 'project'): Promise<void>;
  reload(): Promise<void>;
  save(target?: 'home' | 'project'): Promise<void>;
}

type NconfStore = {
  set?(key: string, value: unknown): unknown;
  saveSync?(): unknown;
  save?(value: unknown, callback: (error?: Error | null) => void): void;
};
/* eslint-enable no-unused-vars */

type NconfProviderWithStores = nconf.Provider & {
  stores?: Record<string, NconfStore>;
};

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
): Promise<ConfigService<TConfig>> {
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

  provider.load();

  const getConfig = async (): Promise<TConfig> => {
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
  };

  let config = await getConfig();

  async function set(
    key: string,
    value: unknown,
    target: 'home' | 'project' = 'project'
  ): Promise<void> {
    const store = (provider as NconfProviderWithStores).stores?.[target];
    if (!store || typeof store.set !== 'function') {
      throw new Error(`Config target '${target}' does not support setting keys.`);
    }

    store.set(key, value);
    config = await getConfig();
  }

  async function reload(): Promise<void> {
    provider.load();
    config = await getConfig();
  }

  async function save(target: 'home' | 'project' = 'home'): Promise<void> {
    const store = (provider as NconfProviderWithStores).stores?.[target];
    if (!store) {
      throw new Error(`Unknown config target: ${target}`);
    }

    if (typeof store.saveSync === 'function') {
      store.saveSync();
      await reload();
      return;
    }

    if (typeof store.save === 'function') {
      await new Promise<void>((resolve, reject) => {
        store.save?.(undefined, (error?: Error | null) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      await reload();
      return;
    }

    throw new Error(`Config target '${target}' does not support saving.`);
  }

  return {
    get config() {
      return config;
    },
    set,
    reload,
    save,
  };
}
