import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryContext, buildPreviousChapterContext, buildReviewContext, bookVolumes, excerptHeadTail, recapThrough } from './storyContext.ts';
import type { CharacterItem, StoryChapter, StoryVolume, WorldElement } from '../types';
import { hashText } from './chapterSummary.ts';

const chapter = (id: string, title: string, content: string) => ({ id, title, content, word_count: content.length, status: 'draft' as const });

const VOLUMES: StoryVolume[] = [
  {
    id: 'v1',
    title: '第一卷',
    description: '中元夜寿宴，主角当众揭穿沈家换命局。',
    chapters: [chapter('c1', '第一章 纸人点睛', '开头。'.repeat(10) + '门外的手指抠了进来。'), chapter('c2', '第二章 缝尸脱罪', '')],
  },
  { id: 'v2', title: '第二卷', description: '', chapters: [chapter('c3', '第三章 篾骨低语', '小玉叫了一声哥。')] },
];

const CHARACTERS: CharacterItem[] = [
  { name: '陈逢青', status: '已有角色', role: '男主 / 扎彩铺传人', key_action: '', inner_motivation: '七日内润色醒神' },
  { name: '沈管事', status: '退场/阵亡', role: '沈家管事', key_action: '', inner_motivation: '' },
];
const WORLD: WorldElement[] = [{ term: '《篾骨纸煞谱》', category: '力量体系', description: '每驱一次纸煞，皮肉脆化如宣' }];

test('excerptHeadTail - keeps short text and keeps both ends of long text', () => {
  assert.equal(excerptHeadTail('短文', 10), '短文');
  const long = '头'.repeat(50) + '中'.repeat(100) + '尾'.repeat(50);
  const out = excerptHeadTail(long, 100);
  assert.ok(out.startsWith('头'.repeat(50)), 'head kept');
  assert.ok(out.endsWith('尾'.repeat(40)), 'the ending (chapter hook) is kept');
  assert.match(out, /中间省略 100 字/);
  assert.ok(!out.includes('中'.repeat(20)));
});

test('buildPreviousChapterContext - gives the ending of the chapter just before, across volumes', () => {
  const ctx = buildPreviousChapterContext(VOLUMES, 'c2');
  assert.match(ctx, /第一章 纸人点睛/);
  assert.match(ctx, /门外的手指抠了进来。/);
  // 第三章的上一章（第二章）没有正文，再往前找到第一章
  assert.match(buildPreviousChapterContext(VOLUMES, 'c3'), /门外的手指抠了进来。/);
  assert.equal(buildPreviousChapterContext(VOLUMES, 'c1'), '', 'the first chapter has no previous chapter');
  assert.equal(buildPreviousChapterContext(VOLUMES, 'missing'), '');
});

test('buildPreviousChapterContext - a long previous chapter keeps its opening and its ending', () => {
  const volumes = [{ ...VOLUMES[0], chapters: [chapter('a', '甲', '锁心离体供在案上。' + '旧'.repeat(5000) + '结尾钩子'), chapter('b', '乙', '')] }];
  const ctx = buildPreviousChapterContext(volumes, 'b');
  assert.match(ctx, /锁心离体供在案上/, 'events early in the previous chapter are still known');
  assert.match(ctx, /中间省略/);
  assert.match(ctx, /结尾钩子$/);
  assert.ok(ctx.length < 3200);
});

test('buildPreviousChapterContext - a typical 3000-character chapter goes in whole', () => {
  const content = '前段情节。' + '字'.repeat(2900) + '章末。';
  const volumes = [{ ...VOLUMES[0], chapters: [chapter('a', '甲', content), chapter('b', '乙', '')] }];
  const ctx = buildPreviousChapterContext(volumes, 'b');
  assert.ok(ctx.includes(content));
  assert.doesNotMatch(ctx, /省略/);
});

