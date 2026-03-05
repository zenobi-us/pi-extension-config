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

describe('final parse and optional per-migration validators', () => {
  it('supports successful per-step validators plus final parse', async () => {
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
        validate: (config: V1): void => {
          if (config.enabled !== true) {
            throw new Error('expected enabled=true after 0-to-1');
          }
        },
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

    const result = await runMigrations({
      config: { feature: 'legacy' },
      currentVersion: 0,
      migrations,
      parse: (value: unknown): V2 => {
        if (value === null || typeof value !== 'object') {
          throw new Error('final parse expected object');
        }

        const parsed = value as Record<string, unknown>;

        if (typeof parsed.feature !== 'string') {
          throw new Error('final parse expected feature:string');
        }

        if (typeof parsed.enabled !== 'boolean') {
          throw new Error('final parse expected enabled:boolean');
        }

        if (parsed.mode !== 'safe') {
          throw new Error('final parse expected mode=safe');
        }

        return {
          feature: parsed.feature,
          enabled: parsed.enabled,
          mode: 'safe',
        };
      },
    });

    expect(result.status).toBe('migrated');
    expect(result.config).toEqual({
      feature: 'legacy',
      enabled: true,
      mode: 'safe',
    });
  });

  it('fails when an optional per-migration validator rejects output', async () => {
    const migrations: Migration[] = [
      {
        id: '0-to-1',
        up: (config: V0): V1 => ({
          feature: config.feature ?? 'default',
          enabled: false,
        }),
        down: (config: V1): V0 => ({
          feature: config.feature,
        }),
        validate: (config: V1): void => {
          if (config.enabled !== true) {
            throw new Error('enabled must be true');
          }
        },
      },
    ];

    const result = await runMigrations({
      config: { feature: 'legacy' },
      currentVersion: 0,
      migrations,
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.migrationId).toBe('0-to-1');
    expect(result.failure?.message).toBe('enabled must be true');
  });

  it('fails when final parse rejects the migrated config', async () => {
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
    ];

    const result = await runMigrations({
      config: { feature: 'legacy' },
      currentVersion: 0,
      migrations,
      parse: (): V1 => {
        throw new Error('invalid final config payload');
      },
    });

    expect(result.status).toBe('failed');
    expect(result.failure?.migrationId).toBe('final-parse');
    expect(result.failure?.message).toBe('invalid final config payload');
  });
});
