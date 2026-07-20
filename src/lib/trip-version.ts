import { createHash } from "node:crypto"

export interface TripVersionInput {
  updatedAt: Date | string
  timelineOrder: unknown
  expenses: {
    id: string
    createdAt: Date | string
    updatedAt: Date | string
  }[]
  deposits: {
    id: string
    amount: number
    currency: string
    note: string | null
    date: Date | string
    createdAt: Date | string
  }[]
  cashWallets?: {
    id: string
    balance: number
    updatedAt: Date | string
  }[]
  cashExchanges?: {
    id: string
    type: string
    foreignCurrency: string
    foreignAmount: number
    baseAmount: number
    exchangeRate: number
    date: Date | string
    note: string | null
    createdAt: Date | string
  }[]
}

export function createTripVersion(input: TripVersionInput) {
  const normalized = {
    updatedAt: input.updatedAt,
    timelineOrder: input.timelineOrder,
    expenses: [...input.expenses].sort((left, right) => left.id.localeCompare(right.id)),
    deposits: [...input.deposits].sort((left, right) => left.id.localeCompare(right.id)),
    cashWallets: [...(input.cashWallets ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    cashExchanges: [...(input.cashExchanges ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
  }

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("base64url")
}
