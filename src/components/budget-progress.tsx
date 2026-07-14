/**
 * 預算進度條元件 — 核心動畫元件
 * 
 * 特效：
 * 1. 進度條從 0% 動畫填充到當前比例
 * 2. 金額「數字跳動」效果
 * 3. 超過 80% 變橘色，超過 95% 變紅色
 * 4. 光澤流動動畫
 */
"use client"

import { useEffect, useRef, useState } from "react"
import { formatCurrency, formatPercent, getCurrencySymbol } from "@/lib/utils"
import { useLanguage } from "./language-provider"

interface BudgetProgressProps {
  totalBudget: number
  totalSpent: number
  currency: string
  showLabels?: boolean
  size?: "sm" | "md" | "lg"
}

// 數字跳動 Hook
function useCountUp(target: number, duration: number = 1500, enabled: boolean = true) {
  const [value, setValue] = useState(0)
  const startTime = useRef<number | null>(null)
  const animationFrame = useRef<number>(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    if (!enabled) {
      prevTarget.current = target
      return
    }

    const startValue = prevTarget.current
    prevTarget.current = target
    startTime.current = null

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp
      const elapsed = timestamp - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      
      // easeOutExpo 動畫曲線
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      const current = startValue + (target - startValue) * eased
      
      setValue(current)
      
      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(animate)
      }
    }

    animationFrame.current = requestAnimationFrame(animate)
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current)
    }
  }, [target, duration, enabled])

  return enabled ? value : target
}

export function BudgetProgress({ totalBudget, totalSpent, currency, showLabels = true, size = "md" }: BudgetProgressProps) {
  const [mounted, setMounted] = useState(false)
  const { t } = useLanguage()
  
  useEffect(() => {
    // 延遲觸發動畫，讓用戶看到從 0 開始
    const timer = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const spentPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const remaining = totalBudget - totalSpent
  const remainingPercent = 100 - spentPercent

  // 數字跳動效果
  const animatedSpent = useCountUp(totalSpent, 1500, mounted)
  const animatedRemaining = useCountUp(remaining, 1500, mounted)
  const animatedPercent = useCountUp(spentPercent, 1500, mounted)

  // 決定顏色狀態
  const getStatus = () => {
    if (spentPercent >= 95) return 'danger'
    if (spentPercent >= 80) return 'warning'
    return 'normal'
  }
  const status = getStatus()

  const barHeight = size === 'sm' ? '16px' : size === 'lg' ? '32px' : '24px'
  const fontSize = size === 'sm' ? '0.75rem' : size === 'lg' ? '1.125rem' : '0.875rem'
  const bigFontSize = size === 'sm' ? '1.25rem' : size === 'lg' ? '2.5rem' : '1.75rem'

  return (
    <div style={{ width: '100%' }}>
      {showLabels && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '0.75rem',
        }}>
          {/* 已花費 */}
          <div>
            <div style={{ fontSize, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              {t('budget.spent')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
              <span className="countup" style={{
                fontSize: bigFontSize,
                fontWeight: 800,
                color: status === 'danger' ? 'var(--color-danger)' : status === 'warning' ? 'var(--color-warning)' : 'var(--color-primary-light)',
                letterSpacing: '-0.02em',
              }}>
                {getCurrencySymbol(currency)}{Math.round(animatedSpent).toLocaleString()}
              </span>
              <span style={{
                fontSize,
                color: 'var(--text-muted)',
                fontWeight: 500,
              }}>
                ({formatPercent(animatedPercent)})
              </span>
            </div>
          </div>

          {/* 剩餘 */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              {t('budget.remaining')}
            </div>
            <div className="countup" style={{
              fontSize: bigFontSize,
              fontWeight: 700,
              color: remaining >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              letterSpacing: '-0.02em',
            }}>
              {getCurrencySymbol(currency)}{Math.round(animatedRemaining).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* 進度條 */}
      <div className="budget-bar" style={{ height: barHeight }}>
        <div
          className={`budget-bar-fill ${status}`}
          style={{
            width: mounted ? `${Math.min(spentPercent, 100)}%` : '0%',
          }}
        />
      </div>

      {showLabels && totalBudget > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          <span>{t('budget.total')} {formatCurrency(totalBudget, currency)}</span>
          <span>{t('budget.remaining')} {formatPercent(remainingPercent)}</span>
        </div>
      )}
    </div>
  )
}
