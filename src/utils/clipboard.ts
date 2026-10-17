// 复制到剪贴板：优先异步剪贴板 API；被拒绝（权限 / 非安全上下文）或不存在时退回 execCommand('copy')。
// 返回是否真的复制成功，界面据此显示「已复制」或失败提示，不再无条件显示成功

export interface ClipboardDeps {
  writeText?: (text: string) => Promise<void>;
  legacyCopy: (text: string) => boolean;
}

function legacyCopyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

function browserClipboardDeps(): ClipboardDeps {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  return {
    writeText: clipboard?.writeText ? (text) => clipboard.writeText(text) : undefined,
    legacyCopy: legacyCopyWithTextarea,
  };
}

export async function copyText(text: string, deps: ClipboardDeps = browserClipboardDeps()): Promise<boolean> {
  if (deps.writeText) {
    try {
      await deps.writeText(text);
      return true;
    } catch {
      // 继续尝试旧方案
    }
  }
  try {
    return deps.legacyCopy(text);
  } catch {
    return false;
  }
}
