export const WALLPAPER_CATEGORIES = ['全部', '艺术', '风景', '经典'] as const
export type WallpaperCategory = typeof WALLPAPER_CATEGORIES[number]

export const BUILT_IN_WALLPAPERS = [
  { id: 'forest-lake', name: '雾隐松湖', category: '风景', description: '翡翠湖面与晨雾松林', src: '/wallpapers/forest-lake.jpg', thumb: '/wallpapers/forest-lake-thumb.jpg' },
  { id: 'coast', name: '碧海白沙', category: '风景', description: '清透海水与柔软浪线', src: '/wallpapers/coast.jpg', thumb: '/wallpapers/coast-thumb.jpg' },
  { id: 'obsidian', name: '曜石丝绸', category: '艺术', description: '深黑缎带与香槟金折光', src: '/wallpapers/obsidian.jpg', thumb: '/wallpapers/obsidian-thumb.jpg' },
  { id: 'moon', name: '月落群山', category: '风景', description: '靛蓝山影与静谧月色', src: '/wallpapers/moon.jpg', thumb: '/wallpapers/moon-thumb.jpg' },
  { id: 'solar', name: '日光雕塑', category: '艺术', description: '杏橙陶瓷与温柔日光', src: '/wallpapers/solar.jpg', thumb: '/wallpapers/solar-thumb.jpg' },
  { id: 'abyss', name: '深海流光', category: '艺术', description: '钴蓝玻璃与深海折光', src: '/wallpapers/abyss.jpg', thumb: '/wallpapers/abyss-thumb.jpg' },
  { id: 'dunes', name: '沙丘暮色', category: '风景', description: '玫瑰沙丘与紫色远山', src: '/wallpapers/dunes.jpg', thumb: '/wallpapers/dunes-thumb.jpg' },
  { id: 'garden', name: '云端花园', category: '艺术', description: '冰蓝兰紫与通透花瓣', src: '/wallpapers/garden.jpg', thumb: '/wallpapers/garden-thumb.jpg' },
  ...[
    ['w1', '极光'], ['w2', '暮色'], ['w3', '海洋'], ['w4', '日出'], ['w5', '森林'], ['w6', '石墨'],
  ].map(([id, name]) => ({ id: id!, name: name!, category: '经典', description: '轻量抽象色彩', src: `/wallpapers/${id}.jpg`, thumb: `/wallpapers/${id}.jpg` })),
]
