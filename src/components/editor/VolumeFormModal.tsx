import React, { useState } from 'react';
import { FolderPlus, Edit2 } from 'lucide-react';
import { validateUniqueName } from '../../utils/collections';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const VOLUME_TITLE_MAX_LENGTH = 60;

interface VolumeFormModalProps {
  // 传入则为编辑模式（预填原标题与主线）
  initial?: { title: string; description: string };
  // 全部分卷标题，用于重名校验；编辑模式下用 editingIndex 排除自身
  existingTitles: string[];
  editingIndex?: number;
  onSubmit: (title: string, description: string) => void;
  onClose: () => void;
}

// 新建 / 编辑分卷弹窗
export const VolumeFormModal: React.FC<VolumeFormModalProps> = ({ initial, existingTitles, editingIndex, onSubmit, onClose }) => {
  const isEdit = initial !== undefined;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const handleSubmit = () => {
    const message = validateUniqueName({
      value: title,
      existing: existingTitles,
      label: '分卷标题',
      excludeIndex: editingIndex ?? null,
      maxLength: VOLUME_TITLE_MAX_LENGTH,
    });
    if (message) {
      setError(message);
      return;
    }
    onSubmit(title.trim(), description.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="volume-form-dialog-title"
        tabIndex={-1}
        className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl max-h-[85dvh] overflow-y-auto focus:outline-none"
      >
        <h3 id="volume-form-dialog-title" className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
          {isEdit ? <Edit2 className="w-4 h-4 text-amber-400" /> : <FolderPlus className="w-4 h-4 text-amber-400" />}
          {isEdit ? '编辑分卷' : '创建新分卷'}
        </h3>
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-zinc-300 mb-1">分卷标题</label>
            <input
              type="text"
              placeholder="例如: 第三卷：深渊之门与旧神低语"
              value={title}
              maxLength={VOLUME_TITLE_MAX_LENGTH}
              aria-invalid={!!error}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              className={`w-full bg-zinc-950 border rounded p-2 text-zinc-100 ${error ? 'border-rose-500/60' : 'border-zinc-800'}`}
            />
            {error && <p role="alert" className="mt-1 text-[11px] text-rose-400">{error}</p>}
          </div>
          <div>
            <label className="block text-zinc-300 mb-1">分卷核心主线/高潮目标 (可选)</label>
            <textarea
              rows={2}
              placeholder="例如: 主角潜入深渊裂隙，完成序列突破并击杀初代堕落者"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-100"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs text-zinc-400 hover:bg-zinc-800">
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-1.5 rounded text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
          >
            {isEdit ? '保存修改' : '确定创建'}
          </button>
        </div>
      </div>
    </div>
  );
};
