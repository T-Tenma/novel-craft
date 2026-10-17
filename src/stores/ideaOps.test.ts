import test from 'node:test';
import assert from 'node:assert/strict';
import { removeIdea, restoreIdeaAt, findSelectedIdea, validateBrainwaveInput, withIdeaPrompts } from './ideaOps.ts';
import type { BrainwaveIdea, TechniquePrompt } from '../types';

const idea = (id: string): BrainwaveIdea => ({
  id,
  title: `title-${id}`,
  genre: 'g',
  source_skeleton: 's',
  golden_finger: 'f',
  main_conflict: 'c',
  three_act_beats: { act1: '1', act2: '2', act3: '3' },
});
const IDEAS = [idea('a'), idea('b'), idea('c')];

test('removeIdea - deleting the idea the editor uses clears the selection instead of silently switching to another', () => {
  const next = removeIdea(IDEAS, 'b', 'b');
  assert.deepEqual(next.ideas.map((i) => i.id), ['a', 'c']);
  assert.equal(next.selectedIdeaId, null);
});

test('removeIdea - deleting another idea keeps the current selection', () => {
  assert.equal(removeIdea(IDEAS, 'a', 'b').selectedIdeaId, 'b');
});

test('restoreIdeaAt - an undone delete goes back to the same position, never twice', () => {
  const removed = removeIdea(IDEAS, 'b', 'b').ideas;
  assert.deepEqual(restoreIdeaAt(removed, 1, IDEAS[1]).map((i) => i.id), ['a', 'b', 'c']);
  assert.equal(restoreIdeaAt(IDEAS, 1, IDEAS[1]), IDEAS);
});

test('findSelectedIdea - returns the idea the editor uses', () => {
  assert.equal(findSelectedIdea(IDEAS, 'b')?.id, 'b');
});

test('findSelectedIdea - nothing selected means nothing, never silently the first idea', () => {
  assert.equal(findSelectedIdea(IDEAS, null), null);
  assert.equal(findSelectedIdea(IDEAS, 'deleted'), null);
});

test('validateBrainwaveInput - both the target genre and the story skeleton are required', () => {
  assert.equal(validateBrainwaveInput('赛博修真', '死局重生 ➔ 获得金手指'), null);
  assert.match(validateBrainwaveInput(' ', '骨架') ?? '', /目标新题材/);
  assert.match(validateBrainwaveInput('题材', '') ?? '', /剧情骨架/);
});

const technique = (id: string): TechniquePrompt => ({ id, category: 'atmosphere', category_label: '氛围渲染', name: id, description: '', prompt_template: id });

test('withIdeaPrompts - the new book\'s techniques come first and replace those of the previous idea', () => {
  const current = [technique('idea-tech-1'), technique('idea-tech-2'), technique('custom-1'), technique('atm-1')];
  const next = withIdeaPrompts(current, [technique('idea-tech-1')]);
  assert.deepEqual(next.map((p) => p.id), ['idea-tech-1', 'custom-1', 'atm-1']);
  assert.notEqual(next, current);
});
