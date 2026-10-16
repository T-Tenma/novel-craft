# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope

This is a standalone Tauri v2 + React 19 + TypeScript desktop app (NovelCraft 小说工坊; window title says "StoryForge 故事工坊"). It has nothing to do with the Java/Maven monorepo in the parent directory. The parent `CLAUDE.md` and its wiki do not apply here, and the wiki has no pages for this project.

The app is a local tool for web-novel writers with four tabs (`ActiveTab` in the store): `deconstruct` (split and analyze a source novel) → `brainwave` (move a story skeleton to a new genre) → `write` (write side by side with the reference) → `review` (AI critique). All UI text and LLM prompts are in Chinese.

## Commands

```bash
npm run tauri dev        # desktop app (compiles Rust shell, 1280x820 window)
npm run dev              # browser-only mode at http://localhost:1420 (strictPort; Tauri expects this port)
npx vite build           # frontend bundle only -> dist/

cd src-tauri && cargo test                                         # Rust tests (parser + storage)
cd src-tauri && cargo test parser::tests::test_parse_novel_with_intro   # single Rust test

node --test src/services/llm.test.ts                               # TS tests (node:test, Node ≥23 strips types)
node --test --test-name-pattern="fallback" src/services/llm.test.ts     # single TS test
```

No ESLint/Prettier is configured. `npm run build` runs `tsc && vite build` and is also Tauri's `beforeBuildCommand`.

TS tests run on Node's built-in type stripping, not Vite, so any module a test imports has to work under plain Node ESM:
- Type-only imports must use `import type`. Otherwise Node tries to load them at runtime and fails (e.g. `ERR_UNSUPPORTED_DIR_IMPORT` on `'../types'`).
- Value imports need explicit `.ts` extensions (allowed by `allowImportingTsExtensions`).
- `*.test.ts` is excluded from `tsconfig.json` because `@types/node` isn't installed, so `tsc` does not type-check tests.

## Architecture

### Two runtimes: Tauri vs. browser fallback
The frontend has to work both inside Tauri and in a plain browser. `src/services/db.ts` is the only persistence layer. Each function checks `isTauri()` (`'__TAURI_INTERNALS__' in window`) and tries `invoke('db_*')`. If that fails, or when running outside Tauri, it falls back to `localStorage` (keys `novel_bookshelf_index`, `novel_meta_{novelId}`, `novel_analysis_{novelId}_{chapterId}`). Keep both paths working when you change persistence.

- `novelId` is derived from the file name (`file_name.replace(/[^a-zA-Z0-9_一-龥]/g, '_')`), and each `db.ts` function repeats this. Re-importing a file with the same name overwrites the earlier one (`INSERT OR REPLACE`).
- Tauri `invoke` arguments are camelCase on the JS side (`novelId`, `fileName`) because Tauri converts top-level Rust params. Fields of nested serde structs such as `AnalysisPayload` stay snake_case.
- Persistence is not symmetric. SQLite stores only `summary/tension_score/narrative_hook/technique_notes` per chapter plus aggregated characters/world elements. When analyses are reloaded from SQLite, `characters`/`world_elements` come back empty, and `paragraph_analyses` is never persisted. `deleteStoredNovel` clears only localStorage; there is no Tauri delete command.

### Rust backend (`src-tauri/src/`)
- `lib.rs` defines the commands. A new command needs `#[tauri::command]` plus an entry in `generate_handler![...]`.
- `parser.rs` splits chapters with a regex (`第N章/卷/回…`, `序章`, `尾声`, `番外`). Text before the first match becomes chapter id `0` ("引子 / 前言"). If nothing matches, the whole text becomes one chapter.
- `storage.rs` holds one `Mutex<Connection>` (rusqlite, bundled) at `{app_data_dir}/novel_craft.db`. Tables are `novels`, `chapters` (PK `(novel_id, id)`, `status` pending/analyzing/completed/failed), `characters` (UNIQUE `(novel_id, name)`, `appearance_count` incremented on upsert), and `world_elements`. The schema is plain `CREATE TABLE IF NOT EXISTS` in `init_tables` with no migrations, so a new column will not appear in existing user DBs unless you add an `ALTER` path.
- Rust does not proxy LLM calls. `reqwest`/`tokio` are declared in `Cargo.toml` but unused.

