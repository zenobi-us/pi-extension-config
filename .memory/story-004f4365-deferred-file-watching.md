---
id: 004f4365
title: Deferred File Watching via Event Handlers
created_at: 2026-02-17T17:26:30+10:30
updated_at: 2026-02-17T17:26:30+10:30
status: planning
epic_id: f72d1b89
priority: high
story_points: 5
---

# Deferred File Watching via Event Handlers

## User Story

As a **library consumer**, I want to **subscribe to configuration changes using `configService.on('change', handler)`** so that **my application can react to config file modifications without polling, and the file watching overhead only exists when I actually need it**.

## Acceptance Criteria

- [ ] ConfigService interface includes `.on(event, handler)` method
- [ ] ConfigService interface includes `.off(event, handler)` method  
- [ ] Calling `.on('change', handler)` starts file watching if not already started
- [ ] Calling `.off('change', handler)` for the last listener stops file watching
- [ ] The `change` event callback receives the updated config object
- [ ] If no listeners are registered, no file watching overhead exists
- [ ] Multiple listeners can be registered simultaneously
- [ ] `.once('change', handler)` registers a one-time listener (optional)
- [ ] Types for event names and handlers are properly exported
- [ ] Backward compatibility: existing usage without events continues to work

## Context

The current ConfigService provides a static config that can be manually reloaded. Users wanting live updates must implement their own file watching. By deferring file watching until consumers register event handlers, we:

1. Maintain zero overhead for simple use cases
2. Provide a clean, familiar API for reactive use cases
3. Automatically manage watcher lifecycle based on listener count

## Out of Scope

- Watching for changes to environment variables (only file-based configs)
- Debounce configuration (use sensible defaults)
- Custom file watch implementations (use Bun/Node.js built-ins)

## Tasks

_To be populated during Task Breakdown phase_

## Notes

Key design question from user:
> "we should explore if we can defer file watching until consumer of the library implements configService.on(....)"

This is the core architectural principle - lazy/deferred activation of file watchers.
