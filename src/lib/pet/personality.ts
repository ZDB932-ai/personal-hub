const ease = (x: number) => { const t = Math.max(0,Math.min(1,x)); return t*t*(3-2*t) }
export function gesture(time: number) {
  const prepare = ease(time/.45)*(1-ease((time-.55)/.5))
  const reveal = ease((time-.45)/.6)*(1-ease((time-2.3)/.8))
  const glance = ease((time-.6)/.5)-2*ease((time-1.35)/.55)+ease((time-2.2)/.6)
  const turn = ease((time-.55)/1.7)
  const hop = Math.sin(Math.PI*ease((time-.45)/1.1))*.065
  return { prepare,reveal,glance,turn,hop }
}

export function shyExpression(time: number) {
  const settle = ease((time-.3)/.65)*(1-ease((time-2.35)/.8))
  const peek = ease((time-1.55)/.45)*(1-ease((time-2.25)/.5))
  return { lids: settle*.12*(1-peek*.75), smile: settle*.65, attention: 1-settle*.9 }
}

export function peekExpression(time: number) {
  const curious = ease((time-.15)/.7)*(1-ease((time-1.35)/.4))
  const startled = ease((time-1.38)/.07)*(1-ease((time-1.52)/.16))
  const bashful = ease((time-1.8)/.4)*(1-ease((time-2.65)/.8))
  return { lids: Math.max(startled*.85,bashful*.12), smile:bashful*.55, attention:1-Math.max(curious,bashful,startled)*.95 }
}

export const curiousActions = ['peek','wave','shy','peek'] as const
export function nextCuriousAction(previous: string, random: number) {
  const choices = curiousActions.filter(action=>action!==previous)
  return choices[Math.min(choices.length-1,Math.max(0,Math.floor(random*choices.length)))]!
}
