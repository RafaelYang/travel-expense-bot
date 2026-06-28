/**
 * 國家→幣種對照表
 * 用於建立行程時選擇目的地國家，自動推算可用幣種
 */

export interface Country {
  code: string    // ISO 3166-1 alpha-2
  name: string    // 中文名
  nameEn: string  // 英文名
  flag: string    // emoji 國旗
  currency: string // 該國主要幣種代碼
}

/**
 * 常見旅遊目的地國家清單
 * 依區域分類，方便 UI 顯示
 */
export const COUNTRIES: Country[] = [
  // === 東亞 ===
  { code: 'JP', name: '日本', nameEn: 'Japan', flag: '🇯🇵', currency: 'JPY' },
  { code: 'KR', name: '韓國', nameEn: 'South Korea', flag: '🇰🇷', currency: 'KRW' },
  { code: 'CN', name: '中國', nameEn: 'China', flag: '🇨🇳', currency: 'CNY' },
  { code: 'HK', name: '香港', nameEn: 'Hong Kong', flag: '🇭🇰', currency: 'HKD' },
  { code: 'MO', name: '澳門', nameEn: 'Macau', flag: '🇲🇴', currency: 'MOP' },

  // === 東南亞 ===
  { code: 'TH', name: '泰國', nameEn: 'Thailand', flag: '🇹🇭', currency: 'THB' },
  { code: 'VN', name: '越南', nameEn: 'Vietnam', flag: '🇻🇳', currency: 'VND' },
  { code: 'SG', name: '新加坡', nameEn: 'Singapore', flag: '🇸🇬', currency: 'SGD' },
  { code: 'MY', name: '馬來西亞', nameEn: 'Malaysia', flag: '🇲🇾', currency: 'MYR' },
  { code: 'PH', name: '菲律賓', nameEn: 'Philippines', flag: '🇵🇭', currency: 'PHP' },
  { code: 'ID', name: '印尼', nameEn: 'Indonesia', flag: '🇮🇩', currency: 'IDR' },

  // === 歐洲（歐元區）===
  { code: 'AT', name: '奧地利', nameEn: 'Austria', flag: '🇦🇹', currency: 'EUR' },
  { code: 'FR', name: '法國', nameEn: 'France', flag: '🇫🇷', currency: 'EUR' },
  { code: 'DE', name: '德國', nameEn: 'Germany', flag: '🇩🇪', currency: 'EUR' },
  { code: 'IT', name: '義大利', nameEn: 'Italy', flag: '🇮🇹', currency: 'EUR' },
  { code: 'ES', name: '西班牙', nameEn: 'Spain', flag: '🇪🇸', currency: 'EUR' },
  { code: 'NL', name: '荷蘭', nameEn: 'Netherlands', flag: '🇳🇱', currency: 'EUR' },
  { code: 'PT', name: '葡萄牙', nameEn: 'Portugal', flag: '🇵🇹', currency: 'EUR' },
  { code: 'GR', name: '希臘', nameEn: 'Greece', flag: '🇬🇷', currency: 'EUR' },
  { code: 'FI', name: '芬蘭', nameEn: 'Finland', flag: '🇫🇮', currency: 'EUR' },
  { code: 'IE', name: '愛爾蘭', nameEn: 'Ireland', flag: '🇮🇪', currency: 'EUR' },
  { code: 'BE', name: '比利時', nameEn: 'Belgium', flag: '🇧🇪', currency: 'EUR' },
  { code: 'HR', name: '克羅埃西亞', nameEn: 'Croatia', flag: '🇭🇷', currency: 'EUR' },
  { code: 'SK', name: '斯洛伐克', nameEn: 'Slovakia', flag: '🇸🇰', currency: 'EUR' },
  { code: 'SI', name: '斯洛維尼亞', nameEn: 'Slovenia', flag: '🇸🇮', currency: 'EUR' },
  { code: 'EE', name: '愛沙尼亞', nameEn: 'Estonia', flag: '🇪🇪', currency: 'EUR' },
  { code: 'LV', name: '拉脫維亞', nameEn: 'Latvia', flag: '🇱🇻', currency: 'EUR' },
  { code: 'LT', name: '立陶宛', nameEn: 'Lithuania', flag: '🇱🇹', currency: 'EUR' },

  // === 歐洲（非歐元區）===
  { code: 'GB', name: '英國', nameEn: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
  { code: 'CZ', name: '捷克', nameEn: 'Czech Republic', flag: '🇨🇿', currency: 'CZK' },
  { code: 'HU', name: '匈牙利', nameEn: 'Hungary', flag: '🇭🇺', currency: 'HUF' },
  { code: 'PL', name: '波蘭', nameEn: 'Poland', flag: '🇵🇱', currency: 'PLN' },
  { code: 'CH', name: '瑞士', nameEn: 'Switzerland', flag: '🇨🇭', currency: 'CHF' },
  { code: 'SE', name: '瑞典', nameEn: 'Sweden', flag: '🇸🇪', currency: 'SEK' },
  { code: 'NO', name: '挪威', nameEn: 'Norway', flag: '🇳🇴', currency: 'NOK' },
  { code: 'DK', name: '丹麥', nameEn: 'Denmark', flag: '🇩🇰', currency: 'DKK' },
  { code: 'IS', name: '冰島', nameEn: 'Iceland', flag: '🇮🇸', currency: 'ISK' },
  { code: 'TR', name: '土耳其', nameEn: 'Turkey', flag: '🇹🇷', currency: 'TRY' },
  { code: 'RO', name: '羅馬尼亞', nameEn: 'Romania', flag: '🇷🇴', currency: 'RON' },
  { code: 'BG', name: '保加利亞', nameEn: 'Bulgaria', flag: '🇧🇬', currency: 'BGN' },
  { code: 'RS', name: '塞爾維亞', nameEn: 'Serbia', flag: '🇷🇸', currency: 'RSD' },

  // === 大洋洲 ===
  { code: 'AU', name: '澳洲', nameEn: 'Australia', flag: '🇦🇺', currency: 'AUD' },
  { code: 'NZ', name: '紐西蘭', nameEn: 'New Zealand', flag: '🇳🇿', currency: 'NZD' },

  // === 美洲 ===
  { code: 'US', name: '美國', nameEn: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'CA', name: '加拿大', nameEn: 'Canada', flag: '🇨🇦', currency: 'CAD' },
  { code: 'MX', name: '墨西哥', nameEn: 'Mexico', flag: '🇲🇽', currency: 'MXN' },
]

/**
 * 根據國家代碼取得國家資訊
 */
export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code)
}

