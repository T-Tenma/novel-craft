import { formatActionError } from '../services/llmErrors.ts';

export interface DiagnosisFailureNotice {
  tone: 'error' | 'info';
  text: string;
}

// 手动点「诊断」失败如实报错；示范初稿后自动触发的诊断失败只给弱提示，避免让人误以为初稿生成失败
export function diagnosisFailureNotice(triggeredManually: boolean, message: string): DiagnosisFailureNotice {
  return triggeredManually
    ? { tone: 'error', text: formatActionError('节奏诊断', message) }
    : { tone: 'info', text: '初稿已写入；自动节奏诊断未完成，可稍后点「诊断」重试' };
}