test('buildStoryContext - combines outline, characters, settings, chapter list and the previous ending', () => {
  const ctx = buildStoryContext({ volumes: VOLUMES, chapterId: 'c2', characters: CHARACTERS, worldElements: WORLD });
  assert.match(ctx, /本卷大纲[\s\S]*中元夜寿宴/);
  assert.match(ctx, /陈逢青（男主 \/ 扎彩铺传人）：七日内润色醒神/);
  assert.match(ctx, /沈管事（沈家管事）【已退场\/阵亡】/, 'dead characters are marked so the model does not revive them');
  assert.match(ctx, /《篾骨纸煞谱》（力量体系）：每驱一次纸煞/);
  assert.match(ctx, /【前情提要】[^\n]*\n- 第一章 纸人点睛\n/, 'a chapter without a summary is listed by title');
  assert.match(ctx, /门外的手指抠了进来。/);
});

test('buildStoryContext - nothing to say for a lone first chapter without outline or settings', () => {
  const volumes = [{ ...VOLUMES[1], chapters: [chapter('x', '第一章', '')] }];
  assert.equal(buildStoryContext({ volumes, chapterId: 'x', characters: [], worldElements: [] }), '');
});

test('buildStoryContext - caps long outlines and long setting lists', () => {
  const volumes = [{ ...VOLUMES[0], description: '纲'.repeat(2000) }];
  const many = Array.from({ length: 30 }, (_, i) => ({ ...CHARACTERS[0], name: `角色${i}`, inner_motivation: '欲'.repeat(300) }));
  const ctx = buildStoryContext({ volumes, chapterId: 'c1', characters: many, worldElements: [] });
  assert.ok(!ctx.includes('纲'.repeat(700)));
  assert.ok(!ctx.includes('欲'.repeat(100)));
  assert.ok(ctx.includes('角色11') && !ctx.includes('角色12'));
});

const REVIEW_VOLUMES: StoryVolume[] = [
  {
    id: 'v1',
    title: '第一卷',
    description: '',
    chapters: [
      chapter('r1', '第一章', '沈淮在祭坛醒来，方执事破空而至。'),
      chapter('r2', '第二章', '诛绝禁制落下，八百里封山。'),
    ],
  },
];
const REVIEW_CHARACTERS: CharacterItem[] = [
  { name: '沈淮', status: '已有角色', role: '男主', key_action: '', inner_motivation: '护住残宗' },
  { name: '方执事（方秉诚）', status: '已有角色', role: '玄镜司执事', key_action: '', inner_motivation: '夺锁' },
  { name: '冷面剑卫', status: '退场/阵亡', role: '剑卫', key_action: '', inner_motivation: '' },
];
const REVIEW_WORLD: WorldElement[] = [{ term: '诛绝禁制', category: '法则规则', description: '封山杀阵' }];

test('buildReviewContext - settings not yet named by this chapter are marked as possibly later, so the review does not ask for them', () => {
  const ctx = buildReviewContext({ volumes: REVIEW_VOLUMES, chapterId: 'r1', characters: REVIEW_CHARACTERS, worldElements: REVIEW_WORLD });
  assert.match(ctx, /沈淮\(男主, 动机:护住残宗\);/);
  assert.match(ctx, /方执事（方秉诚）\(玄镜司执事, 动机:夺锁\);/, 'either spelling of a name counts as appeared');
  assert.match(ctx, /冷面剑卫\(剑卫\)【已退场\/阵亡】【前文未见，可能是后文设定】/);
  assert.match(ctx, /诛绝禁制\(封山杀阵\)【前文未见，可能是后文设定】/);
  assert.match(ctx, /本章没写到不算缺失/);
  assert.match(ctx, /退场之前的章节[^。]*不算问题/, 'a death later in the book does not make an earlier appearance wrong');
});

test('buildReviewContext - a setting named in this chapter or earlier is not marked', () => {
  const ctx = buildReviewContext({ volumes: REVIEW_VOLUMES, chapterId: 'r2', characters: [], worldElements: REVIEW_WORLD });
  assert.equal(ctx, '【核心设定法则】：诛绝禁制(封山杀阵)', 'no notes without marked entries');
});

