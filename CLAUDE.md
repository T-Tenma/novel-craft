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
CI=true npm run tauri build   # release .app + .dmg; CI=true skips the Finder AppleScript step, which times out (-1712) without macOS Automation permission

cd src-tauri && cargo test                                         # Rust tests (parser + storage)
cd src-tauri && cargo test parser::tests::test_parse_novel_with_intro   # single Rust test

node --test "src/**/*.test.ts"                                     # all TS tests (node:test, Node ≥23 strips types)
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

- `novelId` is derived from the file name (`file_name.replace(/[^a-zA-Z0-9_一-龥]/g, '_')`), and each `db.ts` function repeats this. Re-importing a file with the same name overwrites the earlier book and clears its analyses: SQLite drops the old chapters, and `persistNovel` clears the localStorage chapter caches (`clearAnalysisCaches`). The UI asks for confirmation first (`importConfirmMessage` in `src/utils/novelSwitch.ts`).
- Tauri `invoke` arguments are camelCase on the JS side (`novelId`, `fileName`) because Tauri converts top-level Rust params. Fields of nested serde structs such as `AnalysisPayload` stay snake_case.
- Persistence is not symmetric. SQLite stores only `summary/tension_score/narrative_hook/technique_notes` per chapter plus aggregated characters/world elements. When analyses are reloaded from SQLite, per-chapter `characters`/`world_elements` come back empty; the novel-level lists are read back separately by `loadStoredGlobalAssets` (`db_get_novel_report`, mapped in `src/services/assetRecords.ts`) into the store's `setGlobalAssets`. `paragraph_analyses` is never persisted. `deleteStoredNovel` deletes the SQLite rows (`db_delete_novel`, one transaction) and also clears the localStorage meta, bookshelf entry and `novel_analysis_{novelId}_{n}` caches (exact match via `isAnalysisCacheKey`).
- If the localStorage fallback itself fails (quota), `persistNovel`/`persistChapterAnalysis` throw a user-facing message. Callers keep the data in memory and show the message instead of treating it as a hard failure.

### Rust backend (`src-tauri/src/`)
- `lib.rs` defines the commands. A new command needs `#[tauri::command]` plus an entry in `generate_handler![...]`.
- `parser.rs` splits chapters with a regex (`第N章/卷/回…`, `序章`, `尾声`, `番外`). Text before the first match becomes chapter id `0` ("引子 / 前言"). If nothing matches, the whole text becomes one chapter.
- `storage.rs` holds one `Mutex<Connection>` (rusqlite, bundled) at `{app_data_dir}/novel_craft.db`. `DbState::new` returns `Result`. If it fails, `lib.rs` does not `manage()` the state, every `db_*` command returns an error, and `db.ts` falls back to localStorage, so the app never panics at startup. `insert_novel_with_chapters` runs in one transaction (dropped = rolled back) and first deletes the novel id's old chapters, characters and world_elements, so re-importing a file starts fresh. Tables are `novels`, `chapters` (PK `(novel_id, id)`, `status` pending/analyzing/completed/failed), `characters` (UNIQUE `(novel_id, name)`, `appearance_count` incremented on upsert), and `world_elements`. The schema is plain `CREATE TABLE IF NOT EXISTS` in `init_tables` with no migrations, so a new column will not appear in existing user DBs unless you add an `ALTER` path.
- Rust does not proxy LLM calls. `reqwest`/`tokio` are declared in `Cargo.toml` but unused.

### Chapter splitting is implemented twice
The UI reads the uploaded `File` in `DeconstructView.tsx` (`readFileAsTextSmart`: strict UTF-8 first, then `gb18030`), then calls `invoke('parse_novel_text')`. If that fails (browser mode), it falls back to `splitNovelChaptersInBrowser` in the same file. The browser regex has drifted from `parser.rs`: it also matches `Chapter N`, numbered lines, and `序言`. If you change splitting behavior, change both or pick one on purpose. `parse_novel_file` (path-based, UTF-8 only) is registered but the UI never calls it.

