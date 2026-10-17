// 首次启动的演示内容（赛博修真示例卷、人物卡与设定）。单独成模块，便于识别作者没改过的演示内容：开始一本新书或载入老项目时可以安全移除
import type { CharacterItem, StoryVolume, WorldElement } from '../types';

export const INITIAL_CHAPTER_CONTENT = `暴雨冲刷着九龙霓虹闪烁的仿生飞檐。

林宵抬起手，后颈的神经接口还在渗出带着机油味的淡银色冷却液。
在他面前破旧的铁皮工作台上，摆放着一台被熔断的义体烙铁，以及一枚冒着蓝绿色电弧的“铜钱”。

那不是普通的铜钱，铜钱的正反两面，用激光蚀刻着密集如电路板的道教《太上感应篇》符文。

“自杀？还是被算力贷公司灭口？”
林宵揉着剧痛的眉心，调出了视网膜前的系统界面。一行血红色的警报正在不断闪烁：
【警告：脑机神经熵值已达 89%，距化为‘赛博尸煞’还剩 47 小时】`;

export const DEMO_VOLUMES: StoryVolume[] = [
  {
    id: 'vol-1',
    title: '第一卷：数据道经与九龙夜雨',
    description: '主角在死局重生，破除算力贷灭口危机，初探暗网与宗门芯片',
    chapters: [
      {
        id: 'chap-1',
        title: '第一章：雨夜与脑机香火',
        content: INITIAL_CHAPTER_CONTENT,
        word_count: INITIAL_CHAPTER_CONTENT.replace(/\s+/g, '').length,
        status: 'draft',
        reference_chapter_id: 1,
      },
      {
        id: 'chap-2',
        title: '第二章：黑网追凶与玄通道人',
        content: '',
        word_count: 0,
        status: 'draft',
        reference_chapter_id: 2,
      },
    ],
  },
  {
    id: 'vol-2',
    title: '第二卷：财阀长生殿与赛博天劫',
    description: '进入大都市上层，接触长生财阀的核心机密',
    chapters: [
      {
        id: 'chap-3',
        title: '第一章：飞升许可证',
        content: '',
        word_count: 0,
        status: 'draft',
      },
    ],
  },
];

// 首次启动默认选中的演示脑洞「赛博道门：数据飞升者」
export const DEMO_IDEA_ID = 'demo-1';

export const DEMO_CHARACTERS: CharacterItem[] = [
  {
    name: '林宵',
    role: '男主角 / 贫民窟脑机散修',
    status: '新登场',
    key_action: '在脑机过载濒死时苏醒，发现体内寄生上古道经铜钱',
    inner_motivation: '在47小时脑机熵值化煞倒计时前活下去，查明前身死因'
  },
  {
    name: '玄通老道',
    role: '引路人 / 暗网黑市义体改造医修',
    status: '已有角色',
    key_action: '为主角提供初始抑制剂，私下推销走私道门符文芯片',
    inner_motivation: '寻求传说中的飞升算力核心，但自身义体已严重老化'
  }
];

export const DEMO_WORLD_ELEMENTS: WorldElement[] = [
  {
    term: '太上感应铜钱',
    category: '力量体系',
    description: '激光蚀刻道教符文的量子运算核心，每次运转扣除人类情感算力值。'
  },
  {
    term: '九龙贫民窟·下层网络',
    category: '地理背景',
    description: '排污管道与高压光纤交织的无序地下城，被算力贷压垮的修士在此沦为赛博厉鬼。'
  }
];
