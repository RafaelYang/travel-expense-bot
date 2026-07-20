"use client"

import {
  closestCenter,
  DndContext,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { CSSProperties, HTMLAttributes, ReactNode, SyntheticEvent } from "react"
import { useEffect, useRef } from "react"

export type SortableTransactionRootProps = HTMLAttributes<HTMLElement> & {
  ref: (node: HTMLElement | null) => void
  style: CSSProperties
  "data-sortable-id": string
  "data-sortable-dragging": "true" | "false"
}

export interface SortableTransactionItem {
  id: string
  render: (sortableProps: SortableTransactionRootProps) => ReactNode
}

export interface SortableTransactionListProps {
  items: readonly SortableTransactionItem[]
  disabled?: boolean
  onMove: (activeId: string, overId: string) => void | Promise<void>
}

function isInteractiveDescendant(event: SyntheticEvent<HTMLElement>) {
  if (!(event.target instanceof Element) || event.target === event.currentTarget) return false
  return Boolean(event.target.closest(
    "button, a, input, select, textarea, [contenteditable='true'], [data-no-drag]",
  ))
}

function SortableTransaction({
  item,
  disabled,
  shouldSuppressClick,
}: {
  item: SortableTransactionItem
  disabled: boolean
  shouldSuppressClick: () => boolean
}) {
  const {
    attributes,
    listeners,
    isDragging,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id, disabled })

  const guardedListeners = disabled ? {} : Object.fromEntries(
    Object.entries(listeners ?? {}).map(([eventName, listener]) => [
      eventName,
      (event: SyntheticEvent<HTMLElement>) => {
        if (isInteractiveDescendant(event)) return
        ;(listener as (event: SyntheticEvent<HTMLElement>) => void)(event)
      },
    ]),
  ) as HTMLAttributes<HTMLElement>

  const scaledTransform = transform && isDragging
    ? { ...transform, scaleX: 1.015, scaleY: 1.015 }
    : transform
  const style = disabled ? {} : {
    transform: CSS.Transform.toString(scaledTransform),
    transition,
    position: "relative",
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.88 : undefined,
    boxShadow: isDragging ? "0 14px 30px rgba(15, 23, 42, 0.2)" : undefined,
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
  } satisfies CSSProperties & { WebkitTouchCallout: string }

  return item.render({
    ...(disabled ? {} : attributes),
    ...guardedListeners,
    ref: setNodeRef,
    style,
    "data-sortable-id": item.id,
    "data-sortable-dragging": isDragging ? "true" : "false",
    onClickCapture: (event) => {
      if (!shouldSuppressClick()) return
      event.preventDefault()
      event.stopPropagation()
    },
  })
}

/**
 * Invisible whole-row sorting affordance. A mouse drag starts after six pixels;
 * touch requires a stationary 400 ms hold and cancels after eight pixels so a
 * normal vertical swipe keeps scrolling the page. Interactive descendants are
 * excluded from drag activation.
 */
export function SortableTransactionList({
  items,
  disabled = false,
  onMove,
}: SortableTransactionListProps) {
  const suppressClickRef = useRef(false)
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Tab],
      },
    }),
  )

  useEffect(() => () => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current)
  }, [])

  const beginSuppressingClick = () => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current)
    suppressClickRef.current = true
  }

  const releaseClickSuppression = () => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false
      releaseTimerRef.current = null
    }, 300)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (overId && activeId !== overId) void onMove(activeId, overId)
    releaseClickSuppression()
  }

  const handleDragCancel = () => {
    releaseClickSuppression()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={beginSuppressingClick}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <SortableTransaction
            key={item.id}
            item={item}
            disabled={disabled}
            shouldSuppressClick={() => suppressClickRef.current}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}
