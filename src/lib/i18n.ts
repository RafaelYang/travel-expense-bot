/**
 * 多語系翻譯字典
 * 支援：zh-TW（繁體中文）、en（English）
 */

export type Locale = 'zh-TW' | 'en'

export const translations: Record<Locale, Record<string, string>> = {
  'zh-TW': {
    // 品牌
    'brand.name': '小銘子旅行用記帳',
    'brand.name.short': '小銘子記帳',

    // 導覽
    'nav.trips': '行程總覽',
    'nav.newTrip': '新增行程',
    'nav.settings': '設定',

    // 下拉選單
    'menu.theme': '外觀主題',
    'menu.theme.light': '淺色',
    'menu.theme.dark': '深色',
    'menu.theme.system': '系統',
    'menu.language': '語言',
    'menu.logout': '登出帳號',
    'menu.currency': '偏好幣種',
    'menu.user.fallback': '使用者',
    'menu.lineLink': 'LINE 記帳連動',
    'menu.lineLink.linked': 'LINE 已連結',
    'menu.lineLink.activeTrip': '預設：{tripName}',
    'menu.lineLink.notLinked': '連結 LINE 帳號',

    // 首頁
    'home.greeting': '哈囉，{name} 👋',
    'home.subtitle': '準備好記錄下一趟旅程了嗎？',
    'home.newTrip': '新增行程',
    'home.newTrip.desc': '建立新的旅行記帳',
    'home.inviteCode': '輸入邀請碼',
    'home.join': '加入',
    'home.join.error': '加入失敗',
    'home.empty': '還沒有行程呢',
    'home.empty.desc': '建立一個行程，或是用邀請碼加入朋友的行程吧！',
    'home.createFirst': '建立第一個行程',
    'home.budget': '預算',
    'home.spent': '已花費',
    'home.members': '{count} 位成員',
    'home.section.active': '進行中',
    'home.section.all': '所有行程',
    'home.card.people': '{count} 人',
    'home.card.expenses': '{count} 筆記錄',
    'home.card.detail': '查看詳情',

    // 登入頁
    'login.title': '小銘子記帳',
    'login.desc': '跟朋友一起記錄旅途花費',
    'login.desc2': '支援 LINE 機器人自動記帳',
    'login.google': '使用 Google 帳號登入',
    'login.line': '使用 LINE 帳號登入',
    'login.or': '或',
    'login.tip': '建議先用 {google} 登入',
    'login.tip.google': 'Google 帳號',
    'login.tip2': '再用 LINE 登入即可自動綁定推播通知',

    // 新增行程
    'newTrip.title': '建立新行程',
    'newTrip.subtitle': '填寫旅行基本資訊',
    'newTrip.name': '行程名稱',
    'newTrip.name.placeholder': '例如：日本東京五日遊',
    'newTrip.description': '描述',
    'newTrip.description.placeholder': '行程簡介（選填）',
    'newTrip.countries': '🌍 目的地國家',
    'newTrip.countries.search': '搜尋國家名稱...',
    'newTrip.countries.empty': '找不到符合的國家',
    'newTrip.budget': '預算金額',
    'newTrip.currency': '幣別',
    'newTrip.baseCurrency': '💱 基準幣種（所有花費統一換算用）',
    'newTrip.baseCurrency.hint': '出發地的貨幣，用來計算總花費',
    'newTrip.startDate': '開始日期',
    'newTrip.endDate': '結束日期',
    'newTrip.create': '建立行程',
    'newTrip.creating': '建立中...',
    'newTrip.error': '建立失敗',
    'newTrip.error.retry': '建立失敗，請稍後再試',
    'newTrip.back': '返回行程列表',

    // 行程內頁
    'trip.back': '返回',
    'trip.settings': '設定',
    'trip.addExpense': '記帳',
    'trip.today': '📅 今日花費',
    'trip.dailySpendTrend': '📈 每日花費趨勢',
    'trip.categories': '📊 花費分類',
    'trip.allExpenses': '💰 所有花費（{count} 筆）',
    'trip.allExpenses.count': '{count}筆',
    'trip.collapse': '收起',
    'trip.showAll': '顯示全部 {count} 筆',
    'trip.members': '👥 成員',
    'trip.role.owner': '擁有者',
    'trip.role.viewer': '檢視者',
    'trip.role.member': '成員',
    'trip.day': 'Day {current} / {total}',
    'trip.avgDaily': '💡 平均每日',
    'trip.burnRate': '按此速度剩 {days} 天',
    'trip.days': '天',
    'trip.invite': '邀請朋友加入',
    'trip.invite.gmailPlaceholder': '輸入帳號',

    // 記帳表單
    'form.tab.expense': '✏️ 支出',
    'form.tab.income': '💰 收入',
    'form.item.placeholder': '項目名稱',
    'form.note.placeholder': '備註（例：換匯）',
    'form.amount': '金額',
    'form.submit.expense': '新增花費',
    'form.submit.income': '收入',
    'form.currency': '💱 幣種',
    'form.currency.other': '其他幣種...',
    'form.note': '備註（選填）',
    'form.converting': '換算中...',
    'form.rateUpdate': '💱 匯率更新：{time}（UTC+8）',

    // 行程設定頁
    'settings.back': '返回行程',
    'settings.title': '行程設定',
    'settings.invite': '邀請碼',
    'settings.invite.desc': '產生邀請碼分享給朋友，讓他們加入這個行程。',
    'settings.invite.generate': '產生邀請碼',
    'settings.invite.copied': '已複製',
    'settings.invite.copy': '複製',
    'settings.basic': '✏️ 基本設定',
    'settings.tripName': '行程名稱',
    'settings.startDate': '出發日期',
    'settings.endDate': '回程日期',
    'settings.coverImage': '行程封面照',
    'settings.coverImage.custom': '自訂封面',
    'settings.coverImage.default': '預設目的地封面',
    'settings.coverImage.placeholder': '請輸入自訂圖片 URL (例如 https://...)',
    'settings.coverImage.orSelect': '或點擊下方精選照片快速套用：',
    'settings.coverImage.upload': '上傳封面照片 📤',
    'settings.coverImage.uploading': '上傳中...',
    'settings.save': '儲存設定',
    'settings.danger': '危險區域',
    'settings.danger.desc': '刪除行程後所有花費記錄將無法復原。',
    'settings.delete': '刪除行程',
    'settings.delete.confirm': '確定刪除',
    'settings.delete.cancel': '取消',

    // Email 邀請
    'settings.emailInvite': '📧 Email 邀請',
    'settings.emailInvite.desc': '輸入對方的 Email，系統會寄送邀請信，對方點連結即可加入。',
    'settings.emailInvite.placeholder': '對方的 Email',
    'settings.emailInvite.send': '發送邀請',
    'settings.emailInvite.sending': '寄送中...',
    'settings.emailInvite.sent': '✅ 邀請已寄出！',
    'settings.emailInvite.error': '寄送失敗',

    // LINE 連動
    'settings.lineLink': '💬 LINE 快速記帳',
    'settings.lineLink.desc': '將您的 LINE 帳號與此平台進行綁定，綁定後您將可以在 LINE 直接快速記帳',
    'settings.lineLink.generate': '取得個人帳號連動碼',
    'settings.lineLink.step1': '1. 請先加入官方 LINE 機器人帳號為好友。',
    'settings.lineLink.step2': '2. 在 LINE 對話框輸入以下綁定指令（限時 15 分鐘）：',
    'settings.lineLink.step3': '3. 綁定成功後，即可直接在 LINE 對話中輸入「品項 金額 (幣種)」進行快速記帳！',
    'settings.lineLink.user.linked': '✅ 您的帳號已成功連動 LINE (已取得 User ID)。',
    'settings.lineLink.status.title': '🧭 目前連動行程狀態',
    'settings.lineLink.status.active': '⭐ 本行程目前是您在 LINE 中的預設記帳行程。',
    'settings.lineLink.status.inactive': '⚠️ 本行程目前不是您的 LINE 預設記帳行程。',
    'settings.lineLink.status.activeDay': '（狀態：{dayText}）',
    'settings.lineLink.setAsDefault': '設為 LINE 預設記帳行程',
    'settings.lineLink.setAsDefault.success': '已成功將此行程設定為 LINE 預設記帳行程！',

    // 預算進度
    'budget.spent': '已花費',
    'budget.remaining': '剩餘',
    'budget.total': '預算',

    // 花費分類
    'cat.food': '🍜 餐飲',
    'cat.transport': '🚃 交通',
    'cat.accommodation': '🛏️ 住宿',
    'cat.shopping': '🛍️ 購物',
    'cat.ticket': '🎫 門票',
    'cat.other': '📦 其他',

    // 支出詳情
    'expense.detail.recordedBy': '記帳人',
    'expense.detail.time': '時間',
    'expense.detail.currency': '幣種',
    'expense.detail.note': '備註',
    'expense.detail.source': '來源',
    'expense.detail.source.line': '📱 LINE',
    'expense.detail.source.web': '🌐 網頁',

    // 網頁標題
    'meta.title': '小銘子旅行用記帳 — 旅遊記帳好幫手',
    'meta.description': '出門旅遊的記帳好夥伴，支援多人共用行程、即時預算追蹤、匯率轉換、LINE 機器人記帳',
  },

  'en': {
    // 品牌
    'brand.name': "Ming's Travel Expense",
    'brand.name.short': "Ming's Expense",

    // 導覽
    'nav.trips': 'Trips',
    'nav.newTrip': 'New Trip',
    'nav.settings': 'Settings',

    // 下拉選單
    'menu.theme': 'Theme',
    'menu.theme.light': 'Light',
    'menu.theme.dark': 'Dark',
    'menu.theme.system': 'System',
    'menu.language': 'Language',
    'menu.logout': 'Sign Out',
    'menu.currency': 'Currency',
    'menu.user.fallback': 'User',
    'menu.lineLink': 'LINE Link',
    'menu.lineLink.linked': 'LINE Linked',
    'menu.lineLink.activeTrip': 'Default: {tripName}',
    'menu.lineLink.notLinked': 'Link LINE Account',

    // 首頁
    'home.greeting': 'Hello, {name} 👋',
    'home.subtitle': 'Ready to track your next trip?',
    'home.newTrip': 'New Trip',
    'home.newTrip.desc': 'Create a new travel expense log',
    'home.inviteCode': 'Enter invite code',
    'home.join': 'Join',
    'home.join.error': 'Failed to join',
    'home.empty': 'No trips yet',
    'home.empty.desc': 'Create a trip or join one with an invite code!',
    'home.createFirst': 'Create Your First Trip',
    'home.budget': 'Budget',
    'home.spent': 'Spent',
    'home.members': '{count} members',
    'home.section.active': 'Active',
    'home.section.all': 'All Trips',
    'home.card.people': '{count}',
    'home.card.expenses': '{count} expenses',
    'home.card.detail': 'Details',

    // 登入頁
    'login.title': "Ming's Expense",
    'login.desc': 'Track travel expenses with friends',
    'login.desc2': 'LINE Bot auto-logging supported',
    'login.google': 'Sign in with Google',
    'login.line': 'Sign in with LINE',
    'login.or': 'or',
    'login.tip': 'Sign in with {google} first',
    'login.tip.google': 'Google',
    'login.tip2': 'Then use LINE to enable push notifications',

    // 新增行程
    'newTrip.title': 'Create New Trip',
    'newTrip.subtitle': 'Fill in trip details',
    'newTrip.name': 'Trip Name',
    'newTrip.name.placeholder': 'e.g. Tokyo 5-Day Trip',
    'newTrip.description': 'Description',
    'newTrip.description.placeholder': 'Brief description (optional)',
    'newTrip.countries': '🌍 Destination Countries',
    'newTrip.countries.search': 'Search countries...',
    'newTrip.countries.empty': 'No matching countries found',
    'newTrip.budget': 'Budget',
    'newTrip.currency': 'Currency',
    'newTrip.baseCurrency': '💱 Base Currency (for conversion)',
    'newTrip.baseCurrency.hint': 'Your home currency for total calculations',
    'newTrip.startDate': 'Start Date',
    'newTrip.endDate': 'End Date',
    'newTrip.create': 'Create Trip',
    'newTrip.creating': 'Creating...',
    'newTrip.error': 'Failed to create',
    'newTrip.error.retry': 'Failed to create. Please try again.',
    'newTrip.back': 'Back to trips',

    // 行程內頁
    'trip.back': 'Back',
    'trip.settings': 'Settings',
    'trip.addExpense': 'Add Expense',
    'trip.today': '📅 Today',
    'trip.dailySpendTrend': '📈 Daily Spend Trend',
    'trip.categories': '📊 Categories',
    'trip.allExpenses': '💰 All Expenses ({count})',
    'trip.allExpenses.count': '{count}',
    'trip.collapse': 'Collapse',
    'trip.showAll': 'Show all {count}',
    'trip.members': '👥 Members',
    'trip.role.owner': 'Owner',
    'trip.role.viewer': 'Viewer',
    'trip.role.member': 'Member',
    'trip.day': 'Day {current} / {total}',
    'trip.avgDaily': '💡 Avg. daily',
    'trip.burnRate': '{days} days left at this pace',
    'trip.days': 'days',
    'trip.invite': 'Invite friend',
    'trip.invite.gmailPlaceholder': 'username',

    // 記帳表單
    'form.tab.expense': '✏️ Expense',
    'form.tab.income': '💰 Income',
    'form.item.placeholder': 'Item name',
    'form.note.placeholder': 'Note (e.g. exchange)',
    'form.amount': 'Amount',
    'form.submit.expense': 'Add Expense',
    'form.submit.income': 'Income',
    'form.currency': '💱 Currency',
    'form.currency.other': 'More...',
    'form.note': 'Note (optional)',
    'form.converting': 'Converting...',
    'form.rateUpdate': '💱 Rate updated: {time} (UTC+8)',

    // 行程設定頁
    'settings.back': 'Back to trip',
    'settings.title': 'Trip Settings',
    'settings.invite': 'Invite Code',
    'settings.invite.desc': 'Generate an invite code to share with friends.',
    'settings.invite.generate': 'Generate Code',
    'settings.invite.copied': 'Copied',
    'settings.invite.copy': 'Copy',
    'settings.basic': '✏️ Basic Settings',
    'settings.tripName': 'Trip Name',
    'settings.startDate': 'Start Date',
    'settings.endDate': 'End Date',
    'settings.coverImage': 'Trip Cover Image',
    'settings.coverImage.custom': 'Custom Cover',
    'settings.coverImage.default': 'Default Destination Cover',
    'settings.coverImage.placeholder': 'Enter custom image URL (e.g., https://...)',
    'settings.coverImage.orSelect': 'Or click a featured photo below to apply:',
    'settings.coverImage.upload': 'Upload Cover Photo 📤',
    'settings.coverImage.uploading': 'Uploading...',
    'settings.save': 'Save Settings',
    'settings.danger': 'Danger Zone',
    'settings.danger.desc': 'Deleting a trip will permanently remove all expense records.',
    'settings.delete': 'Delete Trip',
    'settings.delete.confirm': 'Confirm Delete',
    'settings.delete.cancel': 'Cancel',

    // Email Invite
    'settings.emailInvite': '📧 Email Invite',
    'settings.emailInvite.desc': 'Enter their email to send an invitation. They can join by clicking the link.',
    'settings.emailInvite.placeholder': 'Their email address',
    'settings.emailInvite.send': 'Send',
    'settings.emailInvite.sending': 'Sending...',
    'settings.emailInvite.sent': '✅ Invitation sent!',
    'settings.emailInvite.error': 'Failed to send',

    // LINE Link
    'settings.lineLink': '💬 LINE Quick Logging',
    'settings.lineLink.desc': 'Link your LINE account with this platform. Once linked, you can log expenses directly in LINE by typing "item amount".',
    'settings.lineLink.generate': 'Get Account Link Code',
    'settings.lineLink.step1': '1. Add the official LINE Bot as a friend first.',
    'settings.lineLink.step2': '2. Send the following command in LINE (expires in 15 mins):',
    'settings.lineLink.step3': '3. Once linked, you can log expenses directly in LINE by typing "item amount (currency)"!',
    'settings.lineLink.user.linked': '✅ Your account is successfully linked to LINE (User ID bound).',
    'settings.lineLink.status.title': '🧭 Current Link Status',
    'settings.lineLink.status.active': '⭐ This trip is currently your default LINE logging destination.',
    'settings.lineLink.status.inactive': '⚠️ This trip is not your default LINE logging destination.',
    'settings.lineLink.status.activeDay': ' (Status: {dayText})',
    'settings.lineLink.setAsDefault': 'Set as Default LINE Destination',
    'settings.lineLink.setAsDefault.success': 'Successfully set this trip as your default LINE destination!',

    // 預算進度
    'budget.spent': 'Spent',
    'budget.remaining': 'Remaining',
    'budget.total': 'Budget',

    // 花費分類
    'cat.food': '🍜 Food',
    'cat.transport': '🚃 Transport',
    'cat.accommodation': '🛏️ Stay',
    'cat.shopping': '🛍️ Shopping',
    'cat.ticket': '🎫 Tickets',
    'cat.other': '📦 Other',

    // Expense Detail
    'expense.detail.recordedBy': 'Created By',
    'expense.detail.time': 'Time',
    'expense.detail.currency': 'Currency',
    'expense.detail.note': 'Note',
    'expense.detail.source': 'Source',
    'expense.detail.source.line': '📱 LINE',
    'expense.detail.source.web': '🌐 Web',

    // 網頁標題
    'meta.title': "Ming's Travel Expense — Your Trip Companion",
    'meta.description': 'Track travel expenses with friends. Multi-user trips, real-time budgets, currency conversion, and LINE Bot logging.',
  },
}

/**
 * 帶參數的翻譯：用 {key} 佔位
 */
export function interpolate(text: string, params?: Record<string, string>): string {
  if (!params) return text
  return Object.entries(params).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    text
  )
}
