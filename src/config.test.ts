import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import nconf from 'nconf';
import { homedir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConfigService } from './config.ts';
import type { Migration } from './migrations.ts';

type MatrixCase = {
  name: string;
  hasDefaults: boolean;
  hasHomeFile: boolean;
  hasProjectFile: boolean;
};

type MatrixConfig = {
  defaultOnly?: string;
  homeOnly?: string;
  projectOnly?: string;
  shared?: string;
};

type ValidatedConfig = {
  retryCount: number;
  logLevel: 'debug' | 'info';
};

const DEFAULTS: MatrixConfig = {
  defaultOnly: 'default',
  shared: 'default',
};

const HOME_FILE: MatrixConfig = {
  homeOnly: 'home',
  shared: 'home',
};

const PROJECT_FILE: MatrixConfig = {
  projectOnly: 'project',
  shared: 'project',
};

const MATRIX_CASES: MatrixCase[] = [
  {
    name: 'no defaults, no home file, no project file',
    hasDefaults: false,
    hasHomeFile: false,
    hasProjectFile: false,
  },
  {
    name: 'no defaults, home file only',
    hasDefaults: false,
    hasHomeFile: true,
    hasProjectFile: false,
  },
  {
    name: 'no defaults, project file only',
    hasDefaults: false,
    hasHomeFile: false,
    hasProjectFile: true,
  },
  {
    name: 'no defaults, home and project files',
    hasDefaults: false,
    hasHomeFile: true,
    hasProjectFile: true,
  },
  {
    name: 'defaults only',
    hasDefaults: true,
    hasHomeFile: false,
    hasProjectFile: false,
  },
  {
    name: 'defaults and home file',
    hasDefaults: true,
    hasHomeFile: true,
    hasProjectFile: false,
  },
  {
    name: 'defaults and project file',
    hasDefaults: true,
    hasHomeFile: false,
    hasProjectFile: true,
  },
  {
    name: 'defaults, home file, and project file',
    hasDefaults: true,
    hasHomeFile: true,
    hasProjectFile: true,
  },
];

const HOME_ROOT = homedir();
const PROJECT_ROOT = process.cwd();

function ensureObject(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid config: expected an object.');
  }

  return input as Record<string, unknown>;
}

