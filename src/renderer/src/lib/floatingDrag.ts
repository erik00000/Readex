import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { FloatingDragHandlers } from '../readers/types'

interface DragState {
  pointerId: number | null
  pending: boolean
  starting: boolean
  active: boolean
  startScreenX: number
  startScreenY: number
  screenX: number
  screenY: number
  initialSelectionText: string
}

const DRAG_THRESHOLD_PX = 4

const INITIAL_STATE: DragState = {
  pointerId: null,
  pending: false,
  starting: false,
  active: false,
  startScreenX: 0,
  startScreenY: 0,
  screenX: 0,
  screenY: 0,
  initialSelectionText: ''
}

export function useFloatingWindowDrag(enabled: boolean): FloatingDragHandlers {
  const stateRef = useRef<DragState>({ ...INITIAL_STATE })

  const end = useCallback((event?: PointerEvent): void => {
    const state = stateRef.current
    if (event && state.pointerId !== event.pointerId) return
    const shouldNotify = state.starting || state.active
    stateRef.current = { ...INITIAL_STATE }
    if (shouldNotify) void window.readex.windowControl.endFloatingDrag()
  }, [])

  const onPointerDown = useCallback(
    (event: PointerEvent): void => {
      if (!enabled || event.button !== 0 || !shouldTrackFloatingDrag(event)) return

      const state = stateRef.current
      state.pointerId = event.pointerId
      state.pending = true
      state.starting = false
      state.active = false
      state.startScreenX = event.screenX
      state.startScreenY = event.screenY
      state.screenX = event.screenX
      state.screenY = event.screenY
      state.initialSelectionText = event.view?.getSelection()?.toString().trim() ?? ''
    },
    [enabled]
  )

  const onPointerMove = useCallback(
    (event: PointerEvent): void => {
      const state = stateRef.current
      if (!enabled || state.pointerId !== event.pointerId) return
      state.screenX = event.screenX
      state.screenY = event.screenY
      if (state.active) {
        window.readex.windowControl.moveFloatingDrag(event.screenX, event.screenY)
        return
      }

      if (
        !state.pending ||
        !hasExceededFloatingDragThreshold(
          state.startScreenX,
          state.startScreenY,
          event.screenX,
          event.screenY
        )
      ) {
        return
      }

      const pointerId = state.pointerId
      const startScreenX = state.startScreenX
      const startScreenY = state.startScreenY
      const selection = event.view?.getSelection() ?? null
      state.pending = false
      state.starting = true

      const scheduleFrame = (callback: FrameRequestCallback): number =>
        event.view
          ? event.view.requestAnimationFrame(callback)
          : window.requestAnimationFrame(callback)
      scheduleFrame(() => {
        const current = stateRef.current
        if (current.pointerId !== pointerId || !current.starting) return
        if (!shouldPromoteFloatingDrag(selection, state.initialSelectionText)) {
          stateRef.current = { ...INITIAL_STATE }
          return
        }

        void window.readex.windowControl
          .beginFloatingDrag(startScreenX, startScreenY)
          .then((accepted) => {
            const latest = stateRef.current
            if (latest.pointerId !== pointerId) {
              if (accepted) void window.readex.windowControl.endFloatingDrag()
              return
            }
            if (!accepted) {
              stateRef.current = { ...INITIAL_STATE }
              return
            }
            latest.starting = false
            latest.active = true
            window.readex.windowControl.moveFloatingDrag(
              latest.screenX,
              latest.screenY
            )
          })
          .catch(() => end())
      })
    },
    [enabled, end]
  )

  const onPointerUp = useCallback(
    (event: PointerEvent): void => end(event),
    [end]
  )

  useEffect(() => {
    if (!enabled) end()
  }, [enabled, end])

  useEffect(() => end, [end])

  return useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp }),
    [onPointerDown, onPointerMove, onPointerUp]
  )
}

export function shouldTrackFloatingDrag(
  event: Pick<PointerEvent, 'target'>
): boolean {
  const element =
    event.target && 'closest' in event.target ? (event.target as Element) : null
  if (!element) return false

  return !element.closest(
      'button, input, select, textarea, option, a, [contenteditable="true"], [data-floating-no-drag]'
    )
}

export function hasExceededFloatingDragThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): boolean {
  const deltaX = currentX - startX
  const deltaY = currentY - startY
  return Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX
}

export function hasActiveTextSelection(selection: Selection | null): boolean {
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
}

export function shouldPromoteFloatingDrag(
  selection: Selection | null,
  initialSelectionText: string
): boolean {
  if (!hasActiveTextSelection(selection)) return true
  return selection?.toString().trim() === initialSelectionText
}
