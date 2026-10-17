import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStorage, partializeNovelState, mergePersistedState } from './persistence.ts';
import { DEFAULT_PROMPT_ARSENAL } from '../data/promptArsenal.ts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

test('createSafeStorage - swallows quota errors and reports them, then reports recovery once', () => {
  const base = memoryStorage();
  let fail = true;
  const failing = {
    ...base,
    setItem: (k: string, v: string) => {
      if (fail) throw new DOMException('quota', 'QuotaExceededError');
      base.setItem(k, v);
    },
  };
  const reports: Array<unknown> = [];
  const storage = createSafeStorage(failing, (err) => reports.push(err));

  assert.doesNotThrow(() => storage.setItem('k', 'v1'));
  assert.equal(reports.length, 1);
  assert.ok(reports[0] instanceof Error);

  fail = false;
  storage.setItem('k', 'v2');
  storage.setItem('k', 'v3');
  assert.deepEqual(reports.slice(1), [null], 'recovery reported exactly once');
  assert.equal(base.data.get('k'), 'v3');
});

test('createSafeStorage - unreadable storage yields null instead of throwing', () => {
  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => {},
    removeItem: () => {},
  };
  const storage = createSafeStorage(broken, () => {});
  assert.equal(storage.getItem('k'), null);
});

const customPrompt = {
  id: 'custom-1',
  category: 'action' as const,
  category_label: '动作博弈',
  name: '我的技法',
  description: 'd',
  prompt_template: 't',
};

test('partializeNovelState - keeps the writer project, drops runtime and source-novel state', () => {
  const state = {
    volumes: [{ id: 'v', title: 'T', description: '', chapters: [] }],
    activeChapterId: 'c1',
    draftTitle: 'dt',
    draftContent: 'dc',
    myCharacters: [],
    myWorldElements: [],
    ideas: [],
    selectedIdeaId: null,
    selectedAuthorStyleId: 'wuzei',
    batchConcurrency: 3,
    lastOpenedNovel: '诡秘之主.txt',
    prompts: [customPrompt, ...DEFAULT_PROMPT_ARSENAL],
    novel: { file_name: 'big.txt' },
    analyses: { 1: {} },
    batchProgress: { isRunning: true },
    apiKey: 'secret',
  };
  const persisted = partializeNovelState(state as any);

  assert.deepEqual(Object.keys(persisted).sort(), [
    'activeChapterId', 'batchConcurrency', 'customPrompts',
    'ideas', 'lastOpenedNovel', 'myCharacters', 'myWorldElements', 'selectedAuthorStyleId', 'selectedIdeaId', 'volumes',
  ]);
  assert.deepEqual(persisted.customPrompts, [customPrompt]);
});

const savedVolumes = [
  {
    id: 'v1',
    title: 'V',
    description: '',
    chapters: [{ id: 'c1', title: '第一章', content: '我的正文', word_count: 4, status: 'draft' }],
  },
];

test('mergePersistedState - restores data, derives the draft, rebuilds prompts as custom + current defaults', () => {
  const current = { prompts: DEFAULT_PROMPT_ARSENAL, volumes: [], activeChapterId: '', draftTitle: 'demo', draftContent: 'demo', apiKey: 'k' };
  const merged = mergePersistedState(
    { volumes: savedVolumes, activeChapterId: 'c1', customPrompts: [customPrompt] },
    current as any,
  ) as any;

  assert.equal(merged.draftContent, '我的正文');
  assert.equal(merged.draftTitle, '第一章');
  assert.deepEqual(merged.volumes, savedVolumes);
  assert.equal(merged.apiKey, 'k');
  assert.equal(merged.prompts[0], customPrompt);
  assert.equal(merged.prompts.length, DEFAULT_PROMPT_ARSENAL.length + 1);
  assert.equal('customPrompts' in merged, false);
});

test('mergePersistedState - a dangling activeChapterId falls back to an existing chapter', () => {
  const current = { prompts: DEFAULT_PROMPT_ARSENAL, volumes: [], activeChapterId: '', draftTitle: '', draftContent: '' };
  const merged = mergePersistedState({ volumes: savedVolumes, activeChapterId: 'deleted' }, current as any) as any;
  assert.equal(merged.activeChapterId, 'c1');
  assert.equal(merged.draftContent, '我的正文');
});

test('mergePersistedState - repairs or drops malformed persisted ideas so the brainwave tab cannot crash-loop', () => {
  const current = { prompts: DEFAULT_PROMPT_ARSENAL, volumes: [], activeChapterId: '', ideas: [] };
  const merged = mergePersistedState(
    { ideas: [{ id: 'a', title: '缺三幕', golden_finger: 'g' }, { genre: '无效' }, null] },
    current as any,
  ) as any;
  assert.equal(merged.ideas.length, 1);
  assert.deepEqual(merged.ideas[0].three_act_beats, { act1: '', act2: '', act3: '' });
});

test('mergePersistedState - ignores missing or corrupted persisted state', () => {
  const current = { prompts: DEFAULT_PROMPT_ARSENAL, draftContent: 'demo' };
  assert.equal(mergePersistedState(undefined, current as any), current);
  assert.equal(mergePersistedState('garbage', current as any), current);
});
