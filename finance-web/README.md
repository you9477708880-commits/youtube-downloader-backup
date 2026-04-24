# 理財計算 Pro

這個資料夾是 Firebase Hosting 的正式部署來源。

正式路徑：

```text
D:\桌面\音樂下載\finance-web
```

正式網址：

```text
https://financial-computer.web.app
```

## 常用命令

語法檢查：

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

核心計算測試：

```powershell
node .\tests\domain.test.mjs
```

Headless smoke test：

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless
```

部署：

```powershell
firebase deploy --only hosting
```

## 維護文件

- `docs/data-model.md`：資料模型。
- `docs/accounting-rules.md`：收入、支出、轉帳、代墊、收款的規則。
- `docs/report-traceability.md`：報表數字如何追到來源明細。
- `docs/firebase-status.md`：Firebase 狀態文字規格。
- `docs/deploy-checklist.md`：部署前檢查。
