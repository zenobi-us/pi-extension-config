---
id: a1b2c3d4
title: codebase-codemap
created_at: 2026-02-15T19:36:15+10:30
updated_at: 2026-02-17T17:27:00+10:30
status: in-progress
area: codebase-structure
tags:
  - architecture
  - codemap
learned_from:
  - README.md
  - src/index.ts
  - src/config.ts
---

# Codebase Codemap

## Current Architecture

```text
[Repo Root]
   |
   +--> [src/index.ts] --exports--> [createConfigService]
   |                                  |
   |                                  v
   |                           [src/config.ts]
   |                                  |
   |      +---------------------------+----------------------------+
   |      |                            |                            |
   |      v                            v                            v
   |  [nconf env()]            [nconf file(): home]       [nconf file(): project]
   |      |                            |                            |
   |      +----------------------------+----------------------------+
   |                                   |
   |                                   v
   |                         [nconf defaults + load]
   |                                   |
   |                                   v
   |                         [parse/validation]
   |                                   |
   |                +------------------+------------------+
   |                |                                     |
   |                v                                     v
   |         [validated config]                   [parse error]
   |
   +--> [dist/] build outputs
   +--> [mise.toml] task entrypoints
```

## Planned Architecture (Epic f72d1b89)

```text
[ConfigService]
   |
   +-- config (getter)
   +-- set(key, value, target)
   +-- reload()
   +-- save(target)
   |
   +-- [NEW] on(event, handler)  ----+
   +-- [NEW] off(event, handler) ----+---> [EventEmitter]
   +-- [NEW] once(event, handler) ---+          |
                                               |
                                    +---------+----------+
                                    |                    |
                              [listener count]    [file watcher]
                                    |                    |
                                    v                    v
                             count > 0 ?          DEFERRED START
                                    |                    |
                                    +--------------------+
                                               |
                                               v
                                    [watch home + project files]
                                               |
                                               v
                                    [on change: reload() + emit]
```

## Key Design Pattern: Deferred File Watching

```text
[Consumer Code]
     |
     v
configService.on('change', handler)
     |
     v
[Check listener count]
     |
     +-- first listener? --> [Start file watcher]
     |
     +-- already watching --> [Add to listener set]
     
     
[Consumer Code]
     |
     v
configService.off('change', handler)
     |
     v
[Remove from listener set]
     |
     v
[Check listener count]
     |
     +-- count === 0 --> [Stop file watcher]
     |
     +-- count > 0 --> [Keep watching]
```
