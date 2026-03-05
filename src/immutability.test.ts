import { describe, expect, it } from 'vitest';
import { runMigrations, type Migration } from './migrations.ts';

type V0 = {
  feature?: string;
};

type V1 = {
  feature: string;
  enabled: boolean;
};

describe('migration immutability guards', () => {
  it('fails if an up migration mutates its input object', async () => {
    const input: V0 = { feature: 'legacy' };

    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: V0): V1 => {
          config.feature = 'MUTATED';
          return {
            feature: config.feature ?? 'default',
            enabled: true,
          };
        },
        down: (config: V1): V0 => ({
          feature: config.feature,
        }),
      },
    ];

    const result = await runMigrations({
      config: input,
      currentVersion: 0,
      migrations,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.message).toContain('mutated its input');
    expect(input).toEqual({ feature: 'legacy' });
  });

  it('fails if a down migration mutates its input object', async () => {
    const input: V1 = { feature: 'legacy', enabled: true };

    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: V0): V1 => ({
          feature: config.feature ?? 'default',
          enabled: true,
        }),
        down: (config: V1): V0 => {
          config.enabled = false;
          return {
            feature: config.feature,
          };
        },
      },
    ];

    const result = await runMigrations({
      config: input,
      currentVersion: 1,
      targetVersion: 0,
      migrations,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.message).toContain('mutated its input');
    expect(input).toEqual({ feature: 'legacy', enabled: true });
  });

  it('fails immutability checks even when structuredClone cannot clone the input payload', async () => {
    const input = {
      feature: 'legacy',
      callback: (): void => {
        return;
      },
    };

    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: typeof input): V1 => {
          config.feature = 'MUTATED';
          return {
            feature: config.feature,
            enabled: true,
          };
        },
        down: (config: V1): V0 => ({
          feature: config.feature,
        }),
      },
    ];

    const result = await runMigrations({
      config: input,
      currentVersion: 0,
      migrations,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.message).toContain('mutated its input');
    expect(input.feature).toBe('legacy');
  });
});
