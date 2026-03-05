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

const reversibleMigrations: Migration[] = [
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

describe('down migration correctness and required down contract', () => {
  it('reverses from latest to baseline for reversible flows', async () => {
    const baseline: V0 = { feature: 'legacy' };

    const upResult = await runMigrations({
      config: baseline,
      currentVersion: 0,
      migrations: reversibleMigrations,
    });

    const downResult = await runMigrations({
      config: upResult.config,
      currentVersion: upResult.finalVersion,
      targetVersion: 0,
      migrations: reversibleMigrations,
    });

    expect(downResult.status).toBe('migrated');
    expect(downResult.direction).toBe('down');
    expect(downResult.appliedCount).toBe(2);
    expect(downResult.finalVersion).toBe(0);
    expect(downResult.config).toEqual(baseline);
  });

  it('fails when a down migration is missing in a reverse path', async () => {
    const missingDown = {
      id: '0-to-1',
      up: (config: V0): V1 => ({
        feature: config.feature ?? 'default',
        enabled: true,
      }),
    };

    const result = await runMigrations({
      config: { feature: 'legacy', enabled: true } as V1,
      currentVersion: 1,
      targetVersion: 0,
      migrations: [missingDown as unknown as Migration],
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.migrationId).toBe('0-to-1');
    expect(result.failure?.direction).toBe('down');
    expect(result.failure?.message).toContain('down');
  });
});
