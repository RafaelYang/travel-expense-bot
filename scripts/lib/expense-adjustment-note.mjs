const serviceFeeSegment = /^國外交易(?:服務費|手續費)\s*(?:(?:NT|TWD)\s*)?[$＄]\s*([0-9]+(?:\.[0-9]+)?)\s*$/iu

export function parseExpenseAdjustmentNote(note) {
  if (typeof note !== "string" || note.trim() === "") return null

  const retainedSegments = []
  const serviceFees = []
  for (const rawSegment of note.split("/")) {
    const segment = rawSegment.trim()
    const match = segment.match(serviceFeeSegment)
    if (!match) {
      if (segment) retainedSegments.push(segment)
      continue
    }

    const serviceFee = Number(match[1])
    if (!Number.isFinite(serviceFee) || serviceFee <= 0) return null
    serviceFees.push(serviceFee)
  }

  if (serviceFees.length !== 1) return null
  return {
    serviceFee: serviceFees[0],
    note: retainedSegments.length > 0 ? retainedSegments.join("/") : null,
  }
}

export function buildExpenseAdjustmentNoteMigration(row) {
  const parsed = parseExpenseAdjustmentNote(row.note)
  if (!parsed) {
    throw new Error(`Expense ${row.id} has an unsupported adjustment note`)
  }
  if (row.paymentMethod !== "card") {
    throw new Error(`Expense ${row.id} is not a card expense`)
  }
  if (row.serviceFee !== 0 || row.shopbackReward !== 0 || row.creditCardReward !== 0) {
    throw new Error(`Expense ${row.id} already has adjustment values`)
  }

  const baseCurrency = row.baseCurrency.toUpperCase()
  const currency = row.currency.toUpperCase()
  const after = {
    amount: row.amount,
    convertedAmount: row.convertedAmount,
    settledAmount: row.settledAmount,
    note: parsed.note,
    serviceFee: parsed.serviceFee,
  }
  let beforeNetAmount

  if (currency === baseCurrency) {
    if (!(row.amount > parsed.serviceFee)) {
      throw new Error(`Expense ${row.id} amount is not greater than its service fee`)
    }
    beforeNetAmount = row.amount
    after.amount = row.amount - parsed.serviceFee
    if (row.convertedAmount !== null && row.convertedAmount !== undefined) {
      if (Math.abs(row.convertedAmount - row.amount) > 0.000001) {
        throw new Error(`Expense ${row.id} has an unexpected base-currency conversion`)
      }
      after.convertedAmount = row.convertedAmount - parsed.serviceFee
    }
  } else {
    if (
      !row.reconciledAt
      || row.settledAmount === null
      || row.settledAmount === undefined
      || !(row.settledAmount > parsed.serviceFee)
    ) {
      throw new Error(`Expense ${row.id} needs a reconciled settlement greater than its service fee`)
    }
    beforeNetAmount = row.settledAmount
    after.settledAmount = row.settledAmount - parsed.serviceFee
  }

  const afterNetAmount = (
    currency === baseCurrency ? after.amount : after.settledAmount
  ) + after.serviceFee
  if (Math.abs(beforeNetAmount - afterNetAmount) > 0.000001) {
    throw new Error(`Expense ${row.id} would change its net amount`)
  }

  return { after, beforeNetAmount, afterNetAmount }
}
