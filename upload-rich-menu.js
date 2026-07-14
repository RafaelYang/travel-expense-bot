/**
 * LINE Bot 圖文選單自動上傳與設定腳本
 * 一鍵讀取本地「圖文選單.png」，解析尺寸，並自動四等份對齊設定動作，最後設定為預設選單。
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const IMAGE_PATH = path.join(__dirname, '圖文選單.png');

async function run() {
  console.log("🚀 開始執行圖文選單上傳與註冊腳本...");

  if (!ACCESS_TOKEN) {
    console.error("❌ 錯誤：找不到環境變數 LINE_CHANNEL_ACCESS_TOKEN，請確認 .env 檔案是否存在並已填寫。");
    process.exit(1);
  }

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`❌ 錯誤：找不到圖片檔案「${IMAGE_PATH}」。`);
    process.exit(1);
  }

  try {
    // 1. 讀取 PNG 圖片尺寸 (PNG header 解析)
    const buffer = fs.readFileSync(IMAGE_PATH);
    // 檢查 PNG 簽章
    if (buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
      console.warn("⚠️ 警告：該圖片可能不是標準的 PNG 格式。");
    }

    const width = buffer.readInt32BE(16);
    const height = buffer.readInt32BE(20);
    console.log(`📸 偵測到圖文選單圖片尺寸：${width} x ${height} 像素`);

    // 驗證 LINE 的 Rich Menu 尺寸限制
    const isValidSize = (
      (width === 2500 && height === 1686) ||
      (width === 1200 && height === 810) ||
      (width === 2500 && height === 843) ||
      (width === 1200 && height === 405)
    );

    if (!isValidSize) {
      console.error("❌ 錯誤：LINE 圖文選單圖片必須符合以下尺寸之一：\n- 2500x1686 或 1200x810 (大選單)\n- 2500x843 或 1200x405 (小選單)");
      console.error(`目前尺寸為：${width}x${height}`);
      process.exit(1);
    }

    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);

    // 2. 定義 Rich Menu 結構與 4 個 Action 區塊 (2x2 結構)
    const richMenuData = {
      size: {
        width,
        height
      },
      selected: true,
      name: "記帳選單",
      chatBarText: "✈️ 點此展開記帳選單 📊",
      areas: [
        {
          // 左上格 — 首頁
          bounds: {
            x: 0,
            y: 0,
            width: halfW,
            height: halfH
          },
          action: {
            type: "uri",
            uri: "https://travel-expense-bot-steel.vercel.app"
          }
        },
        {
          // 右上格 — 目前花費
          bounds: {
            x: halfW,
            y: 0,
            width: width - halfW,
            height: halfH
          },
          action: {
            type: "message",
            text: "/expenses"
          }
        },
        {
          // 左下格 — 幣種設定
          bounds: {
            x: 0,
            y: halfH,
            width: halfW,
            height: height - halfH
          },
          action: {
            type: "message",
            text: "/currency"
          }
        },
        {
          // 右下格 — 行程清單
          bounds: {
            x: halfW,
            y: halfH,
            width: width - halfW,
            height: height - halfH
          },
          action: {
            type: "message",
            text: "/list"
          }
        }
      ]
    };

    // 3. 呼叫 LINE API 建立 Rich Menu
    console.log("📤 1. 正在向 LINE 註冊選單結構...");
    const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`
      },
      body: JSON.stringify(richMenuData)
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`建立選單失敗 HTTP ${createRes.status}: ${errText}`);
    }

    const createData = await createRes.json();
    const richMenuId = createData.richMenuId;
    console.log(`✅ 選單結構註冊成功！Rich Menu ID: ${richMenuId}`);

    // 4. 上傳圖片
    console.log("📤 2. 正在上傳圖文選單圖片...");
    const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "Authorization": `Bearer ${ACCESS_TOKEN}`
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`圖片上傳失敗 HTTP ${uploadRes.status}: ${errText}`);
    }
    console.log("✅ 圖片上傳成功！");

    // 5. 設定為全域預設選單
    console.log("📤 3. 正在將此選單設為所有人的預設圖文選單...");
    const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`
      }
    });

    if (!defaultRes.ok) {
      const errText = await defaultRes.text();
      throw new Error(`設定預設選單失敗 HTTP ${defaultRes.status}: ${errText}`);
    }
    console.log("🎉 圖文選單已成功套用至所有 LINE 使用者！");
    console.log("\n🎯 全部設定完畢！請打開手機 LINE 重新開啟聊天室，即可看到全新的圖文選單。");

  } catch (err) {
    console.error("❌ 執行過程中發生錯誤：", err.message);
  }
}

run();
