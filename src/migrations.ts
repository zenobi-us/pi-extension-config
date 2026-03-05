import { isDeepStrictEqual } from 'node:util';

/* eslint-disable no-unused-vars */
export type MigrationDirection = 'up' | 'down';
export type MigrationStatus = 'noop' | 'migrated' | 'failed' | 'preview';
export type MigrationStepStatus = 'applied' | 'pending' | 'failed' | 'skipped';
export type PreviewExitMode = 'always-zero' | 'pending-nonzero';

export interface Migration<From = unknown, To = unknown> {
  id: string;
  up(config: From): To | Promise<To>;
  down(config: To): From | Promise<From>;
  validate?(config: unknown): void | Promise<void>;
}

export interface MigrationStepError {
  message: string;
  name: string;
  stack?: string;
}

export interface MigrationStepResult {
  id: string;
  fromVersion: number;
  toVersion: number;
  direction: MigrationDirection;
  status: MigrationStepStatus;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  warning?: string;
  error?: MigrationStepError;
}

export interface MigrationFailureContext {
  migrationId: string;
  fromVersion: number;
  toVersion: number;
  direction: MigrationDirection;
  message: string;
}

export interface MigrationResult<TConfig = unknown> {
  status: MigrationStatus;
  direction: MigrationDirection;
  initialVersion: number;
  targetVersion: number;
  finalVersion: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  appliedCount: number;
  pendingCount: number;
  failedCount: number;
  warnings: string[];
  steps: MigrationStepResult[];
  failure?: MigrationFailureContext;
  config: TConfig;
}

export interface RunMigrationsOptions<TConfig = unknown> {
  config: TConfig;
  currentVersion: number;
  migrations: Migration[];
  targetVersion?: number;
  dryRun?: boolean;
  parse?: (config: unknown) => TConfig | Promise<TConfig>;
  now?: () => Date;
}

export interface MigrationExecutor {
  runMigrations(options?: { targetVersion?: number }): Promise<MigrationResult>;
}

export interface PituiNotifier {
  notify(message: string): void | Promise<void>;
}

export interface RegisterMigrationPreviewFlagOptions {
  argv?: string[];
  flag?: string;
  previewExitMode?: PreviewExitMode;
  preview(): Promise<MigrationResult>;
  print?(line: string): void;
  exit?(code: number): void | never;
}
/* eslint-enable no-unused-vars */

function toErrorSummary(error: unknown): MigrationStepError {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: 'Error',
  };
}

function cloneWithFallback(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);

    for (const item of value) {
      clone.push(cloneWithFallback(item, seen));
    }

    return clone;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>();
    seen.set(value, clone);

    for (const [entryKey, entryValue] of value.entries()) {
      clone.set(cloneWithFallback(entryKey, seen), cloneWithFallback(entryValue, seen));
    }

    return clone;
  }

  if (value instanceof Set) {
    const clone = new Set<unknown>();
    seen.set(value, clone);

    for (const entryValue of value.values()) {
      clone.add(cloneWithFallback(entryValue, seen));
    }

    return clone;
  }

  const proto = Object.getPrototypeOf(value);
  const clone = Object.create(proto) as Record<PropertyKey, unknown>;
  seen.set(value, clone);

  for (const key of Reflect.ownKeys(value)) {
    clone[key] = cloneWithFallback((value as Record<PropertyKey, unknown>)[key], seen);
  }

  return clone;
}

function cloneForImmutability(value: unknown): unknown {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      return cloneWithFallback(value, new WeakMap<object, unknown>());
    }
  }

  return cloneWithFallback(value, new WeakMap<object, unknown>());
}

function durationMs(from: Date, to: Date): number {
  return Math.max(0, to.getTime() - from.getTime());
}