### Chapter splitting is implemented twice
The UI reads the uploaded `File` in `DeconstructView.tsx` (`readFileAsTextSmart`: strict UTF-8 first, then `gb18030`), then calls `invoke('parse_novel_text')`. If that fails (browser mode), it falls back to `splitNovelChaptersInBrowser` in the same file. The browser regex has drifted from `parser.rs`: it also matches `Chapter N`, numbered lines, and `序言`. If you change splitting behavior, change both or pick one on purpose. `parse_novel_file` (path-based, UTF-8 only) is registered but the UI never calls it.

### LLM layer (`src/services/llm.ts`)
- All model calls are frontend `fetch` requests to an OpenAI-compatible `/chat/completions` endpoint (bring your own model). `buildChatUrl` normalizes the base URL and adds `/v1/chat/completions` when needed. In browser mode the endpoint must allow CORS. Tauri sets `csp: null`.
- Every feature function follows the same pattern: build a Chinese system prompt that demands strict JSON → `callLLM(config, system, user)` → `extractAndParseJson<T>(raw, fallback?)`. The parser strips `<think>…</think>` (DeepSeek-R1), takes the content of ```json fences, then falls back to the outermost `{}`/`[]`. Result shapes live in `src/types/index.ts`, and new LLM features should follow the same pattern.
- Config comes from the store (`apiBaseUrl/apiKey/modelName`) and is persisted in localStorage as `novel_api_base/novel_api_key/novel_model_name`. The defaults (`http://127.0.0.1:8045`, `gemini-3.8-flash-high`) assume a local OpenAI-compatible proxy.
- `src/data/authorStyles.ts` (author style guidelines injected into prompts) and `src/data/promptArsenal.ts` (scene-technique prompt templates) are static prompt data. A test requires ≥5 author styles, each with a guideline longer than 50 chars.

### Batch analysis (`src/services/batchPipeline.ts`)
`batchPipeline` is a singleton. It starts `batchConcurrency` workers (default 2) that pull from a shared queue and sleep 300ms between calls. Pause polls a flag. Stop aborts an `AbortController` whose signal is never passed to `fetch`, so requests already in flight still finish. A failed chapter is logged and skipped. Each result goes to `persistChapterAnalysis` → `setChapterAnalysis` → `updateGlobalAggregations`. Progress is in `store.batchProgress`.

### State (`src/stores/novelStore.ts`)
There is a single Zustand store and no `persist` middleware. The writer's own book (`volumes` → chapters, `myCharacters`, `myWorldElements`, `ideas`, `prompts`) lives only in memory, is seeded with demo content, and is lost on reload. Export goes through `ExportProjectModal` (Blob download).
- `globalCharacters/globalWorldElements` are aggregated from the analyzed source novel and serve as reference. `myCharacters/myWorldElements` belong to the writer's new book. Keep the two sets separate.
- `draftTitle/draftContent` mirror the active chapter, and their setters write through to `volumes` via `updateChapterTitle/updateChapterContent`. `StoryChapter.reference_chapter_id` links a draft chapter to a source-novel chapter id.

### UI
`App.tsx` switches views by `activeTab`. Each view is a large single component under `src/components/{deconstruct,brainwave,editor,review}/` (`EditorView.tsx` is ~1250 lines, `DeconstructView.tsx` ~1070). Styling is Tailwind v4 through `@tailwindcss/vite` (no `tailwind.config`, `App.css` is just the import) on a dark `zinc` palette, with `lucide-react` icons. There is some narrow/mobile handling (`mobileView` in `DeconstructView`, viewport meta in `index.html`).
