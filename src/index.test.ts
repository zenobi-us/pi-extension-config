import { describe, expect, it } from 'vitest';
import * as api from './index.ts';

describe('public API surface', () => {
  it('exports migration helpers from the package root', () => {
    expect(typeof api.runMigrations).toBe('function');
    expect(typeof api.runUpMigrationsOnSessionStart).toBe('function');
    expect(typeof api.getMigrationResultJson).toBe('function');
    expect(typeof api.notifyMigrationResult).toBe('function');
    expect(typeof api.registerMigrationPreviewFlag).toBe('function');
  });
});
