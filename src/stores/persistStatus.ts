import { create } from 'zustand';

// 独立于 novelStore：在 novelStore 的存储写入回调里更新自身会再次触发写入，形成循环
interface PersistStatusState {
  writeError: string | null;
}

export const usePersistStatus = create<PersistStatusState>(() => ({ writeError: null }));

export function reportPersistWriteStatus(error: Error | null) {
  const writeError = !error
    ? null
    : error.name === 'QuotaExceededError'
      ? '浏览器存储空间已满'
      : error.message || '未知错误';
  usePersistStatus.setState({ writeError });
}
