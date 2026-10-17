import React, { useState } from 'react';
import { useNovelStore, ActiveTab } from '../../stores/novelStore';
import { testLLMConnection } from '../../services/llm';
import { validateModelConfig, type ModelConfigField } from '../../utils/modelConfig';
import { 
  BookOpen, 
  Sparkles, 
  Feather, 
  CheckCircle, 
  Settings, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Cpu,
  X
} from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// 输入框下方提示：错误（红）优先于警告（琥珀）
const FieldHint: React.FC<{ id: string; error?: string; warning?: string }> = ({ id, error, warning }) => {
  if (!error && !warning) return null;
  return (
    <p id={id} className={`mt-1 text-[11px] leading-relaxed ${error ? 'text-rose-400' : 'text-amber-400/90'}`}>
      {error ?? warning}
    </p>
  );
};

export const Navbar: React.FC = () => {
  const { activeTab, setActiveTab, apiBaseUrl, apiKey, modelName, setApiConfig } = useNovelStore();
  const [showSettings, setShowSettings] = useState(false);
  const settingsDialogRef = useFocusTrap<HTMLDivElement>(showSettings, () => setShowSettings(false));
  const [baseUrlInput, setBaseUrlInput] = useState(apiBaseUrl);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [modelInput, setModelInput] = useState(modelName);

  const [testing, setTesting] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const validation = validateModelConfig({ baseUrl: baseUrlInput, apiKey: keyInput, model: modelInput });
  const fieldError = (field: ModelConfigField) => (showValidation ? validation.errors[field] : undefined);

  // 校验不通过时显示错误并聚焦第一个有问题的输入框
  const ensureValid = () => {
    setShowValidation(true);
    if (validation.ok) return true;
    const firstInvalid = (['baseUrl', 'apiKey', 'model'] as const).find((f) => validation.errors[f]);
    if (firstInvalid) document.getElementById(`model-config-${firstInvalid}`)?.focus();
    return false;
  };
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'deconstruct', label: '1. 研习拆解坊', shortLabel: '拆解', icon: <BookOpen className="w-4 h-4" />, desc: '逆向剖析' },
    { id: 'brainwave', label: '2. 脑洞生成库', shortLabel: '脑洞', icon: <Sparkles className="w-4 h-4" />, desc: '骨架迁移' },
    { id: 'write', label: '3. 仿写创作台', shortLabel: '仿写', icon: <Feather className="w-4 h-4" />, desc: '双栏对照' },
    { id: 'review', label: '4. AI 审稿评估', shortLabel: '审稿', icon: <CheckCircle className="w-4 h-4" />, desc: '验收打分' },
  ];

  const handleTestConnection = async () => {
    if (!ensureValid()) return;
    setTesting(true);
    setTestResult(null);
    try {
      // 与保存使用同一份校验后的配置，测试通过即代表保存后可用
      const res = await testLLMConnection(validation.value);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || '网络请求异常' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSettings = () => {
    if (!ensureValid()) return;
    const { baseUrl, apiKey: key, model } = validation.value;
    setApiConfig(baseUrl, key, model);
    setShowSettings(false);
  };

  const applyPreset = (preset: 'deepseek' | 'openai' | 'ollama') => {
    setTestResult(null);
    if (preset === 'deepseek') {
      setBaseUrlInput('https://api.deepseek.com/v1');
      setModelInput('deepseek-chat');
    } else if (preset === 'openai') {
      setBaseUrlInput('https://api.openai.com/v1');
      setModelInput('gpt-4o-mini');
    } else if (preset === 'ollama') {
      setBaseUrlInput('http://localhost:11434/v1');
      setModelInput('qwen2.5:7b');
      setKeyInput('ollama');
    }
  };

  return (
    <>
      {/* 顶部导航栏 (桌面端完整、手机端自适应精简) */}
      <header className="h-13 md:h-14 bg-zinc-900 border-b border-zinc-800 px-3 md:px-4 flex items-center justify-between select-none shrink-0 z-30">
        {/* 左侧 Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg overflow-hidden border border-zinc-800/80 shadow-md shadow-amber-500/10 flex items-center justify-center bg-zinc-950 shrink-0">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="StoryForge Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-xs md:text-sm font-bold text-zinc-100 tracking-wide flex items-center gap-1.5">
              <span>StoryForge</span>
              <span className="hidden sm:inline">故事工坊</span>
              <span className="text-[10px] bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-amber-300 border border-amber-500/30 px-1 py-px rounded font-mono">Pro</span>
            </h1>
            <p className="text-[10px] text-zinc-400 hidden lg:block">逆向解构 ➔ 骨架迁移 ➔ 仿写实战 ➔ AI 审稿</p>
          </div>
        </div>

        {/* 中间 Tab 切换 (桌面端显示，手机端隐藏并转至底部导航栏) */}
        <nav className="hidden md:flex items-center gap-1 bg-zinc-950/60 p-1 rounded-lg border border-zinc-800/80">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-zinc-800 text-amber-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {item.icon}
                {/* 平板宽度用短标签，避免四个 Tab 折成两行 */}
                <span className="lg:hidden whitespace-nowrap">{item.shortLabel}</span>
                <span className="hidden lg:inline whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 右侧设置按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setBaseUrlInput(apiBaseUrl);
              setKeyInput(apiKey);
              setModelInput(modelName);
              setTestResult(null);
              setShowValidation(false);
              setShowSettings(true);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 md:py-1.5 text-xs rounded-md border transition-all ${
              apiKey 
                ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' 
                : 'border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 animate-pulse'
            }`}
            title="配置大模型 API"
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{apiKey ? '模型已就绪' : '配置模型'}</span>
            <span className="sm:hidden">{apiKey ? '模型' : '配置'}</span>
          </button>
        </div>
      </header>

      {/* 🌟 核心新功能：手机端原生级底部磨砂导航栏 (Mobile Bottom Bar) 🌟 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-mobile-nav bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 flex items-center justify-around z-40 px-2 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                isActive ? 'text-amber-400 font-semibold scale-105' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className={`p-1 rounded-md ${isActive ? 'bg-amber-500/15' : ''}`}>
                {item.icon}
              </div>
              <span className="text-[10px] tracking-tight">{item.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* 模型设置弹窗 (全自适应，手机端大屏友好) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            ref={settingsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-settings-title"
            tabIndex={-1}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 md:p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 id="model-settings-title" className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-400" />
                大语言模型设置 (BYOM)
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                aria-label="关闭模型设置"
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 快捷预设 */}
            <div>
              <span className="text-[11px] text-zinc-400 block mb-1.5">快捷填充服务商配置：</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('deepseek')}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] border border-zinc-700 flex items-center gap-1"
                >
                  <Cpu className="w-3 h-3 text-blue-400" />
                  DeepSeek
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('openai')}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] border border-zinc-700 flex items-center gap-1"
                >
                  <Cpu className="w-3 h-3 text-emerald-400" />
                  OpenAI
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('ollama')}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] border border-zinc-700 flex items-center gap-1"
                >
                  <Cpu className="w-3 h-3 text-amber-400" />
                  本地 Ollama
                </button>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="model-config-baseUrl" className="block text-zinc-300 font-medium mb-1">API Base URL</label>
                <input
                  id="model-config-baseUrl"
                  type="text"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  placeholder="https://api.deepseek.com/v1 或 http://127.0.0.1:8045"
                  aria-invalid={!!fieldError('baseUrl')}
                  aria-describedby="model-config-baseUrl-hint"
                  className={`w-full bg-zinc-950 border rounded-md px-3 py-2 text-zinc-200 focus:outline-none font-mono text-xs ${
                    fieldError('baseUrl') ? 'border-rose-500/60 focus:border-rose-400' : 'border-zinc-800 focus:border-amber-500'
                  }`}
                />
                <FieldHint id="model-config-baseUrl-hint" error={fieldError('baseUrl')} warning={validation.warnings.baseUrl} />
              </div>

              <div>
                <label htmlFor="model-config-apiKey" className="block text-zinc-300 font-medium mb-1">API Key</label>
                <input
                  id="model-config-apiKey"
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-..."
                  aria-invalid={!!fieldError('apiKey')}
                  aria-describedby="model-config-apiKey-hint"
                  className={`w-full bg-zinc-950 border rounded-md px-3 py-2 text-zinc-200 focus:outline-none font-mono text-xs ${
                    fieldError('apiKey') ? 'border-rose-500/60 focus:border-rose-400' : 'border-zinc-800 focus:border-amber-500'
                  }`}
                />
                <FieldHint id="model-config-apiKey-hint" error={fieldError('apiKey')} warning={validation.warnings.apiKey} />
              </div>

              <div>
                <label htmlFor="model-config-model" className="block text-zinc-300 font-medium mb-1">模型名称 (Model)</label>
                <input
                  id="model-config-model"
                  type="text"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  placeholder="deepseek-chat / gpt-4o / gpt-4o-mini"
                  aria-invalid={!!fieldError('model')}
                  aria-describedby="model-config-model-hint"
                  className={`w-full bg-zinc-950 border rounded-md px-3 py-2 text-zinc-200 focus:outline-none font-mono text-xs ${
                    fieldError('model') ? 'border-rose-500/60 focus:border-rose-400' : 'border-zinc-800 focus:border-amber-500'
                  }`}
                />
                <FieldHint id="model-config-model-hint" error={fieldError('model')} warning={validation.warnings.model} />
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{testResult.message}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5 disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                <span>{testing ? '测试中...' : '测试连通性'}</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-zinc-950"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