/**
 * 根據行程的國家列表，取得不重複的幣種清單
 * 例如：['AT', 'CZ', 'HU'] → ['EUR', 'CZK', 'HUF']
 */
export function getCurrenciesFromCountries(countryCodes: string[]): string[] {
  const currencies = new Set<string>()
  for (const code of countryCodes) {
    const country = getCountryByCode(code)
    if (country) currencies.add(country.currency)
  }
  return Array.from(currencies)
}

/**
 * 所有幣種（含 CURRENCIES 沒列的新幣種）
 * 用來確保記帳時的幣種下拉包含所有可能的幣種
 */
export const ALL_CURRENCIES: Record<string, { label: string; symbol: string; nameCn: string }> = {
  TWD: { label: 'TWD 新台幣', symbol: 'NT$', nameCn: '新台幣' },
  JPY: { label: 'JPY 日圓', symbol: '¥', nameCn: '日圓' },
  KRW: { label: 'KRW 韓圜', symbol: '₩', nameCn: '韓圜' },
  USD: { label: 'USD 美元', symbol: '$', nameCn: '美元' },
  EUR: { label: 'EUR 歐元', symbol: '€', nameCn: '歐元' },
  GBP: { label: 'GBP 英鎊', symbol: '£', nameCn: '英鎊' },
  THB: { label: 'THB 泰銖', symbol: '฿', nameCn: '泰銖' },
  VND: { label: 'VND 越南盾', symbol: '₫', nameCn: '盾' },
  SGD: { label: 'SGD 新加坡幣', symbol: 'S$', nameCn: '星幣' },
  HKD: { label: 'HKD 港幣', symbol: 'HK$', nameCn: '港幣' },
  CNY: { label: 'CNY 人民幣', symbol: '¥', nameCn: '人民幣' },
  AUD: { label: 'AUD 澳幣', symbol: 'A$', nameCn: '澳幣' },
  MYR: { label: 'MYR 馬幣', symbol: 'RM', nameCn: '馬幣' },
  PHP: { label: 'PHP 菲律賓披索', symbol: '₱', nameCn: '披索' },
  CZK: { label: 'CZK 捷克克朗', symbol: 'Kč', nameCn: '克朗' },
  HUF: { label: 'HUF 匈牙利福林', symbol: 'Ft', nameCn: '福林' },
  PLN: { label: 'PLN 波蘭茲羅提', symbol: 'zł', nameCn: '茲羅提' },
  CHF: { label: 'CHF 瑞士法郎', symbol: 'Fr.', nameCn: '法郎' },
  SEK: { label: 'SEK 瑞典克朗', symbol: 'kr', nameCn: '克朗' },
  NOK: { label: 'NOK 挪威克朗', symbol: 'kr', nameCn: '克朗' },
  DKK: { label: 'DKK 丹麥克朗', symbol: 'kr', nameCn: '克朗' },
  ISK: { label: 'ISK 冰島克朗', symbol: 'kr', nameCn: '克朗' },
  TRY: { label: 'TRY 土耳其里拉', symbol: '₺', nameCn: '里拉' },
  IDR: { label: 'IDR 印尼盾', symbol: 'Rp', nameCn: '盾' },
  CAD: { label: 'CAD 加幣', symbol: 'C$', nameCn: '加幣' },
  NZD: { label: 'NZD 紐幣', symbol: 'NZ$', nameCn: '紐幣' },
  MXN: { label: 'MXN 墨西哥披索', symbol: 'Mex$', nameCn: '披索' },
  MOP: { label: 'MOP 澳門幣', symbol: 'MOP$', nameCn: '澳門幣' },
  RON: { label: 'RON 羅馬尼亞列伊', symbol: 'lei', nameCn: '列伊' },
  BGN: { label: 'BGN 保加利亞列弗', symbol: 'лв', nameCn: '列弗' },
  RSD: { label: 'RSD 塞爾維亞第納爾', symbol: 'din.', nameCn: '第納爾' },
}

