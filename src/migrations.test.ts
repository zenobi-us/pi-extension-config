import { describe, expect, it } from 'vitest';
import {
  getMigrationResultJson,
  notifyMigrationResult,
  registerMigrationPreviewFlag,
  runMigrations,
  runUpMigrationsOnSessionStart,
  type Migration,
  type MigrationResult,
} from './migrations.ts';

type ConfigV0 = {
  feature?: string;
};

type ConfigV1 = {
  feature: string;
  enabled: boolean;
};

type ConfigV2 = {
  feature: string;
  enabled: boolean;
  mode: 'safe' | 'fast';
};

const migrations: Migration[] = [
  {
    id: '0-to-1',
    up: (config: ConfigV0): ConfigV1 => ({
      feature: config.feature ?? 'default',
      enabled: true,
    }),
    down: (config: ConfigV1): ConfigV0 => ({ feature: config.feature }),
  },
  {
    id: '1-to-2',
    up: (config: ConfigV1): ConfigV2 => ({
      feature: config.feature,
      enabled: config.enabled,
      mode: 'safe',
    }),
    down: (config: ConfigV2): ConfigV1 => ({
      feature: config.feature,
      enabled: config.enabled,
    }),
  },
];

function createFailedResult(): MigrationResult {
  return {
    status: 'failed',
    direction: 'up',
    initialVersion: 0,
    targetVersion: 1,
    finalVersion: 0,
    startedAt: '2026-03-05T00:00:00.000Z',
    finishedAt: '2026-03-05T00:00:00.010Z',
    durationMs: 10,
    appliedCount: 0,
    pendingCount: 0,
    failedCount: 1,
    warnings: ['used fallback defaults'],
    steps: [
      {
        id: '0-to-1',
        fromVersion: 0,
        toVersion: 1,
        direction: 'up',
        status: 'failed',
        durationMs: 10,
        startedAt: '2026-03-05T00:00:00.000Z',
        finishedAt: '2026-03-05T00:00:00.010Z',
        error: {
          message: 'parse failed',
          name: 'Error',
        },
      },
    ],
    failure: {
      migrationId: '0-to-1',
      fromVersion: 0,
      toVersion: 1,
      direction: 'up',
      message: 'parse failed',
    },
    config: { feature: 'default' },
  };
}

describe('runMigrations', () => {
  it('supports internal targetVersion path for tests/dev', async () => {
    const result = await runMigrations({
      config: { feature: 'x' },
      currentVersion: 0,
      migrations,
      targetVersion: 1,
    });

    expect(result.status).toBe('migrated');
    expect(result.initialVersion).toBe(0);
    expect(result.targetVersion).toBe(1);
    expect(result.finalVersion).toBe(1);
    expect(result.appliedCount).toBe(1);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.id).toBe('0-to-1');
    expect(result.config).toEqual({ feature: 'x', enabled: true });
  });
});

describe('runUpMigrationsOnSessionStart', () => {
  it('runs latest-only and fails fast on migration failures', async () => {
    const calledWith: Array<{ targetVersion?: number } | undefined> = [];

    const executor = {
      runMigrations: async (options?: { targetVersion?: number }): Promise<MigrationResult> => {
        calledWith.push(options);
        return createFailedResult();
      },
    };

    await expect(runUpMigrationsOnSessionStart(executor)).rejects.toThrow(
      'Migration failed at 0-to-1 (0 -> 1): parse failed'
    );

    expect(calledWith).toEqual([undefined]);
  });
});

