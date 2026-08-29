export const APP_ID = "default-finance-app";
export const CURRENT_SCHEMA_VERSION = 3;
export const DEFAULT_SUBCATEGORY = "未分類";

export const STORAGE_KEYS = {
  txs: "fin_v6_txs",
  bsItems: "fin_v6_bsI",
  wishes: "fin_v6_wishes",
  sinkingFunds: "fin_v6_funds",
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
  leftoverMode: "manual",
  investingLabel: "股票 / 黃金",
  cashReserveLabel: "現金保留",
  retLinked: true,
  retManualAsset: 0,
};

export const CATEGORY_SUBCATEGORY_SUGGESTIONS = {
  income: {
    薪資: ["本薪", "加班費", "津貼"],
    獎金: ["年終", "績效", "分紅"],
    投資收益: ["股息", "利息", "資本利得"],
    租金收入: ["房租", "車位", "押金"],
    副業收入: ["接案", "網拍", "平台收入"],
    其他收入: ["退費", "補助", "禮金"],
  },
  expense: {
    餐飲: ["早餐", "午餐", "晚餐", "飲料", "聚餐"],
    交通: ["捷運", "公車", "計程車", "油資", "停車費"],
    住房: ["房租", "水電瓦斯", "管理費", "修繕"],
    娛樂: ["遊戲", "影音訂閱", "活動", "書籍"],
    醫療保健: ["診所就醫", "藥品", "保健品", "牙科"],
    購物: ["日用品", "服飾", "3C", "家電"],
    教育: ["課程", "書籍", "考試", "工具"],
    旅遊與行程: ["住宿", "交通票券", "門票", "旅遊餐飲"],
    保險: ["壽險", "醫療險", "車險", "旅平險"],
    稅務: ["所得稅", "牌照稅", "燃料稅", "規費"],
    捐款: ["公益", "宗教", "互助"],
    其他支出: ["雜項", "手續費", "未分類"],
  },
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
