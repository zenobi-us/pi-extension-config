---
id: d4c3b2a1
title: config-data-flow
created_at: 2026-02-15T19:36:15+10:30
updated_at: 2026-02-15T19:36:15+10:30
status: in-progress
area: data-flow
tags:
  - runtime
  - configuration
learned_from:
  - src/config.ts
---

# Data Flow State Machine

```text
[START]
   |
   v
[INPUT]
(name, schema, options)
   |
   v
[ENV_LOAD]
read PI_FOOTER_* variables via nconf.env
   |
   v
[USER_FILE_LOAD]
~/.pi/agent/pi-footer.config.json
   |
   v
[ROOT_DISCOVERY]
`git rev-parse --show-toplevel`
   |
   v
[LOCAL_FILE_LOAD]
<repo>/.pi/pi-footer.config.json
   |
   v
[DEFAULTS_APPLY]
options.defaults
   |
   v
[MERGE_AND_LOAD]
nconf.load()
   |
   v
[VALIDATE]
schema['~standard'].validate(nconf.get())
   |
   +--> success --> [RETURN_CONFIG]
   |
   +--> failure --> [RETURN_VALIDATION_RESULT]
```