describe('getMigrationResultJson', () => {
  it('returns detailed payload contract', () => {
    const result = createFailedResult();

    expect(getMigrationResultJson(result)).toEqual({
      status: 'failed',
      direction: 'up',
      initialVersion: 0,
      targetVersion: 1,
      finalVersion: 0,
      startedAt: '2026-03-05T00:00:00.000Z',
      finishedAt: '2026-03-05T00:00:00.010Z',
      durationMs: 10,
      appliedCount: 0,
      pendingCount: 0,
      failedCount: 1,
      warnings: ['used fallback defaults'],
      steps: [
        {
          id: '0-to-1',
          fromVersion: 0,
          toVersion: 1,
          direction: 'up',
          status: 'failed',
          durationMs: 10,
          startedAt: '2026-03-05T00:00:00.000Z',
          finishedAt: '2026-03-05T00:00:00.010Z',
          error: {
            message: 'parse failed',
            name: 'Error',
          },
        },
      ],
      failure: {
        migrationId: '0-to-1',
        fromVersion: 0,
        toVersion: 1,
        direction: 'up',
        message: 'parse failed',
      },
      config: { feature: 'default' },
    });
  });
});

describe('notifyMigrationResult', () => {
  it('sends concise summary via pitui.notify', async () => {
    const messages: string[] = [];

    await notifyMigrationResult(createFailedResult(), {
      notify: async (message: string): Promise<void> => {
        messages.push(message);
      },
    });

    expect(messages).toEqual(['Migration failed at 0-to-1 (0 -> 1): parse failed']);
  });
});

describe('registerMigrationPreviewFlag', () => {
  it('prints preview and exits immediately', async () => {
    const printed: string[] = [];
    const exitCodes: number[] = [];

    const handled = await registerMigrationPreviewFlag({
      argv: ['--preview-migrations'],
      preview: async () => ({
        status: 'preview',
        direction: 'up',
        initialVersion: 0,
        targetVersion: 2,
        finalVersion: 0,
        startedAt: '2026-03-05T00:00:00.000Z',
        finishedAt: '2026-03-05T00:00:00.001Z',
        durationMs: 1,
        appliedCount: 0,
        pendingCount: 2,
        failedCount: 0,
        warnings: [],
        steps: [
          {
            id: '0-to-1',
            fromVersion: 0,
            toVersion: 1,
            direction: 'up',
            status: 'pending',
            durationMs: 0,
            startedAt: '2026-03-05T00:00:00.000Z',
            finishedAt: '2026-03-05T00:00:00.000Z',
          },
          {
            id: '1-to-2',
            fromVersion: 1,
            toVersion: 2,
            direction: 'up',
            status: 'pending',
            durationMs: 0,
            startedAt: '2026-03-05T00:00:00.000Z',
            finishedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
        config: { feature: 'x' },
      }),
      print: (line: string): void => {
        printed.push(line);
      },
      exit: (code: number): never => {
        exitCodes.push(code);
        throw new Error('exit');
      },
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'exit') {
        return true;
      }
      throw error;
    });

    expect(handled).toBe(true);
    expect(printed).toContain('Migration preview (version 0 -> 2)');
    expect(printed).toContain('  - [pending] 0-to-1 (0 -> 1)');
    expect(printed).toContain('  - [pending] 1-to-2 (1 -> 2)');
    expect(exitCodes).toEqual([0]);
  });

  it('supports pending-nonzero preview exit mode', async () => {
    const exitCodes: number[] = [];

    await registerMigrationPreviewFlag({
      argv: ['--preview-migrations'],
      previewExitMode: 'pending-nonzero',
      preview: async () => ({
        status: 'preview',
        direction: 'up',
        initialVersion: 1,
        targetVersion: 2,
        finalVersion: 1,
        startedAt: '2026-03-05T00:00:00.000Z',
        finishedAt: '2026-03-05T00:00:00.001Z',
        durationMs: 1,
        appliedCount: 0,
        pendingCount: 1,
        failedCount: 0,
        warnings: [],
        steps: [
          {
            id: '1-to-2',
            fromVersion: 1,
            toVersion: 2,
            direction: 'up',
            status: 'pending',
            durationMs: 0,
            startedAt: '2026-03-05T00:00:00.000Z',
            finishedAt: '2026-03-05T00:00:00.000Z',
          },
        ],
        config: { feature: 'x' },
      }),
      print: (): void => {
        return;
      },
      exit: (code: number): void => {
        exitCodes.push(code);
      },
    });

    expect(exitCodes).toEqual([1]);
  });
});
