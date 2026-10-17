import type { TechniquePrompt } from '../types';

export const DEFAULT_PROMPT_ARSENAL: TechniquePrompt[] = [
  // 1. 氛围渲染 (Atmosphere)
  {
    id: 'atm-1',
    category: 'atmosphere',
    category_label: '氛围渲染',
    name: '电影级冷开场 (Cold Open)',
    description: '跳过冗长背景说明，第一眼直接聚焦在尸体、致命伤口或倒计时警报上。',
    prompt_template: '请用冷峻、高密度的镜头语言描写开场环境：调动光影、刺鼻气味（如硝烟或机油）、生理刺痛，严禁倒灌大段世界观说明，直接将主角推进致命险境第一现场。',
  },
  {
    id: 'atm-2',
    category: 'atmosphere',
    category_label: '氛围渲染',
    name: '不可名状压迫 (Lovecraftian/Dread)',
    description: '用细微的错位感、视界重影与耳畔低语营造深层惊悚。',
    prompt_template: '描写环境中非理性的扭曲感：如墙角渗出的黏液、空气中诡异的焦糊甜味、以及耳畔层层叠叠的重叠呓语，制造强烈的心理惊悚与SAN值下降的压迫感。',
  },
  {
    id: 'atm-3',
    category: 'atmosphere',
    category_label: '氛围渲染',
    name: '赛博底层市井与霓虹雨夜',
    description: '高科技与低生活的尖锐反差，破旧铁皮屋与刺目全息广告牌。',
    prompt_template: '描写底层九龙贫民窟的暴雨夜：腐蚀性酸雨滴在裸露电线上爆出的蓝绿色火花，全息招牌的故障频闪，以及主角破旧义体关节渗出的冰冷机油。',
  },

  // 2. 动作与战斗博弈 (Action)
  {
    id: 'act-1',
    category: 'action',
    category_label: '动作博弈',
    name: '生死一线快节奏近身对决',
    description: '短句快节奏推进，肌肉发力、骨骼碎裂与神经电信号爆发。',
    prompt_template: '写一段极高强度的生死格斗：大量使用短句和暴力动词，侧重动作节奏、视线交错、兵刃割裂肌肉的钝痛感与破空呼啸声，绝不拖泥带水。',
  },
  {
    id: 'act-2',
    category: 'action',
    category_label: '动作博弈',
    name: '超凡力量/金手指代价反噬爆发',
    description: '展现强大爽点的同时，描写身体与灵魂承受反噬的生理极限。',
    prompt_template: '主角在绝境中被迫强开金手指：描写力量暴涨破局的震撼视觉，同时同步描写神经元烧毁、瞳孔充血、骨骼承重的刺痛，展现“凡有力量，必有代价”的悲壮张力。',
  },

  // 3. 对白交锋与潜台词 (Dialogue)
  {
    id: 'dia-1',
    category: 'dialogue',
    category_label: '潜台词对白',
    name: '官方执法者生死盘问 (高压试探)',
    description: '表面公事公办，实则言辞如刀、步步紧逼寻找心理破绽。',
    prompt_template: '设计一段主角与盘问者之间的暗流涌动对白：盘问者漫不经心翻看卷宗，眼神却如鹰隼般锁定微表情；主角强压心跳、字斟句酌，每一句台词都在生死边缘试探。',
  },
  {
    id: 'dia-2',
    category: 'dialogue',
    category_label: '潜台词对白',
    name: '三翻四抖的信息差掩护',
    description: '用假线索误导对手，读者知情而剧中人不知情的高级信息差。',
    prompt_template: '构建一段充满信息差的交谈：主角故意露出一处看似破绽的次要线索，引诱对方得出错误推论，从而掩护体内最大的违禁秘密。',
  },

  // 4. 心理活动与生理反应 (Psychology)
  {
    id: 'psy-1',
    category: 'psychology',
    category_label: '心理生理',
    name: '濒死恐惧与肾上腺狂飙',
    description: '心脏如重鼓撞击肋骨，冷汗浸透后背，强迫大脑维持极端冷静。',
    prompt_template: '描写主角在极端死亡威胁下的生理反应：耳鸣如蝉啸、视野狭窄为隧道视角、太阳穴突突狂跳，在狂乱的本能恐惧中强迫逻辑思维极速运转。',
  },

  // 5. 剧情高潮与反转断章 (Plot Twist)
  {
    id: 'twi-1',
    category: 'plot_twist',
    category_label: '反转断章',
    name: '黄金章末致命悬念 (Cliffhanger Hook)',
    description: '在章节最后一句话抛出突发危机或颠覆性线索，让读者非看下一章不可。',
    prompt_template: '在这一段结尾制造一个颠覆性断章钩子：例如敲门声突兀响起、死者尸体突然睁眼、或者系统弹出一行不可思议的血红倒计时，瞬间颠覆前文假设！',
  },
];
