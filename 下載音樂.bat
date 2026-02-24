@echo off
set /p url="請貼上 YouTube 網址後按下 Enter: "

:: 檢查網址是否為空
if "%url%"=="" (
    echo [錯誤] 您沒有貼上網址！請重新執行並點擊右鍵貼上。
    pause
    exit
)

:: 使用 Python 3.14.2 環境執行
:: 路徑鎖定在 D 槽桌面
:: 調用 C:\Users\you94 下的 ffmpeg 進行修復
python -m yt_dlp -f "ba[ext=m4a]" --yes-playlist --no-mtime -o "D:/桌面/%%(playlist_title|單曲下載)s/%%(playlist_index&{:02d} - |)s%%(title)s.%%(ext)s" "%url%"

echo.
echo ===================================================
echo 下載任務已完成！請確認 D 槽桌面。
echo ===================================================
pause