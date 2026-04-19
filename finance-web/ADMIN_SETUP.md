# 最小可用管理後台

這份骨架已經包含兩個部分：

- `admin/`：管理後台前端
- `functions/`：管理 API 骨架，只有白名單管理員可以使用

## 後台網址

部署 Hosting 後，後台頁面會是：

- `/admin/`

例如：

- `https://financial-computer.web.app/admin/`

## 目前包含的功能

- 列出使用者
- 查看單一使用者摘要
- 刪除單一使用者資料
- 刪除單一使用者帳號
- 刪除單一使用者帳號與資料

## 先決條件

Cloud Functions for Firebase 需要可部署 Functions 的 Firebase 專案。Firebase 官方的 Functions 文件也提醒，部署 Functions 需要 Blaze plan。

來源：
- https://firebase.google.com/docs/functions/get-started

## 第一次啟用步驟

1. 在 `functions/` 安裝依賴

```powershell
cd D:\桌面\音樂下載\finance-web\functions
npm install
```

2. 建立 `functions/.env`

可以直接複製 `.env.example`，並填入你自己的管理員 Google email：

```txt
ADMIN_EMAILS=your-email@gmail.com
APP_ID=financial-computer
```

3. 初始化 Functions

如果你還沒在這個專案目錄跑過 Functions 初始化，執行：

```powershell
cd D:\桌面\音樂下載\finance-web
firebase init functions
```

如果 Firebase CLI 詢問是否覆蓋現有檔案，請先看清楚，不要覆蓋這份骨架。

4. 部署 Hosting + Functions

```powershell
cd D:\桌面\音樂下載\finance-web
firebase deploy --only functions,hosting
```

## 安全邏輯

- 前端後台頁面不直接擁有管理權限
- 真正的刪除與列表查詢只在 `functions/index.js`
- 後端會驗證 Firebase ID Token
- 只有 `ADMIN_EMAILS` 白名單中的 email 才能操作

## 後續最值得補的功能

- 顯示 Firestore 最後同步時間
- 停權使用者而不是直接刪除
- 刪除前先做 JSON 備份
- 管理員改成 custom claims，而不是只看 email 白名單