function readOptionalString(
  source: Record<string, unknown>,
  key: keyof MatrixConfig
): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid config: "${key}" must be a string.`);
  }

  return value;
}

function parseMatrixConfig(input: unknown): MatrixConfig {
  const source = ensureObject(input);
  const parsed: MatrixConfig = {};

  const defaultOnly = readOptionalString(source, 'defaultOnly');
  if (defaultOnly !== undefined) {
    parsed.defaultOnly = defaultOnly;
  }

  const homeOnly = readOptionalString(source, 'homeOnly');
  if (homeOnly !== undefined) {
    parsed.homeOnly = homeOnly;
  }

  const projectOnly = readOptionalString(source, 'projectOnly');
  if (projectOnly !== undefined) {
    parsed.projectOnly = projectOnly;
  }

  const shared = readOptionalString(source, 'shared');
  if (shared !== undefined) {
    parsed.shared = shared;
  }

  return parsed;
}

function parseValidatedConfig(input: unknown): ValidatedConfig {
  const source = ensureObject(input);

  const retryCount = source.retryCount;
  if (typeof retryCount !== 'number') {
    throw new Error('Invalid config: "retryCount" must be a number.');
  }

  const logLevel = source.logLevel;
  if (logLevel !== 'debug' && logLevel !== 'info') {
    throw new Error('Invalid config: "logLevel" must be "debug" or "info".');
  }

  return {
    retryCount,
    logLevel,
  };
}

function createExpectedConfig(testCase: MatrixCase): MatrixConfig {
  const expectedConfig: MatrixConfig = {};

  if (testCase.hasDefaults) {
    Object.assign(expectedConfig, DEFAULTS);
  }

  if (testCase.hasHomeFile) {
    Object.assign(expectedConfig, HOME_FILE);
  }

  if (testCase.hasProjectFile) {
    Object.assign(expectedConfig, PROJECT_FILE);
  }

  return expectedConfig;
}

function writeJsonFile(filePath: string, config: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config));
}

describe('createConfigService', () => {
  const createdFilePaths: string[] = [];

  beforeEach(() => {
    nconf.reset();
  });

  afterEach(() => {
    while (createdFilePaths.length > 0) {
      const filePath = createdFilePaths.pop();
      if (!filePath) {
        continue;
      }

      if (!fs.existsSync(filePath)) {
        continue;
      }

      fs.rmSync(filePath, { force: true });
    }

    nconf.reset();
  });

  it.each(MATRIX_CASES)('loads config matrix case: $name', async (testCase) => {
    const appName = `matrix-${randomUUID()}`;

    if (testCase.hasHomeFile) {
      const homeFilePath = path.join(HOME_ROOT, '.pi', 'agent', `${appName}.config.json`);
      writeJsonFile(homeFilePath, HOME_FILE);
      createdFilePaths.push(homeFilePath);
    }

    if (testCase.hasProjectFile) {
      const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);
      writeJsonFile(projectFilePath, PROJECT_FILE);
      createdFilePaths.push(projectFilePath);
    }

    const service = await createConfigService<MatrixConfig>(appName, {
      defaults: testCase.hasDefaults ? DEFAULTS : undefined,
      parse: parseMatrixConfig,
    });

    expect(service.config).toEqual(createExpectedConfig(testCase));
  });

  it('supports generic-only typing without a parse function', async () => {
    type TypedConfig = { featureEnabled: boolean };

    const service = await createConfigService<TypedConfig>(`typed-only-${randomUUID()}`, {
      defaults: { featureEnabled: true },
    });

    const featureEnabled: boolean = service.config.featureEnabled;
    expect(featureEnabled).toBe(true);
  });

  it('supports async parser/validator functions', async () => {
    const appName = `async-parse-${randomUUID()}`;
    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);

    writeJsonFile(projectFilePath, {
      retryCount: 3,
      logLevel: 'info',
    });
    createdFilePaths.push(projectFilePath);

    const service = await createConfigService(appName, {
      parse: async (input: unknown) => parseValidatedConfig(input),
    });

    expect(service.config).toEqual({ retryCount: 3, logLevel: 'info' });
  });

  it('surfaces parser/validator errors', async () => {
    const appName = `validator-errors-${randomUUID()}`;
    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);

    writeJsonFile(projectFilePath, {
      retryCount: 'three',
      logLevel: 42,
    });
    createdFilePaths.push(projectFilePath);

    await expect(
      createConfigService(appName, {
        parse: parseValidatedConfig,
      })
    ).rejects.toThrowError('Invalid config: "retryCount" must be a number.');
  });

  it('reloads config from disk', async () => {
    const appName = `reload-${randomUUID()}`;
    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);

    writeJsonFile(projectFilePath, {
      shared: 'before',
    });
    createdFilePaths.push(projectFilePath);

    const service = await createConfigService<MatrixConfig>(appName, {
      defaults: DEFAULTS,
      parse: parseMatrixConfig,
    });

    expect(service.config.shared).toBe('before');

    writeJsonFile(projectFilePath, {
      shared: 'after',
    });

    await service.reload();

    expect(service.config.shared).toBe('after');
  });

  it('set + save(project) persists updates', async () => {
    const appName = `save-project-${randomUUID()}`;

    const service = await createConfigService<MatrixConfig>(appName, {
      defaults: DEFAULTS,
      parse: parseMatrixConfig,
    });

    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);
    createdFilePaths.push(projectFilePath);

    await service.set('shared', 'saved-project', 'project');
    await service.save('project');

    const reloadedService = await createConfigService<MatrixConfig>(appName, {
      defaults: DEFAULTS,
      parse: parseMatrixConfig,
    });

    expect(reloadedService.config.shared).toBe('saved-project');
  });

  it('set + save(home) persists updates', async () => {
    const appName = `save-home-${randomUUID()}`;

    const service = await createConfigService<MatrixConfig>(appName, {
      defaults: DEFAULTS,
      parse: parseMatrixConfig,
    });

    const homeFilePath = path.join(HOME_ROOT, '.pi', 'agent', `${appName}.config.json`);
    createdFilePaths.push(homeFilePath);

    await service.set('shared', 'saved-home', 'home');
    await service.save('home');

    const reloadedService = await createConfigService<MatrixConfig>(appName, {
      defaults: DEFAULTS,
      parse: parseMatrixConfig,
    });

    expect(reloadedService.config.shared).toBe('saved-home');
  });

  it('runs migrations from baseline version 0 in array index order', async () => {
    const appName = `migrate-order-${randomUUID()}`;
    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);
    const callOrder: string[] = [];

    writeJsonFile(projectFilePath, {
      feature: 'legacy',
    });
    createdFilePaths.push(projectFilePath);

    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: Record<string, unknown>): Record<string, unknown> => {
          callOrder.push('0-to-1');
          return {
            ...config,
            enabled: true,
          };
        },
        down: (config: Record<string, unknown>): Record<string, unknown> => ({
          feature: config.feature,
        }),
      },
      {
        id: '1-to-2',
        up: (config: Record<string, unknown>): Record<string, unknown> => {
          callOrder.push('1-to-2');
          return {
            ...config,
            mode: 'safe',
          };
        },
        down: (config: Record<string, unknown>): Record<string, unknown> => ({
          feature: config.feature,
          enabled: config.enabled,
        }),
      },
    ];

    const service = await createConfigService<Record<string, unknown>>(appName, {
      migrations,
    });

    expect(callOrder).toEqual(['0-to-1', '1-to-2']);
    expect(service.config).toEqual({
      feature: 'legacy',
      enabled: true,
      mode: 'safe',
    });
  });

  it('persists final migration version using the default version key', async () => {
    const appName = `version-default-key-${randomUUID()}`;
    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);

    writeJsonFile(projectFilePath, {
      feature: 'legacy',
    });
    createdFilePaths.push(projectFilePath);

    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: Record<string, unknown>): Record<string, unknown> => ({
          ...config,
          enabled: true,
        }),
        down: (config: Record<string, unknown>): Record<string, unknown> => ({
          feature: config.feature,
        }),
      },
    ];

    const service = await createConfigService<Record<string, unknown>>(appName, {
      migrations,
    });

    await service.save('project');

    const persisted = JSON.parse(fs.readFileSync(projectFilePath, 'utf8')) as Record<
      string,
      unknown
    >;

    expect(persisted).toMatchObject({
      feature: 'legacy',
      enabled: true,
      __configVersion: 1,
    });
  });

  it('hides version metadata by default and exposes it when requested', async () => {
    const appName = `version-exposure-${randomUUID()}`;
    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);

    writeJsonFile(projectFilePath, {
      feature: 'legacy',
    });
    createdFilePaths.push(projectFilePath);

    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: Record<string, unknown>): Record<string, unknown> => ({
          ...config,
          enabled: true,
        }),
        down: (config: Record<string, unknown>): Record<string, unknown> => ({
          feature: config.feature,
        }),
      },
    ];

    const hidden = await createConfigService<Record<string, unknown>>(appName, {
      migrations,
      versionKey: 'schemaVersion',
    });

    expect(hidden.config).not.toHaveProperty('schemaVersion');

    const exposed = await createConfigService<Record<string, unknown>>(appName, {
      migrations,
      versionKey: 'schemaVersion',
      exposeVersion: true,
    });

    expect(exposed.config).toHaveProperty('schemaVersion', 1);
  });

  it('applies load flow as raw -> migrate -> merge defaults -> parse', async () => {
    const appName = `load-flow-${randomUUID()}`;
    const projectFilePath = path.join(PROJECT_ROOT, '.pi', `${appName}.config.json`);
    const steps: string[] = [];
    let parseInput: Record<string, unknown> | null = null;

    writeJsonFile(projectFilePath, {
      feature: 'legacy',
    });
    createdFilePaths.push(projectFilePath);

    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: Record<string, unknown>): Record<string, unknown> => {
          steps.push('migrate');
          expect(config.defaultOnly).toBeUndefined();
          return {
            ...config,
            migratedOnly: 'migrated',
          };
        },
        down: (config: Record<string, unknown>): Record<string, unknown> => ({
          feature: config.feature,
        }),
      },
    ];

    const service = await createConfigService<Record<string, unknown>>(appName, {
      defaults: {
        defaultOnly: 'default',
      },
      migrations,
      parse: (config: unknown): Record<string, unknown> => {
        steps.push('parse');
        parseInput = config as Record<string, unknown>;
        return parseInput;
      },
    });

    expect(steps).toEqual(['migrate', 'parse']);
    expect(parseInput).toMatchObject({
      feature: 'legacy',
      migratedOnly: 'migrated',
      defaultOnly: 'default',
    });
    expect(service.config).toMatchObject({
      feature: 'legacy',
      migratedOnly: 'migrated',
      defaultOnly: 'default',
    });
  });
});