test('buildReviewContext - no settings, no context; an unknown chapter marks nothing', () => {
  assert.equal(buildReviewContext({ volumes: REVIEW_VOLUMES, chapterId: 'r1', characters: [], worldElements: [] }), '');
  const ctx = buildReviewContext({ volumes: REVIEW_VOLUMES, chapterId: 'missing', characters: [], worldElements: REVIEW_WORLD });
  assert.doesNotMatch(ctx, /后文设定/);
});

test('buildStoryContext - a volume that starts a new book does not inherit the chapters of the book before it', () => {
  const volumes: StoryVolume[] = [
    { id: 'demo', title: '演示卷', description: '', chapters: [chapter('d1', '第一章：雨夜与脑机香火', '距化为赛博尸煞还剩 47 小时。')] },
    { id: 'new', title: '《新书》第一卷', description: '民国志怪', starts_new_book: true, chapters: [chapter('n1', '第一章', '阴钉入颅。')] },
    { id: 'more', title: '第二卷', description: '', chapters: [chapter('n2', '第二章', '')] },
  ];
  const first = buildStoryContext({ volumes, chapterId: 'n1', characters: [], worldElements: [] });
  assert.doesNotMatch(first, /赛博尸煞|雨夜与脑机香火/);
  assert.match(first, /民国志怪/);
  assert.equal(buildPreviousChapterContext(volumes, 'n1'), '');
  // 之后手动加的卷仍属于这本新书
  const next = buildStoryContext({ volumes, chapterId: 'n2', characters: [], worldElements: [] });
  assert.match(next, /阴钉入颅/);
  assert.doesNotMatch(next, /赛博尸煞/);
});

test('bookVolumes - the volumes of the book a chapter belongs to, without the books before or after it', () => {
  const volumes: StoryVolume[] = [
    { id: 'a1', title: 'A 卷一', description: '', chapters: [chapter('a', '甲', '')] },
    { id: 'b1', title: 'B 卷一', description: '', starts_new_book: true, chapters: [chapter('b', '乙', '')] },
    { id: 'b2', title: 'B 卷二', description: '', chapters: [chapter('b2c', '丙', '')] },
    { id: 'c1', title: 'C 卷一', description: '', starts_new_book: true, chapters: [chapter('c', '丁', '')] },
  ];
  assert.deepEqual(bookVolumes(volumes, 'b2c').map((v) => v.id), ['b1', 'b2']);
  assert.deepEqual(bookVolumes(volumes, 'a').map((v) => v.id), ['a1']);
  assert.deepEqual(bookVolumes(volumes, 'c').map((v) => v.id), ['c1']);
  assert.equal(bookVolumes(volumes, 'missing'), volumes, 'no active chapter: the whole project');
});

const summarized = (c: StoryChapter, text: string, changes: string[] = []): StoryChapter => ({
  ...c,
  summary: { text, state_changes: changes, content_hash: hashText(c.content) },
});

test('buildStoryContext - the recap gives each earlier chapter its summary and state changes', () => {
  const volumes: StoryVolume[] = [
    {
      id: 'v',
      title: '卷',
      description: '',
      chapters: [
        summarized(chapter('a', '第一章 夜宴', '甲'.repeat(50)), '陈逢青在寿宴上揭穿换命局。', ['沈管事被纸煞反噬身亡', '纸雀归陈逢青']),
        chapter('b', '第二章 缝尸', '乙'.repeat(50)),
        chapter('skip', '第三章 还没写', ''),
        chapter('now', '第四章 进城', ''),
      ],
    },
  ];
  const ctx = buildStoryContext({ volumes, chapterId: 'now', characters: [], worldElements: [] });
  assert.match(ctx, /【前情提要】[^\n]*\n- 第一章 夜宴：陈逢青在寿宴上揭穿换命局。（变化：沈管事被纸煞反噬身亡；纸雀归陈逢青）\n- 第二章 缝尸\n/);
  assert.doesNotMatch(ctx, /第三章 还没写/, 'an unwritten earlier chapter is not part of the story so far');
});

