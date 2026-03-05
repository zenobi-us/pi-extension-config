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

type Fixture = {
  config: V0 | V1 | V2;
  __configVersion?: number;
};

function resolveVersion(fixture: Fixture): number {
  return fixture.__configVersion ?? 0;
}

describe('migration fixtures matrix', () => {
  it('covers missing version key, intermediate version, and latest version states', async () => {
    const cases: Array<{
      name: string;
      fixture: Fixture;
      expectedStatus: 'migrated' | 'noop';
      expectedAppliedCount: number;
      expectedConfig: V2;
    }> = [
      {
        name: 'missing version key defaults to baseline 0',
        fixture: { config: { feature: 'legacy' } },
        expectedStatus: 'migrated',
        expectedAppliedCount: 2,
        expectedConfig: {
          feature: 'legacy',
          enabled: true,
          mode: 'safe',
        },
      },
      {
        name: 'intermediate version migrates remaining steps',
        fixture: {
          config: { feature: 'legacy', enabled: true },
          __configVersion: 1,
        },
        expectedStatus: 'migrated',
        expectedAppliedCount: 1,
        expectedConfig: {
          feature: 'legacy',
          enabled: true,
          mode: 'safe',
        },
      },
      {
        name: 'latest version is no-op',
        fixture: {
          config: { feature: 'legacy', enabled: true, mode: 'safe' },
          __configVersion: 2,
        },
        expectedStatus: 'noop',
        expectedAppliedCount: 0,
        expectedConfig: {
          feature: 'legacy',
          enabled: true,
          mode: 'safe',
        },
      },
    ];

    for (const testCase of cases) {
      const result = await runMigrations({
        config: testCase.fixture.config,
        currentVersion: resolveVersion(testCase.fixture),
        migrations,
      });

      expect(result.status, testCase.name).toBe(testCase.expectedStatus);
      expect(result.appliedCount, testCase.name).toBe(testCase.expectedAppliedCount);
      expect(result.finalVersion, testCase.name).toBe(2);
      expect(result.config, testCase.name).toEqual(testCase.expectedConfig);
    }
  });
});
