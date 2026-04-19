export const APP_ID = "default-finance-app";

export const STORAGE_KEYS = {
  txs: "fin_v6_txs",
  bsItems: "fin_v6_bsI",
  wishes: "fin_v6_wishes",
  accounts: "fin_v6_accs",
  userCats: "fin_v6_cats",
  settings: "fin_v6_set",
};

export const DEFAULT_ACCOUNTS = [
  { id: "a1", name: "現金", type: "asset", isEm: false, initialBalance: 0 },
  { id: "a2", name: "銀行帳戶", type: "asset", isEm: false, initialBalance: 0 },
  { id: "a3", name: "信用卡", type: "liability", isEm: false, initialBalance: 0 },
];

export const DEFAULT_SETTINGS = {
  budgetCap: 20000,
  catBudgets: {},
  retLinked: true,
  retManualAsset: 0,
};

export const CONSTANTS = {
  incomeCategories: ["薪資", "獎金", "投資收益", "租金收入", "副業收入", "其他收入"],
  expenseCategories: [
    "餐飲",
    "交通",
    "住房",
    "娛樂",
    "醫療保健",
    "購物",
    "教育",
    "旅遊與行程",
    "保險",
    "稅務",
    "捐款",
    "其他支出",
  ],
  transactionIcons: {
    薪資: "💼",
    獎金: "🎁",
    投資收益: "📈",
    租金收入: "🏠",
    副業收入: "🧑‍💻",
    其他收入: "🪙",
    餐飲: "🍜",
    交通: "🚌",
    住房: "🏡",
    娛樂: "🎮",
    醫療保健: "🩺",
    購物: "🛍️",
    教育: "📚",
    旅遊與行程: "🧳",
    保險: "🛡️",
    稅務: "🧾",
    捐款: "🤝",
    其他支出: "✨",
    轉帳: "🔁",
  },
  expenseColors: [
    "#e57373",
    "#64b5f6",
    "#81c784",
    "#f06292",
    "#ba68c8",
    "#4db6ac",
    "#ffb74d",
    "#ffd54f",
    "#4dd0e1",
    "#aed581",
    "#7986cb",
    "#90a4ae",
  ],
  wishCategoryIcons: {
    "3C / 家電": "💻",
    "生活 / 家居": "🪴",
    旅行: "✈️",
    興趣: "🎨",
    餐飲: "🍽️",
    醫療保健: "🩺",
    其他: "📦",
  },
  days: ["日", "一", "二", "三", "四", "五", "六"],
};
