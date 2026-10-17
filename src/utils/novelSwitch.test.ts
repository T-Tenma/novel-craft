import test from 'node:test';
import assert from 'node:assert/strict';
import { mustStopBatchBeforeSwitch, mustStopBatchBeforeImport, importConfirmMessage, chapterResultTarget } from './novelSwitch.ts';

test('mustStopBatchBeforeSwitch - nothing to stop when no batch is running', () => {
  assert.equal(mustStopBatchBeforeSwitch(false, 'a.txt', 'b.txt'), false);
});

test('mustStopBatchBeforeSwitch - switching to another novel stops the running batch', () => {
  assert.equal(mustStopBatchBeforeSwitch(true, 'a.txt', 'b.txt'), true);
});

test('mustStopBatchBeforeSwitch - re-opening the novel being analyzed does not interrupt it', () => {
  assert.equal(mustStopBatchBeforeSwitch(true, 'a.txt', 'a.txt'), false);
});

test('mustStopBatchBeforeSwitch - removing the current novel (no target) stops the batch', () => {
  assert.equal(mustStopBatchBeforeSwitch(true, 'a.txt', null), true);
});

test('importConfirmMessage - a new file with no batch running imports without asking', () => {
  assert.equal(importConfirmMessage('b.txt', { replacesStored: false, batchFile: null }), null);
});

test('importConfirmMessage - re-importing a stored name warns that its analyses will be cleared', () => {
  const message = importConfirmMessage('a.txt', { replacesStored: true, batchFile: null });
  assert.match(message ?? '', /书库中已有《a\.txt》/);
  assert.match(message ?? '', /清空这本书已有的拆解结果/);
});

test('importConfirmMessage - re-importing the novel being batch-analyzed also stops the batch', () => {
  const message = importConfirmMessage('a.txt', { replacesStored: true, batchFile: 'a.txt' });
  assert.match(message ?? '', /清空这本书已有的拆解结果/);
  assert.match(message ?? '', /批量拆解也会停止/);
  // 旧拆解会被清空，不能再提示「已完成的章节已保存、可断点续拆」
  assert.doesNotMatch(message ?? '', /断点续拆/);
});

test('importConfirmMessage - importing another file while a batch runs keeps the resume hint', () => {
  const message = importConfirmMessage('b.txt', { replacesStored: false, batchFile: 'a.txt' });
  assert.match(message ?? '', /《a\.txt》正在批量拆解/);
  assert.match(message ?? '', /断点续拆/);
  assert.doesNotMatch(message ?? '', /清空/);
});

test('mustStopBatchBeforeImport - any import stops a running batch, including one on the same name', () => {
  assert.equal(mustStopBatchBeforeImport(true), true);
  assert.equal(mustStopBatchBeforeImport(false), false);
});

test('chapterResultTarget - same novel and unchanged chapter text: show and save', () => {
  assert.equal(chapterResultTarget({ file: 'a.txt', content: '正文' }, { file: 'a.txt', content: '正文' }), 'current');
});

test('chapterResultTarget - switched to another novel meanwhile: only save back to the original', () => {
  assert.equal(chapterResultTarget({ file: 'a.txt', content: '正文' }, { file: 'b.txt', content: '别的' }), 'storage-only');
  assert.equal(chapterResultTarget({ file: 'a.txt', content: '正文' }, null), 'storage-only');
});

test('chapterResultTarget - same name re-imported with different text: the result is stale', () => {
  assert.equal(chapterResultTarget({ file: 'a.txt', content: '旧正文' }, { file: 'a.txt', content: '新正文' }), 'stale');
  // 新文件里已没有这一章
  assert.equal(chapterResultTarget({ file: 'a.txt', content: '旧正文' }, { file: 'a.txt', content: undefined }), 'stale');
});
