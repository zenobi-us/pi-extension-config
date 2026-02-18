# Changelog

## [0.1.0](https://github.com/zenobi-us/pi-extension-config/compare/v0.0.2...v0.1.0) (2026-02-18)


### Features

* **research:** complete research phase for event handler file watcher ([0a8ce68](https://github.com/zenobi-us/pi-extension-config/commit/0a8ce6818054ce13d7e541e6bb5cf359e4ba3d53))

## 0.0.2 (2026-02-16)


### ⚠ BREAKING CHANGES

* **config:** createConfigService now returns an object with a 'config' property instead of returning the config directly. Code must change from:   const config = await createConfigService('app')

### Features

* **config:** refactor ConfigService API to support mutable configuration ([83ef429](https://github.com/zenobi-us/pi-extension-config/commit/83ef42956b3f2dbd4ba4d977516f61b2116373c1))
* **demo:** add demo extension showcasing ConfigService usage ([e0aa037](https://github.com/zenobi-us/pi-extension-config/commit/e0aa037037663cacdea6ac7eb279db3c6ed5094f))
* initial implementation ([7e7f0f4](https://github.com/zenobi-us/pi-extension-config/commit/7e7f0f4fb05c6936861c35acb4ac7b29c095eb65))


### Bug Fixes

* add build config to support emitting types in build ([01ae1a4](https://github.com/zenobi-us/pi-extension-config/commit/01ae1a45d20d4412fc9e5f9c9bdf4327cf940638))
* add missing nconf dependency ([989629a](https://github.com/zenobi-us/pi-extension-config/commit/989629a5263ff90ca62b0f9d32b02dd633c239b0))
* reset version ([a3813b7](https://github.com/zenobi-us/pi-extension-config/commit/a3813b706275610d8136b67b26b22331d205dcae))
* **tests:** provide initial tests ([0b2575a](https://github.com/zenobi-us/pi-extension-config/commit/0b2575afd4100ae6ab4f519d365dd75b767cb66f))


### Miscellaneous Chores

* release 0.0.2 ([43d1130](https://github.com/zenobi-us/pi-extension-config/commit/43d113084896e93179626cf909d112d12fbb79bf))

## Changelog

All notable changes to this project will be documented here by Release Please.