/**
 * 取得幣種 chip 顯示文字
 * 例如：getCurrencyChipLabel('EUR', ['AT','CZ','HU']) → '歐元(奧地利)'
 * 例如：getCurrencyChipLabel('CZK', ['AT','CZ','HU']) → '克朗(捷克)'
 */
export function getCurrencyChipLabel(currencyCode: string, countryCodes: string[], locale: string = 'zh-TW'): string {
  const info = ALL_CURRENCIES[currencyCode]
  const name = locale === 'en' ? currencyCode : (info?.nameCn || currencyCode)
  // 找出用這個幣種的國家
  const matchingCountry = COUNTRIES.find(
    c => c.currency === currencyCode && countryCodes.includes(c.code)
  )
  if (matchingCountry) {
    const countryName = locale === 'en' ? (matchingCountry.nameEn || matchingCountry.name) : matchingCountry.name
    return `${name} (${countryName})`
  }
  return name
}

/**
 * 國家→城市風景封面照片
 * 使用 Unsplash 免費圖片（加上 w=800&q=80 壓縮）
 */
const COUNTRY_COVER_IMAGES: Record<string, string> = {
  // 東亞
  JP: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80',
  KR: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800&q=80',
  CN: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&q=80',
  HK: 'https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=800&q=80',
  MO: 'https://images.unsplash.com/photo-1552912867-69c07ba0e9a8?w=800&q=80',

  // 東南亞
  TH: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=800&q=80',
  VN: 'https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800&q=80',
  SG: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80',
  MY: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80',
  PH: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=800&q=80',
  ID: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80',

  // 歐洲
  AT: 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=800&q=80',
  FR: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80',
  DE: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&q=80',
  IT: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80',
  ES: 'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=800&q=80',
  NL: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80',
  PT: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80',
  GR: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80',
  GB: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80',
  CZ: 'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=800&q=80',
  HU: 'https://images.unsplash.com/photo-1551867633-194f125bddfa?w=800&q=80',
  PL: 'https://images.unsplash.com/photo-1519197924294-4ba991a11128?w=800&q=80',
  CH: 'https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?w=800&q=80',
  SE: 'https://images.unsplash.com/photo-1509356843151-3e7d96241e11?w=800&q=80',
  NO: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&q=80',
  DK: 'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800&q=80',
  IS: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&q=80',
  TR: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=800&q=80',
  HR: 'https://images.unsplash.com/photo-1555990538-1e15faca6782?w=800&q=80',
  FI: 'https://images.unsplash.com/photo-1538332576228-eb5b4c4de6f5?w=800&q=80',

  // 大洋洲
  AU: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&q=80',
  NZ: 'https://images.unsplash.com/photo-1469521669194-babb45599def?w=800&q=80',

  // 美洲
  US: 'https://images.unsplash.com/photo-1485738422979-f5c462d49f04?w=800&q=80',
  CA: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&q=80',
  MX: 'https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=800&q=80',
}

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80'

/**
 * 根據行程的國家代碼取得封面圖片 URL
 */
export function getCountryCoverImage(countryCodes: string[]): string {
  for (const code of countryCodes) {
    if (COUNTRY_COVER_IMAGES[code]) {
      return COUNTRY_COVER_IMAGES[code]
    }
  }
  return DEFAULT_COVER
}

/**
 * 取得國家旗幟 emoji 列表
 */
export function getCountryFlags(countryCodes: string[]): string {
  return countryCodes
    .map(code => COUNTRIES.find(c => c.code === code)?.flag || '')
    .filter(Boolean)
    .join(' ')
}
