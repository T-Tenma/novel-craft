import { Chapter } from '../types';
import { analyzeChapterWithLLM } from './llm';
import { persistChapterAnalysis } from './db';
import { useNovelStore } from '../stores/novelStore';

class BatchPipelineManager {
  private abortController: AbortController | null = null;
  private isPaused: boolean = false;

  public async startBatch(
    novelFileName: string,
    chaptersToAnalyze: Chapter[],
    config: { baseUrl: string; apiKey: string; model: string },
    concurrency: number = 2
  ) {
    const store = useNovelStore.getState();
    this.abortController = new AbortController();
    this.isPaused = false;

    store.setBatchProgress({
      isRunning: true,
      isPaused: false,
      total: chaptersToAnalyze.length,
      completed: 0,
      currentTitle: '正在准备拆解任务...',
    });

    const queue = [...chaptersToAnalyze];
    let completedCount = 0;

    // 工作线程函数
    const worker = async () => {
      while (queue.length > 0 && !this.abortController?.signal.aborted) {
        // 处理暂停逻辑
        while (this.isPaused && !this.abortController?.signal.aborted) {
          await new Promise((res) => setTimeout(res, 500));
        }

        if (this.abortController?.signal.aborted) break;

        const chapter = queue.shift();
        if (!chapter) break;

        useNovelStore.getState().setBatchProgress({
          currentTitle: `正在逆向拆解: ${chapter.title}`,
        });

        try {
          // 调用大模型抽取
          const analysis = await analyzeChapterWithLLM(
            config,
            String(chapter.title),
            chapter.content
          );
          analysis.chapter_id = chapter.id;

          // 1. 存入 SQLite / 本地持久化
          await persistChapterAnalysis(novelFileName, chapter.id, analysis);

          // 2. 更新内存 Store
          const currentStore = useNovelStore.getState();
          currentStore.setChapterAnalysis(chapter.id, analysis);
          currentStore.updateGlobalAggregations(analysis);

          completedCount++;
          currentStore.setBatchProgress({
            completed: completedCount,
          });
        } catch (err: any) {
          console.error(`章节 [${chapter.title}] 拆解失败:`, err);
          // 失败继续处理后续章节
        }

        // 短暂休眠避免突发速率超限
        await new Promise((res) => setTimeout(res, 300));
      }
    };

    // 启动指定并发数的 worker
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
    await Promise.all(workers);

    useNovelStore.getState().setBatchProgress({
      isRunning: false,
      isPaused: false,
      currentTitle: '全部拆解任务已结束',
    });
  }

  public pause() {
    this.isPaused = true;
    useNovelStore.getState().setBatchProgress({ isPaused: true });
  }

  public resume() {
    this.isPaused = false;
    useNovelStore.getState().setBatchProgress({ isPaused: false });
  }

  public stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    useNovelStore.getState().setBatchProgress({
      isRunning: false,
      isPaused: false,
      currentTitle: '拆解已终止',
    });
  }
}

export const batchPipeline = new BatchPipelineManager();
