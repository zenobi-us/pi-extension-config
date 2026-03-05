# pi-extension-config

Type-safe, layered configuration for Pi extensions.

- stores config in `~/.pi/agent/<name>.config.json` and `.pi/<name>.config.json`
- supports environment variable overrides (`MYEXT_SOME_KEY`)
- optional validation with custom parser (byo schema like Zod/Typebox/Arktype/etc)
- unified API for reading/updating/saving config

## Usage

`pi-extension-config` provides a unified configuration service for Pi extensions with automatic config discovery and layered priority resolution.

**Config sources (highest priority first):**

1. **Environment variables** — `MYEXT_SOME_KEY` (prefix derived from app name)
2. **Project config** — `.pi/<name>.config.json` (in git root or cwd)
3. **Home config** — `~/.pi/agent/<name>.config.json`
4. **Defaults** — passed when creating the service

```typescript
import { createConfigService } from '@zenobius/pi-extension-config';


export default function MyExtension(pi: ExtensionApi) {
  // Create a typed config service
  const service = await createConfigService<MyConfig>('my-extension', {
    defaults: { timeout: 30, verbose: false },
    parse: (raw) => mySchema.parse(raw), // optional validation
  });

  // Read config
  console.log(service.config.timeout); // 30

  // Update and persist
  await service.set('timeout', 60, 'project');
  await service.save('project');

  // Reload from disk
  await service.reload();
}
```

## Installation

```bash
# bun
bun add @zenobius/pi-extension-config

# npm
npm install @zenobius/pi-extension-config

# pnpm
pnpm add @zenobius/pi-extension-config

# yarn
yarn add @zenobius/pi-extension-config
```

## API

### `createConfigService<TConfig>(name, options?)`

Creates a configuration service instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Extension name (used for file paths and env prefix) |
| `options.defaults` | `Partial<TConfig>` | Default values |
| `options.parse` | `(raw: unknown) => TConfig \| Promise<TConfig>` | Optional parser/validator |

### `ConfigService<TConfig>`

| Property/Method | Description |
|-----------------|-------------|
| `config` | Current configuration object (readonly) |
| `set(key, value, target?)` | Set a key (`target`: `'home'` or `'project'`) |
| `save(target?)` | Persist changes to disk |
| `reload()` | Reload configuration from all sources |

## Migration Guidance (Task 4 Contract)

### Migration model

- Migration chains are modeled as `Migration<From, To>[]`.
- Version numbers are positional: array index `0` is migration `0 -> 1`, index `1` is `1 -> 2`, etc.
- Baseline version is always `0`.
- Missing persisted version must be treated as `0` before planning/running migrations.

### `versionKey` and `exposeVersion` semantics

For migration-enabled factory wiring, maintainers should follow this contract:

- `versionKey` controls where version metadata is stored in persisted config.
- Default version key is `__configVersion`.
- Version metadata is persisted to disk so future runs know the starting version.
- `exposeVersion` defaults to `false` (version metadata hidden from normal config reads).
- `exposeVersion: true` allows version metadata to be surfaced intentionally.

### Startup helper and preview behavior

Migration helper APIs are exported from `src/migrations.ts`:

- `runUpMigrationsOnSessionStart(executor)` runs latest-only and fails fast on migration failure.
- `registerMigrationPreviewFlag(...)` supports CLI preview mode (default flag `--preview-migrations`):
  - prints migration plan with pending/applied step status
  - exits immediately after preview output
  - supports `previewExitMode`:
    - `'always-zero'` (default): always exits `0`
    - `'pending-nonzero'`: exits `1` when `pendingCount > 0`, else `0`

### Detailed JSON result + notify behavior

- `getMigrationResultJson(result)` returns a clone-safe detailed payload including:
  - `status`, `direction`, `initialVersion`, `targetVersion`, `finalVersion`
  - timing (`startedAt`, `finishedAt`, `durationMs`)
  - counts (`appliedCount`, `pendingCount`, `failedCount`)
  - `warnings`, per-step `steps[]`, and optional `failure` context
- `notifyMigrationResult(result, pitui)` emits a concise human summary via `pitui.notify(...)`:
  - failed: includes migration id, version transition, and error
  - migrated: includes applied step count and version transition
  - preview: includes pending step count and planned transition
  - noop: indicates already up to date

## Development

```bash
mise run build      # Build the module
mise run test       # Run tests
mise run lint       # Lint code
mise run lint:fix   # Fix linting issues
mise run format     # Format with Prettier
```

## Contributing

Contributions welcome! Here's how:

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feat/my-feature`
3. **Make changes** and add tests
4. **Run checks**: `mise run lint && mise run test`
5. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/): `feat: add feature`
6. **Open a PR** against `main`

### Code Style

- Single quotes, 2-space indentation, 100 char line width
- Explicit TypeScript types preferred
- Early returns over deep nesting
- Run `mise run format` before committing

## Release

See [RELEASE.md](RELEASE.md) for release instructions.

## License

See [LICENSE](LICENSE) for details.
