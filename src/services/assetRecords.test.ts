import test from 'node:test';
import assert from 'node:assert/strict';
import { toCharacterItem, toWorldElement } from './assetRecords.ts';

test('toCharacterItem - restores the profile saved by the last chapter analysis', () => {
  const item = toCharacterItem({
    name: '克莱恩',
    role: '主角',
    profile_json: JSON.stringify({ name: '克莱恩', role: '主角', key_action: '占卜', inner_motivation: '回家' }),
  });
  assert.deepEqual(item, { name: '克莱恩', role: '主角', status: '已有角色', key_action: '占卜', inner_motivation: '回家' });
});

test('toCharacterItem - falls back to the row columns when the profile is missing or broken', () => {
  assert.deepEqual(toCharacterItem({ name: '老尼尔', role: null, profile_json: '{坏掉的' }), {
    name: '老尼尔', role: '', status: '已有角色', key_action: '', inner_motivation: '',
  });
  assert.deepEqual(toCharacterItem({ name: '邓恩', role: '队长', profile_json: null }), {
    name: '邓恩', role: '队长', status: '已有角色', key_action: '', inner_motivation: '',
  });
});

test('toWorldElement - keeps known categories and maps unknown or empty ones to 其他', () => {
  assert.deepEqual(toWorldElement({ term: '魔药', category: '力量体系', description: '序列' }), {
    term: '魔药', category: '力量体系', description: '序列',
  });
  assert.deepEqual(toWorldElement({ term: '廷根', category: '城市', description: null }), {
    term: '廷根', category: '其他', description: '',
  });
});