export async function runMigrations<TConfig = unknown>(
  options: RunMigrationsOptions<TConfig>
): Promise<MigrationResult<TConfig>> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const initialVersion = options.currentVersion;
  const latestVersion = options.migrations.length;
  const targetVersion = options.targetVersion ?? latestVersion;

  if (!Number.isInteger(initialVersion) || initialVersion < 0) {
    throw new Error(`Invalid currentVersion: ${initialVersion}. Expected integer >= 0.`);
  }

  if (!Number.isInteger(targetVersion) || targetVersion < 0 || targetVersion > latestVersion) {
    throw new Error(
      `Invalid targetVersion: ${targetVersion}. Expected integer between 0 and ${latestVersion}.`
    );
  }

  const direction: MigrationDirection = targetVersion >= initialVersion ? 'up' : 'down';
  const isPreview = options.dryRun === true;
  const steps: MigrationStepResult[] = [];

  let currentVersion = initialVersion;
  let currentConfig: unknown = options.config;
  let failedDuringFinalParse = false;

  const applyStep = async (
    migration: Migration,
    fromVersion: number,
    toVersion: number,
    stepDirection: MigrationDirection
  ): Promise<void> => {
    const stepStarted = now();

    if (isPreview) {
      const stepFinishedPreview = now();
      steps.push({
        id: migration.id,
        fromVersion,
        toVersion,
        direction: stepDirection,
        status: 'pending',
        durationMs: durationMs(stepStarted, stepFinishedPreview),
        startedAt: stepStarted.toISOString(),
        finishedAt: stepFinishedPreview.toISOString(),
      });
      currentVersion = toVersion;
      return;
    }

    try {
      const migrationInput = cloneForImmutability(currentConfig);
      const migrationInputSnapshot = cloneForImmutability(migrationInput);

      let nextConfig: unknown;

      if (stepDirection === 'up') {
        if (typeof migration.up !== 'function') {
          throw new Error(`Migration ${migration.id} is missing required up() function.`);
        }

        nextConfig = await migration.up(migrationInput);
      } else {
        if (typeof migration.down !== 'function') {
          throw new Error(`Migration ${migration.id} is missing required down() function.`);
        }

        nextConfig = await migration.down(migrationInput);
      }

      if (!isDeepStrictEqual(migrationInput, migrationInputSnapshot)) {
        throw new Error(
          `Migration ${migration.id} mutated its input during ${stepDirection}. Return a new object instead.`
        );
      }

      if (typeof migration.validate === 'function') {
        await migration.validate(nextConfig);
      }

      currentConfig = nextConfig;
      currentVersion = toVersion;
      const stepFinished = now();

      steps.push({
        id: migration.id,
        fromVersion,
        toVersion,
        direction: stepDirection,
        status: 'applied',
        durationMs: durationMs(stepStarted, stepFinished),
        startedAt: stepStarted.toISOString(),
        finishedAt: stepFinished.toISOString(),
      });
    } catch (error: unknown) {
      const stepFinished = now();
      const errorSummary = toErrorSummary(error);

      steps.push({
        id: migration.id,
        fromVersion,
        toVersion,
        direction: stepDirection,
        status: 'failed',
        durationMs: durationMs(stepStarted, stepFinished),
        startedAt: stepStarted.toISOString(),
        finishedAt: stepFinished.toISOString(),
        error: errorSummary,
      });

      throw error;
    }
  };

  try {
    if (targetVersion > initialVersion) {
      for (let version = initialVersion + 1; version <= targetVersion; version += 1) {
        const migration = options.migrations[version - 1];
        if (!migration) {
          throw new Error(`Missing migration for version step ${version - 1} -> ${version}`);
        }

        await applyStep(migration, version - 1, version, 'up');
      }
    } else if (targetVersion < initialVersion) {
      for (let version = initialVersion; version > targetVersion; version -= 1) {
        const migration = options.migrations[version - 1];
        if (!migration) {
          throw new Error(`Missing migration for version step ${version - 1} -> ${version}`);
        }

        await applyStep(migration, version, version - 1, 'down');
      }
    }

    if (!isPreview && options.parse) {
      try {
        currentConfig = await options.parse(currentConfig);
      } catch (error: unknown) {
        failedDuringFinalParse = true;
        throw error;
      }
    }
  } catch (error: unknown) {
    const finished = now();
    const errorSummary = toErrorSummary(error);
    const failureStep = steps.at(-1);
    const stepFailed = failureStep?.status === 'failed';

    return {
      status: 'failed',
      direction,
      initialVersion,
      targetVersion,
      finalVersion: currentVersion,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: durationMs(started, finished),
      appliedCount: steps.filter((step) => step.status === 'applied').length,
      pendingCount: steps.filter((step) => step.status === 'pending').length,
      failedCount: steps.filter((step) => step.status === 'failed').length,
      warnings: [],
      steps,
      failure: {
        migrationId: stepFailed
          ? (failureStep?.id ?? 'unknown')
          : failedDuringFinalParse
            ? 'final-parse'
            : 'unknown',
        fromVersion: stepFailed ? (failureStep?.fromVersion ?? currentVersion) : currentVersion,
        toVersion: stepFailed ? (failureStep?.toVersion ?? currentVersion) : currentVersion,
        direction: stepFailed ? (failureStep?.direction ?? direction) : direction,
        message: errorSummary.message,
      },
      config: currentConfig as TConfig,
    };
  }

  const finished = now();
  const pendingCount = steps.filter((step) => step.status === 'pending').length;
  const appliedCount = steps.filter((step) => step.status === 'applied').length;

  let status: MigrationStatus;
  if (isPreview) {
    status = 'preview';
  } else if (appliedCount === 0) {
    status = 'noop';
  } else {
    status = 'migrated';
  }

  return {
    status,
    direction,
    initialVersion,
    targetVersion,
    finalVersion: currentVersion,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: durationMs(started, finished),
    appliedCount,
    pendingCount,
    failedCount: 0,
    warnings: [],
    steps,
    config: currentConfig as TConfig,
  };
}