### LLM layer (`src/services/llm.ts`)
- All model calls are frontend `fetch` requests to an OpenAI-compatible `/chat/completions` endpoint (bring your own model). `buildChatUrl` normalizes the base URL and adds `/v1/chat/completions` when needed. In browser mode the endpoint must allow CORS. Services that don't (currently only `edge.v2ex.com/chat/v1/*`) are rewritten by `routeThroughSiteProxy` (`src/services/corsProxy.ts`) to a same-origin path `/llm-proxy/v2ex/...`. Two configs serve that path: the `routes` entry in `vercel.json` for the deployed site, and `server.proxy`/`preview.proxy` in `vite.config.ts` for local dev. Keep all three in sync. Both proxies replace the browser User-Agent, because v2ex's Cloudflare answers a browser UA coming from a non-browser TLS client with a 403 challenge page. Vercel caps proxied requests at 120s. The desktop app calls directly and has no proxy. Tauri sets `csp: null`.
- HTTP goes through `fetchTextWithRetry` in `src/services/http.ts`. Defaults:
  - a 120s timeout that covers reading the body;
  - an optional caller `signal`;
  - exponential-backoff retry on network errors and 408/429/5xx;
  - no retry after a timeout or a cancel.

  The connection test uses a 30s timeout and no retries.
- `analyzeChapterWithLLM` sends the chapter as numbered paragraphs (`[n] …`) built by `src/utils/paragraphs.ts`. Over-long chapters keep the head (60%) and the tail (40%), because the chapter-ending hook matters. The UI must split paragraphs with the same `splitParagraphs`, and must map `paragraph_analyses` through `assignParagraphAnalyses`, never by raw `index`. Paragraphs without an analysis show nothing; there is no fallback to another paragraph's analysis.
- Every feature function follows the same pattern: build a Chinese system prompt that demands strict JSON → `callLLM(config, system, user, { signal? })` → `extractAndParseJson<T>(raw, fallback?)`. The parser strips reasoning via `stripThinking` (`src/services/thinking.ts`: paired `<think>…</think>`, a dangling `</think>` whose opening tag a proxy dropped, and an unfinished `<think>`), takes the content of ```json fences, then falls back to the outermost `{}`/`[]`. Prose functions (`generateInspirationDraft` / `expandStoryDraft` / `polishStoryDraft`) also return `stripThinking(...)`, since their output is written straight into the chapter. Result shapes live in `src/types/index.ts`, and new LLM features should follow the same pattern. Parsed JSON then goes through a `normalize*` function in `src/services/normalize.ts`: if a required field (an overall score, a chapter summary or tension score) is missing it returns `null` and the caller throws a retry error; optional text stays empty (the UI shows「模型未给出」). Never invent scores or canned comments as fallbacks.
- Editor AI calls only see the current chapter unless the caller adds context. `src/utils/storyContext.ts` builds it: `buildStoryContext` gives the volume outline, `myCharacters` / `myWorldElements` (dead characters marked), earlier chapter titles and the previous chapter (whole, or head plus tail past 3000 chars), and is passed to 示范初稿, 续写, 主编旁批 and the 技法库 templates. The consistency check (防吃设定) only gets `buildPreviousChapterContext`, because it already receives the settings (with character `status`) as JSON. The review (送审) gets `buildReviewContext`, which marks settings whose name does not appear in the text up to that chapter as possibly later ones, so earlier chapters are not asked to include them. Diagnosis and the consistency check send a head-plus-tail excerpt (`excerptHeadTail`), so chapter endings get checked. 续写 takes an optional author direction from the「续写方向」input. Paragraph critique runs in batches of `CRITIQUE_BATCH_SIZE` (`startParagraph`, with chapter-wide indexes). 润色 replaces the whole chapter, and `polishLengthWarning` flags length changes over ±30%, since models ignore the length limit in the prompt.
- Config comes from the store (`apiBaseUrl/apiKey/modelName`) and is persisted in localStorage as `novel_api_base/novel_api_key/novel_model_name`. The defaults (`http://127.0.0.1:8045`, `gemini-3.8-flash-high`) assume a local OpenAI-compatible proxy.
- `src/data/authorStyles.ts` (author style guidelines injected into prompts) and `src/data/promptArsenal.ts` (scene-technique prompt templates) are static prompt data. A test requires ≥5 author styles, each with a guideline longer than 50 chars.

