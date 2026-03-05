import { describe, expect, it } from 'vitest';
import { runMigrations, type Migration } from './migrations.ts';

type V0 = {
  feature?: string;
};

type V1 = {
  feature: string;
  enabled: boolean;
};

type V2 = {
  feature: string;
  enabled: boolean;
  mode: 'safe';
};

const migrations: Migration[] = [
  {
    id: '0-to-1',
    up: (config: V0): V1 => ({
      feature: config.feature ?? 'default',
      enabled: true,
    }),
    down: (config: V1): V0 => ({
      feature: config.feature,
    }),
  },
  {
    id: '1-to-2',
    up: (config: V1): V2 => ({
      feature: config.feature,
      enabled: config.enabled,
      mode: 'safe',
    }),
    down: (config: V2): V1 => ({
      feature: config.feature,
      enabled: config.enabled,
    }),
  },
];

describe('up migration baseline and repeat behavior', () => {
  it('migrates baseline v0 to latest then no-ops on repeat run', async () => {
    const firstRun = await runMigrations({
      config: { feature: 'legacy' },
      currentVersion: 0,
      migrations,
    });

    expect(firstRun.status).toBe('migrated');
    expect(firstRun.initialVersion).toBe(0);
    expect(firstRun.finalVersion).toBe(2);
    expect(firstRun.appliedCount).toBe(2);
    expect(firstRun.config).toEqual({
      feature: 'legacy',
      enabled: true,
      mode: 'safe',
    });

    const secondRun = await runMigrations({
      config: firstRun.config,
      currentVersion: firstRun.finalVersion,
      migrations,
    });

    expect(secondRun.status).toBe('noop');
    expect(secondRun.appliedCount).toBe(0);
    expect(secondRun.steps).toHaveLength(0);
    expect(secondRun.finalVersion).toBe(2);
    expect(secondRun.config).toEqual(firstRun.config);
  });
});