test('buildStoryContext - a long book keeps the latest summaries and lists older chapters by title only', () => {
  const written = Array.from({ length: 40 }, (_, i) => summarized(chapter(`k${i}`, `第${i + 1}章`, `正文${i}`), `摘要${i}：${'事'.repeat(200)}`));
  const volumes: StoryVolume[] = [{ id: 'v', title: '卷', description: '', chapters: [...written, chapter('now', '第41章', '')] }];
  const ctx = buildStoryContext({ volumes, chapterId: 'now', characters: [], worldElements: [] });
  const recap = ctx.slice(ctx.indexOf('【前情提要】'), ctx.indexOf('【前一章'));
  assert.match(recap, /摘要39：/, 'the latest chapters keep their summaries');
  assert.doesNotMatch(recap, /摘要0：/);
  assert.match(recap, /- 第1章\n/, 'older chapters are still listed');
  assert.ok(recap.length < 3600, `recap is capped (${recap.length})`);
});

test('buildStoryContext - the chapter outline leads, and the next one is marked as not for this chapter', () => {
  const volumes: StoryVolume[] = [
    {
      id: 'v',
      title: '卷',
      description: '',
      chapters: [
        chapter('a', '第一章', '正文。'),
        { ...chapter('b', '第二章', ''), outline: '1. 陈逢青进城\n章末：城门落锁' },
        { ...chapter('c', '第三章', ''), outline: '城隍庙对峙' },
      ],
    },
  ];
  const ctx = buildStoryContext({ volumes, chapterId: 'b', characters: [], worldElements: [] });
  assert.match(ctx, /【本章细纲】[^\n]*\n1\. 陈逢青进城\n章末：城门落锁/);
  assert.match(ctx, /【下一章细纲】[^\n]*不要[^\n]*\n城隍庙对峙/);
  const first = buildStoryContext({ volumes, chapterId: 'a', characters: [], worldElements: [] });
  assert.doesNotMatch(first, /【本章细纲】/);
  assert.match(first, /【下一章细纲】[\s\S]*陈逢青进城/);
  assert.doesNotMatch(buildStoryContext({ volumes, chapterId: 'c', characters: [], worldElements: [] }), /【下一章细纲】/);
});

test('buildReviewContext - carries the chapter outline so missing beats are pointed out', () => {
  const volumes: StoryVolume[] = [{ ...REVIEW_VOLUMES[0], chapters: [{ ...REVIEW_VOLUMES[0].chapters[0], outline: '沈淮醒来；方执事到场；章末：锁心发烫' }] }];
  const ctx = buildReviewContext({ volumes, chapterId: 'r1', characters: [], worldElements: [] });
  assert.match(ctx, /【本章细纲】[^\n]*\n沈淮醒来；方执事到场；章末：锁心发烫/);
});

test('recapThrough - the recap up to and including this chapter, within this book only', () => {
  const volumes: StoryVolume[] = [
    { id: 'old', title: '旧书', description: '', chapters: [summarized(chapter('o', '旧章', '旧'), '旧书的事')] },
    {
      id: 'new',
      title: '新书',
      description: '',
      starts_new_book: true,
      chapters: [summarized(chapter('a', '第一章', '甲'), '甲事'), summarized(chapter('b', '第二章', '乙'), '乙事'), summarized(chapter('c', '第三章', '丙'), '丙事')],
    },
  ];
  const recap = recapThrough(volumes, 'b');
  assert.match(recap, /- 第一章：甲事\n- 第二章：乙事$/);
  assert.doesNotMatch(recap, /旧书的事|丙事/);
});

test('buildStoryContext - a summary written before the chapter was edited is flagged as possibly outdated', () => {
  const edited = { ...summarized(chapter('a', '第一章', '原稿'), '沈管事身亡。'), content: '改稿：沈管事活了下来。' };
  const volumes: StoryVolume[] = [{ id: 'v', title: '卷', description: '', chapters: [edited, chapter('now', '第二章', '')] }];
  const ctx = buildStoryContext({ volumes, chapterId: 'now', characters: [], worldElements: [] });
  assert.match(ctx, /- 第一章：沈管事身亡。（摘要生成后正文又改过，可能不准）/);
});

