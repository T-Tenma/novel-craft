import { useEffect, useRef, useState } from 'react';
import { getScrollHint, scrollHintMask, type ScrollHint } from '../utils/scrollHint';

// 跟踪横向滚动容器两侧是否还有隐藏内容，返回容器 ref 与可直接用作 maskImage 的渐变
export function useScrollHint<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [hint, setHint] = useState<ScrollHint>({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = getScrollHint(el.scrollLeft, el.clientWidth, el.scrollWidth);
      setHint((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // 容器或内容尺寸变化（旋转屏幕、按钮文字变成「生成中…」）都要重算
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  return { ref, mask: scrollHintMask(hint) };
}
