# 部署檢查清單

這份文件協助確認目前部署的是正確資料夾、正確 Firebase 專案，以及核心檢查都已通過。

## 正式部署來源

正式網站資料夾：

```text
D:\桌面\音樂下載\finance-web
```

Firebase Hosting 專案：

```text
financial-computer
```

正式網址：

```text
https://financial-computer.web.app
```

## 部署前檢查

請先確認目前 PowerShell 路徑：

```powershell
pwd
```

應該顯示：

```text
D:\桌面\音樂下載\finance-web
```

確認 Firebase 專案：

```powershell
firebase use
```

應該是：

```text
financial-computer
```

## 語法檢查

```powershell
Get-ChildItem -Recurse -Filter *.js .\src | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

## 核心計算測試

```powershell
node .\tests\domain.test.mjs
```

## Headless smoke test

`test-server.js` 放在：

```text
D:\桌面\音樂下載\理財網頁其他資料\test-server.js
```

測正式網站資料夾：

```powershell
node 'D:\桌面\音樂下載\理財網頁其他資料\test-server.js' --root='D:\桌面\音樂下載\finance-web' --headless
```

報告輸出：

```text
D:\桌面\音樂下載\理財網頁其他資料\headless-report.html
```

## 部署

```powershell
firebase deploy --only hosting
```

部署完成後確認：

```text
Hosting URL: https://financial-computer.web.app
```

## 不要部署的東西

目前不部署 Cloud Functions，因為這需要 Blaze 方案。

若看到類似訊息，代表設定可能又把 Functions rewrite 加回去了：

```text
Unable to find a valid endpoint for function `adminApi`
```

此時請檢查 `firebase.json`，目前應維持 Hosting-only。

## 維護檢查點

每次部署前，至少確認：

- 路徑是 `finance-web`。
- `firebase.json` 沒有 Functions rewrite。
- JS 語法檢查通過。
- 核心 domain 測試通過。
- Headless smoke test 能產生報告。
