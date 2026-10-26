export const INTERFACE_STYLE_CATEGORIES = [
  { key: 'minimal', label: '简约专注' },
  { key: 'paper', label: '自然纸感' },
  { key: 'technical', label: '科技工作台' },
  { key: 'retro', label: '复古趣味' },
  { key: 'editorial', label: '编辑艺术' },
] as const

export type InterfaceStyleCategory = typeof INTERFACE_STYLE_CATEGORIES[number]['key']

export const INTERFACE_STYLES = [
  { key: 'swiss', label: '瑞士编辑', navigation: 'top', description: '顶端报头 · 巨幅日期 · 编辑式任务', accent: 'coral', mode: 'light', category: 'editorial', detail: '像一份属于自己的日报：顶部栏目导航、巨大日期与细线任务版面。' },
  { key: 'terminal', label: '赛博终端', navigation: 'left', description: '命令侧栏 · 参数矩阵 · 单列控制台', accent: 'teal', mode: 'dark', category: 'technical', detail: '把日程变成工作控制台：命令侧栏、参数读数、方括号按钮与横向日程。' },
  { key: 'brutalist', label: '新粗野主义', navigation: 'left', description: '大块导航 · 海报标题 · 任务贴纸', accent: 'coral', mode: 'light', category: 'editorial', detail: '用粗线海报、大块导航和双列任务贴纸表达优先级，按钮带硬边压印。' },
  { key: 'retro', label: '复古桌面', navigation: 'bottom', description: '底部任务栏 · 桌面窗口 · 立体按钮', accent: 'cobalt', mode: 'light', category: 'retro', detail: '底部任务栏配日历窗口，凸起按钮和可折叠日程带回经典桌面的操作感。' },
  { key: 'botanical', label: '自然手札', navigation: 'right', description: '右侧叶签 · 植物插画 · 双页手札', accent: 'teal', mode: 'light', category: 'paper', detail: '右侧叶形书签、植物线描和双页纸面，让计划像翻开的自然手札。' },
  { key: 'orbital', label: '轨道空间', navigation: 'dock', description: '悬浮 Dock · 进度轨道 · 舷窗任务', accent: 'orchid', mode: 'dark', category: 'technical', detail: '底部悬浮 Dock、真实完成度轨道和舷窗任务，构成自己的指挥舱。' },
  { key: 'atelier', label: '纸上工坊', navigation: 'right', description: '侧边书签 · 装订笔记 · 手帐按钮', accent: 'amber', mode: 'light', category: 'paper', detail: '右侧书签栏、可见装订线和横线任务纸，像随时可以继续书写的工作手册。' },
  { key: 'blueprint', label: '工程蓝图', navigation: 'left', description: '编号导航 · 图纸标题栏 · 工程清单', accent: 'blue', mode: 'dark', category: 'technical', detail: '导航按编号排列，日期与容量进入图纸标题栏，任务成为清楚的工程清单。' },
  { key: 'gallery', label: '艺廊留白', navigation: 'top', description: '顶端展签 · 巨幅衬线 · 单列展陈', accent: 'rose', mode: 'light', category: 'editorial', detail: '像一间私人艺廊：顶部展签导航、巨大衬线标题和纵向展陈式任务。' },
  { key: 'arcade', label: '像素游乐场', navigation: 'left', description: '街机菜单 · 像素进度 · 方块按钮', accent: 'violet', mode: 'dark', category: 'retro', detail: '街机菜单配真实任务进度，像素阶梯按钮和硬边卡片让工作多一点游戏感。' },
  { key: 'classic', label: '经典纸感', navigation: 'left', description: '暖白纸面 · 轻边框 · 从容留白', accent: 'teal', mode: 'light', category: 'minimal', detail: '暖白纸面与轻盈边框，适合专注阅读和日常安排。' },
  { key: 'sunrise', label: '晨光工作室', navigation: 'top', description: '悬浮顶栏 · 晨光半圆 · 日记排版', accent: 'amber', mode: 'light', category: 'paper', detail: '圆润顶部导航、晨光半圆和日记式排版，柔和地打开一天。' },
  { key: 'aurora', label: '极光浮岛', navigation: 'left', description: '悬浮侧栏 · 指标拼贴 · 圆角卡片', accent: 'indigo', mode: 'light', category: 'minimal', detail: '独立悬浮导航配指标拼贴，任务和日程排列成轻盈的卡片空间。' },
  { key: 'precision', label: '精密面板', navigation: 'left', description: '紧凑导航 · 指标表格 · 高密度清单', accent: 'blue', mode: 'dark', category: 'minimal', detail: '紧凑导航、指标表头与规整任务行，适合集中查看工作信息。' },
] as const

export type InterfaceStyle = typeof INTERFACE_STYLES[number]['key']

export const WORKSPACE_LABELS: Record<InterfaceStyle, { calendar: string; todo: string }> = {
  classic: { calendar: '日程安排', todo: '桌面待办' },
  swiss: { calendar: '日程版', todo: '今日清单' },
  terminal: { calendar: '日程控制台', todo: '任务队列' },
  brutalist: { calendar: '行动排期', todo: '待办贴纸' },
  retro: { calendar: '日历窗口', todo: '待办窗口' },
  botanical: { calendar: '日常手札', todo: '随身清单' },
  orbital: { calendar: '时间轨道', todo: '任务舱' },
  atelier: { calendar: '排期手账', todo: '今日便笺' },
  blueprint: { calendar: '时间图纸', todo: '执行清单' },
  gallery: { calendar: '时间展签', todo: '今日展签' },
  arcade: { calendar: '今日关卡', todo: '待办进度' },
  sunrise: { calendar: '晨间日记', todo: '今日小事' },
  aurora: { calendar: '日程浮岛', todo: '待办浮窗' },
  precision: { calendar: '排程面板', todo: '待办面板' },
}
