import { useEffect } from 'react';
import { useNovelStore } from './stores/novelStore';
import { loadNovelFromStorage } from './services/db';
import { usePersistStatus } from './stores/persistStatus';
import { Navbar } from './components/layout/Navbar';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { DeconstructView } from './components/deconstruct/DeconstructView';
import { BrainwaveView } from './components/brainwave/BrainwaveView';
import { EditorView } from './components/editor/EditorView';
import { ReviewView } from './components/review/ReviewView';
import './App.css';

export default function App() {
  const activeTab = useNovelStore((s) => s.activeTab);
  const persistError = usePersistStatus((s) => s.writeError);

  // 启动时恢复上次打开的原著（正文在书库存储里，项目存档只记文件名）；找不到就清掉记录
  useEffect(() => {
    const { novel, lastOpenedNovel } = useNovelStore.getState();
    if (novel || !lastOpenedNovel) return;
    loadNovelFromStorage(lastOpenedNovel)
      .then((data) => {
        const state = useNovelStore.getState();
        if (state.novel) return; // 期间用户已手动打开了别的小说
        if (data) state.setNovel(data);
        else useNovelStore.setState({ lastOpenedNovel: null });
      })
      .catch((err) => console.warn('恢复上次打开的小说失败', err));
  }, []);

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-zinc-950 font-sans antialiased">
      {/* 顶部主导航与模型设置 */}
      <Navbar />

      {persistError && (
        <div className="shrink-0 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-xs">
          ⚠️ 作品自动保存失败（{persistError}）。最近的修改可能在刷新后丢失，请尽快在仿写创作台导出备份。
        </div>
      )}

      {/* 核心工作区视图：切换模块时重置错误边界 */}
      <div className="flex-1 flex overflow-hidden">
        <ErrorBoundary key={activeTab}>
          {activeTab === 'deconstruct' && <DeconstructView />}
          {activeTab === 'brainwave' && <BrainwaveView />}
          {activeTab === 'write' && <EditorView />}
          {activeTab === 'review' && <ReviewView />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
