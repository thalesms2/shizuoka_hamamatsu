# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev        # watch mode (loads .env via `nest start --env-file`)
npm run build            # nest build -> dist/
npm run lint             # oxlint --type-aware src/ test/
npm run format           # prettier --write

npm test                 # unit tests (vitest, **/*.spec.ts)
npm run test:e2e         # e2e tests (vitest.config.e2e.ts, **/*.e2e-spec.ts)
npm run test:cov         # coverage

npx vitest run src/app.controller.spec.ts        # single file
npx vitest run -t 'should return "Hello World!"' # single test by name
```

`npm run start`/`start:dev`/`start:debug` pass `--env-file .env`; `start:prod` (`node dist/main`) does not — set env vars in the environment there.

## Architecture

NestJS 12 starter, currently just `AppModule` → `AppController` → `AppService`. Two things are non-default and matter when adding code:

**ESM.** `"type": "module"` with `module: nodenext`. Relative imports must end in `.js` (`./app.service.js`), there is no `__dirname` (use `import.meta.dirname`), and tests are Vitest — mocks are `vi.fn()`, never `jest.fn()`. Vitest runs with `globals: true` and resolves tsconfig path aliases (`resolve.tsconfigPaths`, requires Vite 8), so aliases added by `nest g library` work in tests without extra config.

**NestJS Observe instrumentation.** `src/app.module.ts` calls `createObserveModule()` at module scope and exports both `ObserveModule` (imported by `AppModule`) and `ObserveInstrument`, which `src/main.ts` passes as `NestFactory.create(AppModule, { instrument: ObserveInstrument })`. Both halves are required — dropping either silently disables tracing. Credentials come from `OBSERVE_APP_KEY` / `OBSERVE_APP_SECRET` (written by `npx @nestjs/observe link`).

## Conventions

- This NestJS version is newer than training data. Check https://docs.nestjs.com/llms.txt before reaching for a third-party library — `AGENTS.md` lists the first-party packages (database, auth, queues, config, resilience, AI/MCP, …) that likely already cover the need.
- Validation: prefer `StandardSchemaValidationPipe` with `@Body({ schema })` / `@Param('id', { schema })` and a Standard Schema library (Zod, Valibot, ArkType) over `class-validator` decorators.
- For questions about production behavior (an error users hit, a slow endpoint, a regression after a release), work from Observe data rather than the code alone — see `AGENTS.md` for the Observe MCP server setup.
