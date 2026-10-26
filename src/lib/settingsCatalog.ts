export type SettingsKey = 'appearance' | 'pet' | 'desktop' | 'account' | 'security' | 'sync' | 'backup' | 'about'

export interface SettingsSection {
  key: SettingsKey
  label: string
  description: string
  group: '个性化' | '账户与数据' | '帮助'
  keywords: string
  desktopOnly?: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { key: 'appearance', label: '外观', description: '选择界面风格、颜色与背景，让工作区更合心意。', group: '个性化', keywords: '主题 颜色 显示 浅色 深色 跟随系统 风格 壁纸 背景 推荐搭配 透明度' },
  { key: 'pet', label: '桌面伙伴', description: '挑选喜欢的角色，调整陪伴方式与提醒。', group: '个性化', keywords: '玩偶 桌宠 宠物 角色 动画 提醒 伙伴 大小 巡游' },
  { key: 'desktop', label: '桌面清单', description: '在桌面上查看待办，安排窗口和锁定后的显示内容。', group: '个性化', keywords: 'todo 待办 悬浮 窗口 置顶 折叠 位置 清单 任务 锁屏', desktopOnly: true },
  { key: 'account', label: '账户与恢复', description: '管理账户信息、登录密码和账户恢复方式。', group: '账户与数据', keywords: '云账号 帐号 登录 名称 改密 密码 恢复密钥 本机账户 账号' },
  { key: 'security', label: '隐私与锁定', description: '保护当前设备上的数据，设置自动锁定与解锁方式。', group: '账户与数据', keywords: '安全 加密 主密码 自动锁定 指纹 生物识别 隐私 解锁' },
  { key: 'sync', label: '同步与离线', description: '查看同步状态，管理附件下载、离线记录和连接。', group: '账户与数据', keywords: '云服务 云端 联网 同步 离线 附件 下载 后台 冲突 连接 地址 服务器 令牌 诊断' },
  { key: 'backup', label: '备份与迁移', description: '导出或恢复数据，找回删除的内容，并迁移到其他设备。', group: '账户与数据', keywords: '备份 恢复 数据 导入 导出 回收站 删除 历史 版本 设备 加入 迁移 文件' },
  { key: 'about', label: '关于与帮助', description: '查看应用信息、快捷键和数据使用说明。', group: '帮助', keywords: '关于 帮助 快捷键 版本 通知 隐私 数据 支持 Personal Hub' },
]

export interface SettingsDestination {
  id: string
  section: SettingsKey
  label: string
  description: string
  keywords: string
  category?: string
}

export const SETTINGS_DESTINATIONS: SettingsDestination[] = [
  ...SETTINGS_SECTIONS.filter(item => item.key !== 'appearance').map(item => ({ id: item.key, section: item.key, label: item.label, description: item.description, keywords: item.keywords })),
  { id: 'appearance-display', section: 'appearance', label: '颜色与显示', description: '外观 · 浅色、深色、跟随系统与强调色', keywords: '外观 主题 颜色 显示 浅色 深色 跟随系统 强调色', category: 'display' },
  { id: 'appearance-interface', section: 'appearance', label: '界面风格', description: '外观 · 选择工作区设计与控件样式', keywords: '外观 界面 风格 样式 设计 简约 创意 复古 科技 纸感 推荐配色 瑞士 终端 粗野 手札 轨道 工坊 蓝图 艺廊 像素 晨光 极光 精密', category: 'interface' },
  { id: 'appearance-wallpapers', section: 'appearance', label: '背景图片', description: '外观 · 壁纸、图片柔化与面板透明度', keywords: '外观 背景 壁纸 图片 上传 模糊 柔化 透明 面板 遮罩 阅读 衬底', category: 'wallpapers' },
  { id: 'appearance-scenes', section: 'appearance', label: '推荐搭配', description: '外观 · 一起设置界面、颜色与背景', keywords: '外观 推荐 搭配 场景 风格 壁纸 主题', category: 'scenes' },
]

export function searchSettings(query: string, desktop: boolean): SettingsDestination[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return SETTINGS_DESTINATIONS.filter(item => (desktop || item.section !== 'desktop') && terms.every(term => `${item.label} ${item.description} ${item.keywords}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => Number(b.label.includes(query.trim())) - Number(a.label.includes(query.trim())))
}
