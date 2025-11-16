// linebot/richmenu/index.js
import path from "path";
import { fileURLToPath } from "url";

import { RICHMENU_CONFIG, ROLE_KEYS } from "./richmenuConfig.js";
import {
  createRichMenu,
  uploadRichMenuImage,
  bindRichMenuToUser,
  listRichMenus,
  deleteOldRichMenus,
  setDefaultRichMenuWithAxios  // [ADDED]
} from "./createRichMenu.js";

// ------------------------------
// 系統路徑
// ------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 圖片資料夾
const IMAGES_DIR = path.join(__dirname, "..", "images");

// 存在記憶體中的 richMenuId 對照表
const richMenuMap = {};

// ------------------------------
// 找出既存的 Rich Menu（用 name 比對）
// ------------------------------
async function findExistingRichMenus() {
  try {
    const existing = await listRichMenus();
    const map = {};

    for (const m of existing) {
      if (m.name) map[m.name] = m.richMenuId;
    }

    return map;
  } catch (err) {
    console.warn("list rich menu failed:", err.message);
    return {};
  }
}

// ------------------------------
// 初始化全部 Rich Menu
// ------------------------------
export async function setupAllRichMenus() {
  console.log("===== Rich Menu Setup Start =====");

  // [ADDED] 強制刪除所有舊的 RichMenu → 你要求整合
//   await deleteOldRichMenus();

  console.log("🔍 取得 Rich Menu 列表...");
  const existing = await findExistingRichMenus();

  for (const role of ROLE_KEYS) {
    const cfg = RICHMENU_CONFIG[role];
    if (!cfg) continue;

    const existingId = existing[cfg.name];

    if (existingId) {
      console.log(`♻ 重用已存在的 Rich Menu：${cfg.name}`);
      richMenuMap[role] = existingId;
      continue;
    }

    console.log(`🆕 建立 Rich Menu：${cfg.name}`);
    const newId = await createRichMenu(cfg.json);
    console.log("⭐ NEW richMenuId =", newId);
    // 驗證：建立後立刻 listRichMenus
    const afterList = await listRichMenus();
    console.log("⭐ LIST AFTER CREATE:", afterList.map(m => m.richMenuId));

    const imgPath = path.join(IMAGES_DIR, cfg.imageFile);
    // 等 LINE sync 完成，不然會 404
    await new Promise(resolve => setTimeout(resolve, 3000));
    await uploadRichMenuImage(newId, imgPath);

    richMenuMap[role] = newId;
    console.log(`✔ 已建立 Rich Menu (${role}) → ${newId}`);
  }
  
  await setDefaultRichMenuWithAxios(richMenuMap["notBinding"]);
  console.log("🎯 已設定 notBindingMenu 為預設選單");
  console.log("===== Rich Menu Setup Finished =====");
  return richMenuMap;
}


// ------------------------------
// 根據角色套用 RichMenu 給使用者
// ------------------------------
export async function applyRichMenuByRole(userId, role) {
  if (!RICHMENU_CONFIG[role]) {
    role = "notBinding";
  }

  const id = richMenuMap[role];
  console.log("richMenuMap[role]",id);

  if (!id) {
    throw new Error(`id = richMenuMap[role]不存在，role=${role}`);
  }

  await bindRichMenuToUser(userId, id);
  console.log(`👤 已替使用者 ${userId} 套用 Rich Menu：${role}`);
}

// ------------------------------
export function getRichMenuMap() {
  return { ...richMenuMap };
}


setupAllRichMenus();