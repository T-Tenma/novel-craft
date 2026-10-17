import test from 'node:test';
import assert from 'node:assert/strict';
import { removeIdea, restoreIdeaAt, findSelectedIdea, validateBrainwaveInput } from './ideaOps.ts';
import type { BrainwaveIdea } from '../types';

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
