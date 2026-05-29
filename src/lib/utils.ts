/**
 * 共用工具函式
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Tailwind class 合併工具
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化金額（含千分位）
export function formatCurrency(amount: number, currency: string = 'TWD'): string {
  const formatter = new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === 'JPY' || currency === 'KRW' || currency === 'VND' ? 0 : 2,
  })
  return formatter.format(amount)
}

// 格式化百分比
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

// 產生隨機英數字碼
export function generateCode(length: number = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 花費分類定義
export const EXPENSE_CATEGORIES = [
  { value: 'food', label: '🍜 餐飲', color: '#f97316' },
  { value: 'transport', label: '🚃 交通', color: '#3b82f6' },
  { value: 'accommodation', label: '🛏️ 住宿', color: '#8b5cf6' },
  { value: 'shopping', label: '🛍️ 購物', color: '#ec4899' },
  { value: 'ticket', label: '🎫 門票', color: '#14b8a6' },
  { value: 'other', label: '📦 其他', color: '#6b7280' },
] as const

// 取得分類資訊
export function getCategoryInfo(value: string) {
  return EXPENSE_CATEGORIES.find(c => c.value === value) || EXPENSE_CATEGORIES[5]
}

// 支援的幣種
export const CURRENCIES = [
  { value: 'TWD', label: '🇹🇼 TWD 新台幣', symbol: 'NT$' },
  { value: 'JPY', label: '🇯🇵 JPY 日圓', symbol: '¥' },
  { value: 'KRW', label: '🇰🇷 KRW 韓圜', symbol: '₩' },
  { value: 'USD', label: '🇺🇸 USD 美元', symbol: '$' },
  { value: 'EUR', label: '🇪🇺 EUR 歐元', symbol: '€' },
  { value: 'THB', label: '🇹🇭 THB 泰銖', symbol: '฿' },
  { value: 'VND', label: '🇻🇳 VND 越南盾', symbol: '₫' },
  { value: 'SGD', label: '🇸🇬 SGD 新加坡幣', symbol: 'S$' },
  { value: 'HKD', label: '🇭🇰 HKD 港幣', symbol: 'HK$' },
  { value: 'CNY', label: '🇨🇳 CNY 人民幣', symbol: '¥' },
  { value: 'GBP', label: '🇬🇧 GBP 英鎊', symbol: '£' },
  { value: 'AUD', label: '🇦🇺 AUD 澳幣', symbol: 'A$' },
  { value: 'MYR', label: '🇲🇾 MYR 馬幣', symbol: 'RM' },
  { value: 'PHP', label: '🇵🇭 PHP 菲律賓披索', symbol: '₱' },
] as const

// 取得幣種符號
export function getCurrencySymbol(currency: string): string {
  return CURRENCIES.find(c => c.value === currency)?.symbol || currency
}

// 行程狀態定義
export const TRIP_STATUS = {
  planning: { label: '📋 規劃中', color: '#6b7280' },
  active: { label: '✈️ 進行中', color: '#22c55e' },
  completed: { label: '✅ 已結束', color: '#3b82f6' },
} as const
