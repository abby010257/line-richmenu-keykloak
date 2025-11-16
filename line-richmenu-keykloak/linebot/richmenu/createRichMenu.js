// linebot/richmenu/createRichMenu.js
// [MODIFIED] 全部改成 axios，不使用 fetch
import axios from "axios"; 
import fs from "fs";

const LINE_CHANNEL_ACCESS_TOKEN = "4YYrOBw5kG4w3Om9qSik9ouHn/4XbfzgA9+iIjx2t52HrSIeqin5gp8tQTnUp0SNjAChTkU6I+fKjeA7bjM8ZCEVN7eQ50reui1dFZcL2CuBtXbuEnuthJ5O5jw2GvCSxkGmmB/oq0t97oBfvWuAnQdB04t89/1O/w1cDnyilFU=";

// ------------------------------
// [ADDED] 列出所有 Rich Menu
// ------------------------------
export async function listRichMenus() {
  const url = "https://api.line.me/v2/bot/richmenu/list";
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
  });
  return res.data.richmenus || [];
}

// ------------------------------
// [ADDED] 刪除所有舊 Rich Menu（你原本給我的程式碼已整合）
// ------------------------------
export async function deleteOldRichMenus() {
  console.log("LINE_CHANNEL_ACCESS_TOKEN :",LINE_CHANNEL_ACCESS_TOKEN);
  const menus = await listRichMenus();

  if (!menus.length) {
    console.log("🔍 沒有舊 Rich Menu 可刪除");
    return;
  }

  console.log(`🗑 準備刪除 ${menus.length} 個舊 Rich Menu...`);

  for (const m of menus) {
    const url = `https://api.line.me/v2/bot/richmenu/${m.richMenuId}`;
    try {
      // [MODIFIED] 改為 axios.delete()
      await axios.delete(url, {
        headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
      });
      console.log(`✔ 已刪除 Rich Menu: ${m.richMenuId}`);
    } catch (err) {
      console.log(`❌ 刪除失敗 ${m.richMenuId}:`, err.response?.data || err);
    }
  }
}

// ------------------------------
// [MODIFIED] 建立 Rich Menu（axios 版）
// ------------------------------
export async function createRichMenu(richMenuJson) {
  const url = "https://api.line.me/v2/bot/richmenu";
  try {
    const res = await axios.post(url, richMenuJson, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log("createRichMenu response:", res.status, res.data);
    return res.data.richMenuId;
  } catch (err) {
    console.error("createRichMenu failed:", err.response?.status, err.response?.data || err.message);
    throw err;
  }
}

// ------------------------------
// [MODIFIED] 上傳圖片（axios + fs）
// ------------------------------
export async function uploadRichMenuImage(richMenuId, imagePath) {
  const url = `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`;
  console.log("準備上傳圖片", { richMenuId, imagePath, url });

  if (!fs.existsSync(imagePath)) {
    throw new Error(`image not found: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);

  try {
    const res = await axios.post(url, imageBuffer, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    console.log(`📤 已上傳圖片至 Rich Menu: ${richMenuId}`, res.status);
    return res.data;
  } catch (err) {
    console.error("uploadRichMenuImage failed:", err.response?.status, err.response?.data || err.message);
    // 如果是 404，給出更明確提示
    if (err.response?.status === 404) {
      console.error("→ 404: LINE API 回報找不到該 richMenuId（請確認 richMenuId 是否正確、或剛建立後有 race condition）");
    }
    throw err;
  }
}

// ------------------------------
// 綁定 Rich Menu 給用戶
// ------------------------------
export async function bindRichMenuToUser(userId, richMenuId) {
  const url = `https://api.line.me/v2/bot/user/${userId}/richmenu/${richMenuId}`;
  console.log("bindRichMenuToUser:",url);
  try {
    await axios.post(url, null, {
      headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
    });
  } catch (err) {
    console.error("bindRichMenuToUser failed:", err.response?.status, err.response?.data || err.message);
    throw err;
  }
}

export async function setDefaultRichMenuWithAxios(richMenuId) {
    const apiUrl = `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`;

    console.log('--- 3. 嘗試使用 Axios 設定為預設選單中...');
    
    await axios.post(apiUrl, null, { 
        headers: {
            'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
    });
    console.log('✅ 成功設定為預設選單 (Axios)。');
}