### Batch analysis (`src/services/batchPipeline.ts`)
`batchPipeline` is a singleton. It starts `batchConcurrency` workers (default 2) that pull from a shared queue and sleep 300ms between calls. Pause polls a flag. Each batch captures its own `AbortController.signal`, so `stop()` cancels the requests already in flight, and workers from a stopped batch exit even if a new batch has started. Each result goes to the store first (`setChapterAnalysis` → `updateGlobalAggregations`, skipped if the user has since switched to another novel, because chapter ids collide across novels) and then to `persistChapterAnalysis` under the batch's own `novelFileName`. Switching novels while a batch runs asks for confirmation and stops it (`mustStopBatchBeforeSwitch`; reopening the same novel does not). Importing a file or loading the sample always stops it (`mustStopBatchBeforeImport`), and results that arrive after `stop()` are dropped. Single-chapter and single-paragraph analysis capture the novel and chapter text at request time; `chapterResultTarget` drops a late result if a same-name re-import changed that chapter. Failed and unsaved chapters are counted and reported in the final `batchProgress.currentTitle`.

### State (`src/stores/novelStore.ts`)
There is a single Zustand store. It is wrapped in `persist`, which saves the writer's project to localStorage under the key `novel_craft_project`. That covers `volumes`, `activeChapterId`, `myCharacters`, `myWorldElements`, `ideas`, preferences and user-added prompts. The rules live in `src/stores/persistence.ts`:
- `partialize` and `merge` decide what is saved and how it is restored. Built-in prompts always come from code.
- `createSafeStorage` swallows write errors so typing never throws. Write failures and recoveries are reported to `src/stores/persistStatus.ts`, a separate store so that an update cannot re-trigger a persist write. `App.tsx` shows a banner from it.

The source novel and its analyses are not saved here; they go through `db.ts`. First run seeds demo content. Export goes through `ExportProjectModal` (Blob download).
- `globalCharacters/globalWorldElements` are aggregated from the analyzed source novel and serve as reference. `myCharacters/myWorldElements` belong to the writer's new book. Keep the two sets separate.
- `draftTitle/draftContent` mirror the active chapter and are not persisted. `merge` and `deleteChapter` re-derive them with `resolveActiveDraft`/`removeChapter` (`src/stores/chapterOps.ts`). When there is an active chapter, `setDraftTitle/setDraftContent` call only `updateChapterTitle/updateChapterContent` (one `set` per keystroke). `StoryChapter.reference_chapter_id` links a draft chapter to a source-novel chapter id.
- `createVolume` returns the new volume id. "采用此大纲立即仿写" in BrainwaveView first calls `generateIdeaAssets` (`src/services/ideaAssets.ts`). `applyIdeaAssets` then replaces `myCharacters` / `myWorldElements` (the first-run seed is cyberpunk demo content) and puts the generated techniques, ids prefixed `IDEA_PROMPT_PREFIX`, ahead of the built-in prompts. After that it creates a volume flagged `starts_new_book` plus a chapter, and selects the idea. `EditorView` feeds the selected idea into its AI prompts. `storyContext.ts` only treats chapters from the nearest `starts_new_book` volume onward as the same book, so earlier books and demo volumes stay out of the AI context.
- Deconstruct → brainwave: 「提炼模版」 builds the skeleton with `buildSkeletonFromAnalyses` (`src/utils/skeleton.ts`: per-chapter summary and hook, main characters, settings) and puts it into the non-persisted store field `brainwaveSkeleton`, which the brainwave skeleton textarea reads and writes.

### UI
`App.tsx` switches views by `activeTab` inside an `ErrorBoundary` keyed by the tab, so a render crash replaces only that view and switching tabs resets it. Each view is a large single component under `src/components/{deconstruct,brainwave,editor,review}/` (`EditorView.tsx` is ~1670 lines, `DeconstructView.tsx` ~1250). Styling is Tailwind v4 through `@tailwindcss/vite` (no `tailwind.config`, `App.css` is just the import) on a dark `zinc` palette, with `lucide-react` icons. There is some narrow/mobile handling (`mobileView` in `DeconstructView`, viewport meta in `index.html`).
