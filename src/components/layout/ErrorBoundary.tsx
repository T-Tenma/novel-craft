import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// 单个视图渲染崩溃时只替换该视图，保留导航与已保存数据，避免整页白屏
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('视图渲染异常', error, info.componentStack);
  }

  private handleRetry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm">
          <div className="flex items-center gap-2 text-rose-300 font-bold">
            <AlertTriangle className="w-4 h-4" />
            <span>这个页面出错了</span>
          </div>
          <p className="mt-2 text-zinc-400 text-xs leading-relaxed">
            已保存的作品不受影响。可以重试，或切换到其他模块。若反复出现，可能是某条拆解数据格式异常，可重新拆解该章节。
          </p>
          <p className="mt-2 font-mono text-[11px] text-zinc-500 break-all">{this.state.error.message}</p>
          <button
            onClick={this.handleRetry}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重试
          </button>
        </div>
      </div>
    );
  }
}
