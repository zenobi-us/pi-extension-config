import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { type as arkType } from 'arktype';
import nconf from 'nconf';
import { homedir } from 'os';
import path from 'path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConfigService } from './config.ts';

const require = createRequire(import.meta.url);
const vfs = require('node-vfs-polyfill') as {
  create: (provider: unknown, options?: Record<string, unknown>) => MountedVfs;
  MemoryProvider: new () => unknown;
};

type MountedVfs = {
  mkdirSync: (filePath: string, options?: { recursive?: boolean }) => void;
  writeFileSync: (filePath: string, contents: string) => void;
  mount: (mountPoint: string) => void;
  unmount: () => void;
};

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

const FAKE_HOME = homedir();
const FAKE_GIT_ROOT = '/virtual/repo';

function mountJsonFile(
  mountPoint: string,
  filePath: string,
  config: Record<string, unknown>
): MountedVfs {
  const filesystem = vfs.create(new vfs.MemoryProvider(), { overlay: true });
  const directory = path.posix.dirname(filePath);

  filesystem.mkdirSync(directory, { recursive: true });
  filesystem.writeFileSync(filePath, JSON.stringify(config));
  filesystem.mount(mountPoint);

  return filesystem;
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

function buildArkTypeParser() {
  const schema = arkType({
    defaultOnly: 'string?',
    homeOnly: 'string?',
    projectOnly: 'string?',
    shared: 'string?',
  });

  return (input: unknown): MatrixConfig => {
    const result = schema(input);
    if (result instanceof arkType.errors) {
      const details = result
        .map((error) => `- ${error.path.join('.')}: ${error.message}`)
        .join('\n');
      throw new Error(`ArkType validation failed:\n${details}`);
    }

    return result;
  };
}

function buildTypeBoxParser() {
  const schema = Type.Object({
    defaultOnly: Type.Optional(Type.String()),
    homeOnly: Type.Optional(Type.String()),
    projectOnly: Type.Optional(Type.String()),
    shared: Type.Optional(Type.String()),
  });

  return createTypeBoxParser(schema);
}

function createTypeBoxParser<TSchemaType extends TSchema>(schema: TSchemaType) {
  return (input: unknown): Static<TSchemaType> => {
    const withSchemaDefaults = Value.Default(schema, input);
    if (Value.Check(schema, withSchemaDefaults)) {
      return withSchemaDefaults as Static<TSchemaType>;
    }

    const details = [...Value.Errors(schema, withSchemaDefaults)]
      .map((error) => {
        const normalizedPath = error.path.replace(/^\//, '').replace(/\//g, '.');
        const printablePath = normalizedPath.length > 0 ? normalizedPath : '<root>';
        return `- ${printablePath}: ${error.message}`;
      })
      .join('\n');

    throw new Error(`TypeBox validation failed:\n${details}`);
  };
}

describe('createConfigService', () => {
  const activeFileSystems: MountedVfs[] = [];

  beforeEach(() => {
    nconf.reset();

    (globalThis as Record<string, unknown>).Bun = {
      $: () => ({
        text: async () => `${FAKE_GIT_ROOT}\n`,
      }),
    };
  });

  afterEach(() => {
    while (activeFileSystems.length > 0) {
      const filesystem = activeFileSystems.pop();
      filesystem?.unmount();
    }

    nconf.reset();
    delete (globalThis as Record<string, unknown>).Bun;
  });

  describe.each([
    ['arktype', buildArkTypeParser],
    ['typebox', buildTypeBoxParser],
  ])('%s parser support', (engineName, createParser) => {
    it.each(MATRIX_CASES)('loads config matrix case: $name', async (testCase) => {
      const appName = `matrix-${engineName}`;

      if (testCase.hasHomeFile) {
        activeFileSystems.push(
          mountJsonFile(FAKE_HOME, `/.pi/agent/${appName}.config.json`, HOME_FILE)
        );
      }

      if (testCase.hasProjectFile) {
        activeFileSystems.push(
          mountJsonFile(FAKE_GIT_ROOT, `/.pi/${appName}.config.json`, PROJECT_FILE)
        );
      }

      const loadedConfig = await createConfigService<MatrixConfig>(appName, {
        defaults: testCase.hasDefaults ? DEFAULTS : undefined,
        parse: createParser(),
      });

      const expectedConfig = createExpectedConfig(testCase);
      expect(loadedConfig).toMatchObject(expectedConfig);

      if (!testCase.hasDefaults) {
        expect(loadedConfig.defaultOnly).toBeUndefined();
      }
      if (!testCase.hasHomeFile) {
        expect(loadedConfig.homeOnly).toBeUndefined();
      }
      if (!testCase.hasProjectFile) {
        expect(loadedConfig.projectOnly).toBeUndefined();
      }
    });
  });

  it('supports generic-only typing without a parse function', async () => {
    type TypedConfig = { featureEnabled: boolean };

    const config = await createConfigService<TypedConfig>('typed-only', {
      defaults: { featureEnabled: true },
    });

    const featureEnabled: boolean = config.featureEnabled;
    expect(featureEnabled).toBe(true);
  });

  it('pretty prints TypeBox schema errors', async () => {
    const appName = 'typebox-errors';
    activeFileSystems.push(
      mountJsonFile(FAKE_GIT_ROOT, `/.pi/${appName}.config.json`, {
        retryCount: 'three',
        logLevel: 42,
      })
    );

    const parse = createTypeBoxParser(
      Type.Object({
        retryCount: Type.Number(),
        logLevel: Type.Union([Type.Literal('debug'), Type.Literal('info')]),
      })
    );

    await expect(
      createConfigService(appName, {
        parse,
      })
    ).rejects.toThrowError(
      [
        'TypeBox validation failed:',
        '- retryCount: Expected number',
        '- logLevel: Expected union value',
      ].join('\n')
    );
  });

  it('pretty prints ArkType schema errors', async () => {
    const appName = 'ark-errors';
    activeFileSystems.push(
      mountJsonFile(FAKE_GIT_ROOT, `/.pi/${appName}.config.json`, {
        retryCount: 'three',
        logLevel: 42,
      })
    );

    const schema = arkType({
      retryCount: 'number',
      logLevel: '"debug" | "info"',
    });

    const parse = (input: unknown) => {
      const result = schema(input);
      if (result instanceof arkType.errors) {
        const details = result
          .map((error) => `- ${error.path.join('.')}: ${error.message}`)
          .join('\n');
        throw new Error(`ArkType validation failed:\n${details}`);
      }

      return result;
    };

    await expect(
      createConfigService(appName, {
        parse,
      })
    ).rejects.toThrowError(
      [
        'ArkType validation failed:',
        '- retryCount: retryCount must be a number (was a string)',
        '- logLevel: logLevel must be "debug" or "info" (was a number)',
      ].join('\n')
    );
  });
});
