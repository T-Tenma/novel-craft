import { useNovelStore } from './stores/novelStore';
import { Navbar } from './components/layout/Navbar';
import { DeconstructView } from './components/deconstruct/DeconstructView';
import { BrainwaveView } from './components/brainwave/BrainwaveView';
import { EditorView } from './components/editor/EditorView';
import { ReviewView } from './components/review/ReviewView';
import './App.css';

export default function App() {
  const { activeTab } = useNovelStore();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 font-sans select-none antialiased">
      {/* 顶部主导航与模型设置 */}
      <Navbar />

      {/* 核心工作区视图 */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'deconstruct' && <DeconstructView />}
        {activeTab === 'brainwave' && <BrainwaveView />}
        {activeTab === 'write' && <EditorView />}
        {activeTab === 'review' && <ReviewView />}
      </div>
    </div>
  );
}
