---
id: f72d1b89
title: Event Handler and File Watcher
created_at: 2026-02-17T17:25:51+10:30
updated_at: 2026-02-17T17:25:51+10:30
status: planning
---

# Event Handler and File Watcher

## Vision/Goal

Add an event-driven architecture to the ConfigService that enables consumers to subscribe to configuration changes. The file watching should be lazy/deferred - only activated when a consumer actually registers an event handler via `configService.on(...)`.

This design allows:
1. Zero overhead for consumers who don't need live updates
2. Clean, familiar event emitter API for those who do
3. Automatic file watching lifecycle management (start on first listener, stop when none remain)

## Success Criteria

- [ ] ConfigService exposes `.on(event, handler)` and `.off(event, handler)` methods. `.on(event, handler)` returns a function to remove the listener.
- [ ] File watching only starts when first `change` listener is registered
- [ ] File watching stops when last `change` listener is removed
- [ ] `change` event fires with new config when underlying files are modified
- [ ] Existing API remains backward compatible
- [ ] Types are properly exported
- [ ] Unit tests cover event handling and watcher lifecycle
- [ ] Documentation updated in README

## Phases

1. [Research Phase](./phase-8d45ab54-research-file-watching.md) - Explore file watching options in Bun, event emitter patterns
2. [Design Phase](./phase-b2c3d4e5-design-api.md) - Define API surface, types, and internal architecture
3. [Implementation Phase](./phase-c3d4e5f6-implementation.md) - Implement event emitter and deferred file watcher
4. [Testing Phase](./phase-d4e5f6a7-testing.md) - Write comprehensive tests
5. [Documentation Phase](./phase-e5f6a7b8-documentation.md) - Update README and examples

## Dependencies

- Bun's file watching capabilities (native `Bun.file` watchers or `fs.watch`)
- Understanding of nconf's file store locations

## Timeline

- Research: 1 session
- Design: 1 session (with human review)
- Implementation: 1-2 sessions
- Testing: 1 session
- Documentation: 1 session
