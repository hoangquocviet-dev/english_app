import { useEffect, useRef } from 'react'

interface ChildModalEntry {
  id: number
  close: () => void
}

const activeChildClosers: ChildModalEntry[] = []
let nextChildModalId = 1

export function consumeTopChildModalBack(): boolean {
  const top = activeChildClosers.pop()
  if (!top) return false
  top.close()
  return true
}

export function hasOpenChildModal(): boolean {
  return activeChildClosers.length > 0
}

export function useChildModalBack(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return

    const id = nextChildModalId++
    activeChildClosers.push({
      id,
      close: () => onCloseRef.current(),
    })

    if (!window.history.state?.vocabflowOverlay) {
      window.history.pushState({ vocabflowOverlay: true }, '')
    }

    return () => {
      const idx = activeChildClosers.findIndex((item) => item.id === id)
      if (idx !== -1) {
        activeChildClosers.splice(idx, 1)
      }
    }
  }, [isOpen])
}
