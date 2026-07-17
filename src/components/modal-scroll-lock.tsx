"use client"

import type { ReactNode } from "react"
import { RemoveScroll } from "react-remove-scroll"

export function ModalScrollLock({ children }: { children: ReactNode }) {
  return <RemoveScroll allowPinchZoom>{children}</RemoveScroll>
}
