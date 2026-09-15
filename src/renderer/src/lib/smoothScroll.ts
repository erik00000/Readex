interface ScrollAnimation {
  frame: number
  target: number
}

const animations = new WeakMap<HTMLElement, ScrollAnimation>()

export function normalizedWheelDelta(
  deltaY: number,
  deltaMode: number,
  fineStep: number,
  viewportHeight: number
): number {
  let pixels = deltaY
  if (deltaMode === 1) pixels *= 18
  if (deltaMode === 2) pixels *= viewportHeight

  const magnitude = Math.abs(pixels)
  if (magnitude <= 18) return pixels * 0.45
  return Math.sign(pixels) * Math.min(fineStep, magnitude * 0.42)
}

export function smoothScrollBy(
  element: HTMLElement,
  delta: number,
  smooth: boolean,
  duration = 150
): void {
  const max = Math.max(0, element.scrollHeight - element.clientHeight)
  if (!smooth || Math.abs(delta) < 1) {
    element.scrollTop = clamp(element.scrollTop + delta, 0, max)
    return
  }

  const current = animations.get(element)
  if (current) cancelAnimationFrame(current.frame)
  const start = element.scrollTop
  const target = clamp((current?.target ?? start) + delta, 0, max)
  const startedAt = performance.now()

  const tick = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / duration)
    const eased = 1 - (1 - progress) ** 3
    element.scrollTop = start + (target - start) * eased
    if (progress < 1) {
      const animation = animations.get(element)
      if (animation) animation.frame = requestAnimationFrame(tick)
      return
    }
    animations.delete(element)
  }

  animations.set(element, { frame: requestAnimationFrame(tick), target })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