export async function runUpMigrationsOnSessionStart(
  executor: MigrationExecutor
): Promise<MigrationResult> {
  const result = await executor.runMigrations();

  if (result.status === 'failed' && result.failure) {
    throw new Error(
      `Migration failed at ${result.failure.migrationId} (${result.failure.fromVersion} -> ${result.failure.toVersion}): ${result.failure.message}`
    );
  }

  return result;
}

export function getMigrationResultJson<TConfig = unknown>(
  result: MigrationResult<TConfig>
): MigrationResult<TConfig> {
  return {
    ...result,
    warnings: [...result.warnings],
    steps: result.steps.map((step) => ({ ...step })),
    failure: result.failure ? { ...result.failure } : undefined,
  };
}

function toNotifySummary(result: MigrationResult): string {
  if (result.status === 'failed' && result.failure) {
    return `Migration failed at ${result.failure.migrationId} (${result.failure.fromVersion} -> ${result.failure.toVersion}): ${result.failure.message}`;
  }

  if (result.status === 'migrated') {
    return `Applied ${result.appliedCount} migration step(s) (${result.initialVersion} -> ${result.finalVersion}).`;
  }

  if (result.status === 'preview') {
    return `Migration preview: ${result.pendingCount} pending step(s) (${result.initialVersion} -> ${result.targetVersion}).`;
  }

  return `Migrations already up to date at version ${result.finalVersion}.`;
}

export async function notifyMigrationResult(
  result: MigrationResult,
  pitui: PituiNotifier
): Promise<void> {
  await pitui.notify(toNotifySummary(result));
}

function defaultPrint(line: string): void {
  process.stdout.write(`${line}\n`);
}

function resolvePreviewExitCode(result: MigrationResult, mode: PreviewExitMode): number {
  if (mode === 'always-zero') {
    return 0;
  }

  return result.pendingCount > 0 ? 1 : 0;
}

function buildPreviewLines(result: MigrationResult): string[] {
  const lines: string[] = [];
  lines.push(`Migration preview (version ${result.initialVersion} -> ${result.targetVersion})`);

  if (result.steps.length === 0) {
    lines.push('  (no migration steps)');
    return lines;
  }

  for (const step of result.steps) {
    lines.push(`  - [${step.status}] ${step.id} (${step.fromVersion} -> ${step.toVersion})`);
  }

  return lines;
}

export async function registerMigrationPreviewFlag(
  options: RegisterMigrationPreviewFlagOptions
): Promise<boolean> {
  const argv = options.argv ?? process.argv.slice(2);
  const flag = options.flag ?? '--preview-migrations';

  if (!argv.includes(flag)) {
    return false;
  }

  const previewResult = await options.preview();
  const print = options.print ?? defaultPrint;

  for (const line of buildPreviewLines(previewResult)) {
    print(line);
  }

  const exit = options.exit ?? process.exit;
  const mode = options.previewExitMode ?? 'always-zero';
  exit(resolvePreviewExitCode(previewResult, mode));

  return true;
}
