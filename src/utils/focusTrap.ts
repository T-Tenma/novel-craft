// 弹窗焦点锁定：Tab / Shift+Tab 到达边界（或焦点已跑到弹窗外）时绕回弹窗内。
// 返回需要手动聚焦的元素；返回 null 表示沿用浏览器默认的 Tab 行为。
export function nextFocusTarget<T>(focusables: readonly T[], active: unknown, backwards: boolean): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const inside = focusables.includes(active as T);

  if (backwards) return !inside || active === first ? last : null;
  return !inside || active === last ? first : null;
}
