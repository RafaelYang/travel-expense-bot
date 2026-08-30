export interface TripSettingsDraft {
  name: string
  description: string
  startDate: string
  endDate: string
  baseCurrency: string
  expenseAdjustmentsEnabled: boolean
  coverImage: string
  countriesList: readonly string[]
  dailyCountries: readonly string[]
}

function equalStringArrays(
  left: readonly string[],
  right: readonly string[],
) {
  return left.length === right.length
    && left.every((value, index) => value === right[index])
}

/**
 * A missing baseline means the initial trip request has not finished yet, so it
 * must never be treated as a user edit.
 */
export function isTripSettingsDraftDirty(
  saved: TripSettingsDraft | null,
  current: TripSettingsDraft,
) {
  if (!saved) return false

  return saved.name !== current.name
    || saved.description !== current.description
    || saved.startDate !== current.startDate
    || saved.endDate !== current.endDate
    || saved.baseCurrency !== current.baseCurrency
    || saved.expenseAdjustmentsEnabled !== current.expenseAdjustmentsEnabled
    || saved.coverImage !== current.coverImage
    || !equalStringArrays(saved.countriesList, current.countriesList)
    || !equalStringArrays(saved.dailyCountries, current.dailyCountries)
}
