import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFocusTarget } from './focusTrap.ts';

const [closeBtn, row, deleteBtn] = ['close', 'row', 'delete'];
const focusables = [closeBtn, row, deleteBtn];

test('nextFocusTarget - Tab on the last element wraps to the first', () => {
  assert.equal(nextFocusTarget(focusables, deleteBtn, false), closeBtn);
});

test('nextFocusTarget - Shift+Tab on the first element wraps to the last', () => {
  assert.equal(nextFocusTarget(focusables, closeBtn, true), deleteBtn);
});

test('nextFocusTarget - moving between inner elements keeps the browser default', () => {
  assert.equal(nextFocusTarget(focusables, closeBtn, false), null);
  assert.equal(nextFocusTarget(focusables, deleteBtn, true), null);
});

test('nextFocusTarget - focus outside the dialog is pulled back in', () => {
  assert.equal(nextFocusTarget(focusables, 'background-button', false), closeBtn);
  assert.equal(nextFocusTarget(focusables, null, true), deleteBtn);
});

test('nextFocusTarget - a single focusable element keeps focus on itself', () => {
  assert.equal(nextFocusTarget([row], row, false), row);
  assert.equal(nextFocusTarget([row], row, true), row);
});

test('nextFocusTarget - no focusable elements leaves the decision to the caller', () => {
  assert.equal(nextFocusTarget([], 'anything', false), null);
});
