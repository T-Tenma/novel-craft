// 去掉推理模型（如 DeepSeek-R1）输出里的思考过程，只留正文 / JSON：
// 1. 成对的 <think>…</think>（不区分大小写，可有多段）
// 2. 部分代理会吞掉开头的 <think>，只剩结尾 </think>：其前面的内容都是思考
// 3. 输出被截断、只有 <think> 没有结尾：其后全是思考，不能混进正文
export function stripThinking(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

  const lastClose = text.toLowerCase().lastIndexOf('</think>');
  if (lastClose >= 0) {
    text = text.slice(lastClose + '</think>'.length);
  }

  const unclosedOpen = text.search(/<think>/i);
  if (unclosedOpen >= 0) {
    text = text.slice(0, unclosedOpen);
  }

  return text.trim();
}
