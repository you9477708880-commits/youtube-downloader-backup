import subprocess
import json
import datetime
import os
import sys
import glob
import re

# CONFIG 物件：集中管理所有下載與備份設定
# 每個參數都附上中文註解，確保修改時能明確掌握其影響
CONFIG = {
    # 存檔基礎路徑：使用原始字串 (r) 避免 Python 3.14 的轉義字元警告
    "base_path": r"D:\桌面\音樂下載", 
    
    # 時間戳記格式：用於檔名與內文，確保快照的唯一性
    "timestamp": datetime.datetime.now().strftime("%Y-%m-%d_%H-%M"),
    
    # 檔案名稱前綴：用於辨識快照類型
    "text_prefix": "播放清單快照_",
    "html_prefix": "書籤備份_",
    
    # 資料夾命名規則：統一加上「播放清單-」前綴
    "folder_prefix": "播放清單-",
    
    # 個別清單快照保留數量：針對每個資料夾獨立保留最近 5 份
    "max_snapshots": 5
}

def sanitize_filename(name):
    """
    解釋「為什麼」：Windows 不允許檔名出現特殊字元（如 / \ : * ? " < > |）。
    邏輯：使用正規表示式 (Regex) 將非法字元替換為底線，確保建立資料夾不會報錯。
    """
    return re.sub(r'[\\/*?:"<>|]', "_", name)

def clean_old_files(folder_path, prefix, extension):
    """
    解釋「為什麼」：為了落實「各清單獨立管理」且不互相干擾。
    邏輯：僅針對目前特定的播放清單資料夾執行清理，保留最新的 5 份快照，其餘刪除。
    """
    search_pattern = os.path.join(folder_path, f"{prefix}*{extension}")
    files = glob.glob(search_pattern)
    
    # 依照檔名排序（檔名含時間戳記，舊的會排在前面）
    files.sort()
    
    if len(files) > CONFIG["max_snapshots"]:
        files_to_delete = files[:-CONFIG["max_snapshots"]]
        for f in files_to_delete:
            try:
                os.remove(f)
                # 詮釋輸出結果：顯示被清理的舊紀錄，代表自動維護機制運作健康
                print(f"已清理舊快照：{os.path.basename(f)}")
            except Exception as e:
                print(f"清理過程出錯: {e}")

def run_backup(target_url):
    """
    執行備份核心邏輯：建立「播放清單-名稱」資料夾、抓取資訊並產出高可讀性清單。
    """
    # 抓取清單元數據 (Metadata)，不下載影片，確保執行效率
    cmd = [
        "python", "-m", "yt_dlp",
        "--flat-playlist",
        "--dump-single-json",
        target_url
    ]
    
    try:
        print(f"[{CONFIG['timestamp']}] 正在解析清單資訊並準備分類資料夾...")
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        
        if result.returncode != 0:
            print("[錯誤] 無法讀取清單。請確認清單非私人狀態。")
            return

        data = json.loads(result.stdout)
        raw_title = data.get('title', '未命名清單')
        # 處理名稱安全性
        safe_title = sanitize_filename(raw_title)
        
        # --- 核心改動：自定義資料夾命名格式 ---
        # 邏輯：將資料夾命名為「播放清單-運動」等格式
        folder_name = f"{CONFIG['folder_prefix']}{safe_title}"
        playlist_folder = os.path.join(CONFIG["base_path"], folder_name)
        
        if not os.path.exists(playlist_folder):
            os.makedirs(playlist_folder)
            print(f"已建立專屬目錄：{folder_name}")

        entries = data.get('entries', [])

        # 定義產出檔案的完整路徑
        txt_name = f"{CONFIG['text_prefix']}{CONFIG['timestamp']}.txt"
        html_name = f"{CONFIG['html_prefix']}{CONFIG['timestamp']}.html"
        txt_path = os.path.join(playlist_folder, txt_name)
        html_path = os.path.join(playlist_folder, html_name)

        # --- 產生高可讀性文字清單 (.txt) ---
        # 格式：編號. 標題 - [網址]，每首歌之間增加空行
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(f"=== {raw_title} 內容快照 ({CONFIG['timestamp']}) ===\n\n")
            for idx, entry in enumerate(entries, 1):
                title = entry.get('title', '[未知標題]')
                url = f"https://www.youtube.com/watch?v={entry.get('id')}"
                # 寫入資訊並在結尾加上兩個換行符號（實現照片中的空格效果）
                f.write(f"{idx:03d}. {title} - [{url}]\n\n")

        # --- 產生標準書籤檔 (.html) ---
        with open(html_path, "w", encoding="utf-8") as f:
            f.write("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n")
            f.write('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n')
            f.write(f"<TITLE>Backup - {raw_title}</TITLE>\n<H1>{raw_title}</H1>\n<DL><p>\n")
            for entry in entries:
                url = f"https://www.youtube.com/watch?v={entry.get('id')}"
                f.write(f'    <DT><A HREF="{url}">{entry.get("title")}</A>\n')
            f.write("</DL><p>\n")

        print(f"「{raw_title}」備份成功！檔案已存入 {folder_name}")

        # 針對該播放清單的資料夾執行自動清理 (保留 5 份)
        clean_old_files(playlist_folder, CONFIG["text_prefix"], ".txt")
        clean_old_files(playlist_folder, CONFIG["html_prefix"], ".html")

    except Exception as e:
        print(f"執行異常: {e}")

if __name__ == "__main__":
    # 支援由 .bat 檔傳遞參數或直接執行時手動輸入網址
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = input("請貼上 YouTube 網址後按下 Enter: ")

    if url.strip():
        run_backup(url)