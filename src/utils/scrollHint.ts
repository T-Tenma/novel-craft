// 横向滚动行（如手机端工具栏）的滑动提示：哪一侧还有被遮住的内容，就在那一侧渐隐

export interface ScrollHint {
  left: boolean;
  right: boolean;
}

const EDGE_TOLERANCE = 4; // 忽略亚像素取整与容器内边距（scrollIntoView 后常差 2px）
const FADE_WIDTH = '24px';

export function getScrollHint(scrollLeft: number, clientWidth: number, scrollWidth: number): ScrollHint {
  const maxScroll = scrollWidth - clientWidth;
  return {
    left: scrollLeft > EDGE_TOLERANCE,
    right: scrollLeft < maxScroll - EDGE_TOLERANCE,
  };
}

// 用作 mask-image：渐隐与背景色无关；两侧都没有隐藏内容时不加遮罩
export function scrollHintMask(hint: ScrollHint): string | undefined {
  if (!hint.left && !hint.right) return undefined;
  const start = hint.left ? `transparent, black ${FADE_WIDTH}` : 'black';
  const end = hint.right ? `black calc(100% - ${FADE_WIDTH}), transparent` : 'black';
  return `linear-gradient(to right, ${start}, ${end})`;
}
