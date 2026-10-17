import test from 'node:test';
import assert from 'node:assert/strict';
import { findCardIndex, applyCardSuggestion, describeCardSuggestion } from './cardUpdates.ts';
import type { CardUpdateSuggestion, CharacterItem, WorldElement } from '../types';

const CHARACTERS: CharacterItem[] = [
  { name: '方执事（方秉诚）', status: '已有角色', role: '外门执事', key_action: '收徒', inner_motivation: '保宗门' },
  { name: '沈管事', status: '已有角色', role: '沈家管事', key_action: '', inner_motivation: '' },
];
const WORLD: WorldElement[] = [{ term: '锁心', category: '力量体系', description: '封在命宫' }];
const cards = { characters: CHARACTERS, worldElements: WORLD };

test('findCardIndex - exact name first, then any written form of the name', () => {
  assert.equal(findCardIndex(['方执事（方秉诚）', '陈逢青'], '方秉诚'), 0);
  assert.equal(findCardIndex(['方秉诚的师父', '方秉诚'], '方秉诚'), 1, 'an exact match wins over a partial one');
  assert.equal(findCardIndex(['陈逢青'], '无名氏'), -1);
});

test('applyCardSuggestion - updates only the suggested fields of the matching card, without mutating', () => {
  const s: CardUpdateSuggestion = { target: 'character', name: '沈管事', changes: { status: '退场/阵亡' }, reason: '第五章被反噬身亡' };
  const next = applyCardSuggestion(cards, s);
  assert.deepEqual(next.characters[1], { ...CHARACTERS[1], status: '退场/阵亡' });
  assert.equal(next.characters[0], CHARACTERS[0]);
  assert.equal(CHARACTERS[1].status, '已有角色', 'the original card is untouched');
  assert.equal(next.worldElements, WORLD);
});

test('applyCardSuggestion - a name with no card adds one with safe defaults', () => {
  const person = applyCardSuggestion(cards, { target: 'character', name: '小玉', changes: { role: '纸人妹妹' }, reason: '' });
  assert.deepEqual(person.characters[2], { name: '小玉', status: '新登场', role: '纸人妹妹', key_action: '', inner_motivation: '' });
  const rule = applyCardSuggestion(cards, { target: 'world', name: '玄镜司', changes: { description: '朝廷缉妖衙门' }, reason: '' });
  assert.deepEqual(rule.worldElements[1], { term: '玄镜司', category: '其他', description: '朝廷缉妖衙门' });
  const moved = applyCardSuggestion(cards, { target: 'world', name: '锁心', changes: { description: '第五章已离体，供在案上' }, reason: '' });
  assert.equal(moved.worldElements[0].description, '第五章已离体，供在案上');
});

test('describeCardSuggestion - says what changes; a suggestion that changes nothing is dropped', () => {
  assert.deepEqual(describeCardSuggestion(cards, { target: 'character', name: '方秉诚', changes: { status: '退场/阵亡', role: '外门执事' }, reason: '' }), {
    title: '更新人物「方执事（方秉诚）」',
    lines: ['状态：已有角色 → 退场/阵亡'],
  });
  assert.deepEqual(describeCardSuggestion(cards, { target: 'world', name: '玄镜司', changes: { category: '势力派系', description: '缉妖衙门' }, reason: '' }), {
    title: '新增设定「玄镜司」',
    lines: ['类别：势力派系', '说明：缉妖衙门'],
  });
  assert.equal(describeCardSuggestion(cards, { target: 'world', name: '锁心', changes: { description: '封在命宫' }, reason: '' }), null);
});

test('findCardIndex - the card sharing the most written forms wins; a tie is ambiguous and nothing is changed', () => {
  assert.equal(findCardIndex(['艾伦·耶格尔', '艾伦·布朗'], '艾伦 · 布朗'), 1);
  assert.equal(findCardIndex(['艾伦·耶格尔', '艾伦·布朗'], '艾伦'), -2);
  const twins = { characters: [{ ...CHARACTERS[1], name: '艾伦·耶格尔' }, { ...CHARACTERS[1], name: '艾伦·布朗' }], worldElements: [] };
  const s: CardUpdateSuggestion = { target: 'character', name: '艾伦', changes: { status: '退场/阵亡' }, reason: '' };
  assert.equal(applyCardSuggestion(twins, s), twins, 'an ambiguous name updates no card and adds none');
  assert.equal(describeCardSuggestion(twins, s), null);
});

