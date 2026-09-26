export function turnToward(current: number, target: number, seconds: number) {
  const delta = Math.atan2(Math.sin(target-current),Math.cos(target-current))
  const limit = Math.max(0,Math.min(seconds,.05))*4.5
  return current+Math.max(-limit,Math.min(limit,delta))
}

export function moveToward(position: {x:number;y:number}, target: {x:number;y:number}, speed: number, seconds: number) {
  const dx=target.x-position.x, dy=target.y-position.y
  const distance=Math.hypot(dx,dy)
  const dt=Math.max(0,Math.min(seconds,.1))
  const desired=Math.min(62,Math.sqrt(2*240*distance))
  const nextSpeed=Math.max(0,speed+Math.max(-600*dt,Math.min(600*dt,desired-speed)))
  const step=Math.min(distance,nextSpeed*dt)
  const arrived=distance<=.5 || step>=distance
  return {
    x:arrived ? target.x : position.x+dx/distance*step,
    y:arrived ? target.y : position.y+dy/distance*step,
    speed:arrived ? 0 : nextSpeed,
    arrived,
    distance:arrived ? distance : step,
  }
}
