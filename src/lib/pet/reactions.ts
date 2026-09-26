export class PetReactions {
  private touches: number[] = []
  private shyUntil = 0
  touch(now: number) {
    this.touches = this.touches.filter(time=>now-time<2500)
    this.touches.push(now)
    if(this.touches.length>=3 && now>=this.shyUntil) {
      this.touches = []
      this.shyUntil = now+6000
      return 'shy'
    }
    return 'happy'
  }
}

export function afterInteraction(action: string) {
  if(action==='eat') return { mood:'happy',text:'吃饱啦！给你挥挥手，谢谢投喂。',duration:2800 }
  if(action==='peek') return { mood:'wave',text:'',duration:2800 }
  return undefined
}
