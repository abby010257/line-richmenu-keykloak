// server_combined.js
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
dotenv.config();

import { setupAllRichMenus, applyRichMenuByRole } from "./richmenu/index.js";

import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import qs from "qs";
import ldap from "ldapjs";
import { middleware as lineMiddleware, Client as LineClient } from "@line/bot-sdk";
import Database from "better-sqlite3";

const VALID_ROLES = ["admin", "user1", "user2"];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 指定 DB 路徑，docker 會 mount 到 /app/database/bind.db
const dbPath = path.join(__dirname, "database", "bind.db");
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS user_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lineUserId TEXT UNIQUE,
    kcUserId TEXT UNIQUE,
    username TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
app.set("trust proxy", 1);

// -----/app 基底路徑 -----
const APP_BASE = "/app";
const PORT = process.env.PORT || 8082;


// ----- 環境變數（來自 .env） -----
const {
  LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET,
  KC_AUTH_SERVER_URL,
  KC_REALM,
  KC_CLIENT_ID,
  KC_CLIENT_SECRET,
  KC_REDIRECT_URI,
  LDAP_URL,
  LDAP_ADMIN_DN,
  LDAP_ADMIN_PW,
  SESSION_SECRET,
  NODE_ENV,
  WEBHOOK_PATH
} = process.env;

// ⭐️ 新增：使用者狀態暫存物件(starwars)
const userStates = {};

// ----- LINE client -----
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new LineClient(lineConfig);

// ----- LDAP admin client -----
const ldapClient = ldap.createClient({ url: LDAP_URL });
ldapClient.on("error", (e) => console.error("[LDAP] client error", e));
setTimeout(() => {
  ldapClient.bind(LDAP_ADMIN_DN, LDAP_ADMIN_PW, (err) => {
    if (err) console.error("[LDAP] Bind failed:", err);
    else console.log("[LDAP] Admin bind success");
  });
}, 2000);

// ----------------- LINE webhook -----------------
const webhookPath = WEBHOOK_PATH || "/webhook";
if (LINE_CHANNEL_SECRET) {
  app.post(webhookPath, 
    lineMiddleware(lineConfig), 
    (req, res) => {
    try {
      const events = req.body.events || [];
      Promise.all(events.map(handleEvent));
    } catch (e) {
      console.error("[webhook handler] error", e);
    } finally {
      res.status(200).end();
    }
  });
}

function replyText(replyToken, text) {
  return lineClient.replyMessage(replyToken, {
    type: "text",
    text
  });
}


// helper to build Buttons Template for "未綁定" (as per Q1: Buttons Template, Q2: direct uri to /app/start-bind)
function buildBindButtonsTemplate(lineUserId) {
  return {
    type: "template",
    altText: "綁定Keycloak",
    template: {
      type: "buttons",
      text: "綁定Keycloak",
      actions: [
        {
          type: "uri",
          label: "🔗 綁定 Keycloak",
          uri: `https://genie-unfussing-persuadingly.ngrok-free.dev/app/start-bind?lineUserId=${lineUserId}`
        }
      ]
    }
  };
}

// === Star Wars API 查詢區塊 ======================
async function queryStarWarsAPI(resource, id) {
  const apiUrl = `https://swapi.dev/api/${resource}/${id}/`;
  const resourceNameMap = {
    'people': '角色',
    'planets': '星球',
    'starships': '星艦'
  };
  const displayName = resourceNameMap[resource] || resource;

  try {
    const response = await axios.get(apiUrl);
    const data = response.data;
    let formattedText = `⭐️ Star Wars ${displayName} ID: ${id} ⭐️\n`;

    switch (resource) {
      case 'people':
        formattedText += `姓名: ${data.name}\n`;
        formattedText += `身高: ${data.height} cm\n`;
        formattedText += `體重: ${data.mass} kg\n`;
        formattedText += `髮色: ${data.hair_color}\n`;
        formattedText += `出生年份: ${data.birth_year}`;
        break;
      case 'planets':
        formattedText += `名稱: ${data.name}\n`;
        formattedText += `氣候: ${data.climate}\n`;
        formattedText += `地形: ${data.terrain}\n`;
        formattedText += `重力: ${data.gravity}\n`;
        formattedText += `人口: ${data.population}`;
        break;
      case 'starships':
        formattedText += `名稱: ${data.name}\n`;
        formattedText += `型號: ${data.model}\n`;
        formattedText += `製造商: ${data.manufacturer}\n`;
        formattedText += `星艦等級: ${data.starship_class}\n`;
        formattedText += `乘員數: ${data.crew}`;
        break;
    }
    return formattedText;
  } catch (error) {
    if (error.response?.status === 404) {
      return `錯誤：找不到 ID 為 ${id} 的 ${displayName}。`;
    }
    return `查詢 Star Wars API 時發生錯誤。`;
  }
}

// handleEvent / replyText 
async function handleEvent(event) {
  const userId = event.source.userId;
  const row = db.prepare(`SELECT * FROM user_bindings WHERE lineUserId = ?`).get(userId);

  // --- FOLLOW：使用者加入 LINE BOT ---
  if (!row) {
    
    if (event.type === "follow") {
      // 未綁定 → 套用 notBindingMenu（含「登入綁定」按鈕）
      // await applyRichMenuByRole(userId, "notBinding");
      try {
        await lineClient.replyMessage(event.replyToken, [
          { type: "text", text: "您尚未綁定帳號，請點下方按鈕進行綁定。" },
          buildBindButtonsTemplate(userId)
        ]);
      } catch (e) {
        console.error("[LINE reply error - not bound]", e);
      }
      return; // do not continue to command processing
    }
    // 若是 message → 一律回覆綁定
    if (event.type === "message") {
      // await applyRichMenuByRole(userId, "notBinding");
      try {
        await lineClient.replyMessage(event.replyToken, [
          { type: "text", text: "請先綁定帳號才能使用其他功能。" },
          buildBindButtonsTemplate(userId)
        ]);
      } catch (e) {
        console.error("[LINE reply error - message not bound]", e);
      }
      return;
    }
    
  }
  // 已綁定 → 根據角色套用不同 RichMenu
  // console.log("點選選單後:",userId, row.role);
  await applyRichMenuByRole(userId, row.role);
  

  // --- MESSAGE：聊天訊息 ---
  if (event.type === "message" && event.message.type === "text") {

    const text = event.message.text.trim();

    // 檢查查詢狀態
    const currentState = userStates[userId];

    // ====== STEP 1: RichMenu 功能指令 ======

    if (text === "查詢人物") {
      userStates[userId] = "awaiting_people_id";
      return replyText(event.replyToken, "請輸入人物 ID（純數字）。");
    }

    if (text === "查詢星球") {
      userStates[userId] = "awaiting_planets_id";
      return replyText(event.replyToken, "請輸入星球 ID（純數字）。");
    }

    if (text === "查詢星艦") {
      userStates[userId] = "awaiting_starships_id";
      return replyText(event.replyToken, "請輸入星艦 ID（純數字）。");
    }

    // ====== STEP 2: 若正在等待 ID ======
    if (currentState) {
      if (/^\d+$/.test(text)) {
        let resource = null;

        if (currentState === "awaiting_people_id") resource = "people";
        if (currentState === "awaiting_planets_id") resource = "planets";
        if (currentState === "awaiting_starships_id") resource = "starships";

        userStates[userId] = null; // 清除狀態

        const result = await queryStarWarsAPI(resource, text);
        return replyText(event.replyToken, result);
      }

      return replyText(
        event.replyToken,
        "請輸入純數字 ID。\n若需更換查詢項目，請按下方選單。"
      );
    }

    // ====== STEP 3: 無匹配指令 ======
    return replyText(
      event.replyToken,
      "無法辨識您的需求。\n請點擊下方選單使用功能。"
    );
  }

  return;
}



app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ----- Session 設定 -----
app.use(
  session({
    secret: SESSION_SECRET || "session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: NODE_ENV === "production",
      sameSite: NODE_ENV === "production" ? "none" : "lax",
      maxAge: 60 * 60 * 1000,
    },
  })
);

// ----- 靜態頁（來自 server_liff.js） -----
app.use(APP_BASE, express.static(path.join(__dirname, "public")));

// 若直接訪問 /app/liff-link，自動導向 /app/liff-link.html （保留 server_liff 的行為）
app.get(`${APP_BASE}/liff-link`, (req, res) => {
  // 若尚未登入 Keycloak，也允許 LIFF 顯示（我們會在前端判斷流程）
  // res.redirect(`${APP_BASE}/liff-link.html`);
  return res.sendFile(path.join(__dirname, "public", "liff-link.html"));
});

// 🔹 LIFF 驗證 API：驗證 LINE access token
app.post(`${APP_BASE}/verify-line`, async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    console.warn("⚠️ 缺少 accessToken");
    return res.status(400).json({ error: "No access token" });
  }

  try {
    // 驗證 token 是否有效
    const verifyResponse = await axios.get("https://api.line.me/oauth2/v2.1/verify", {
      params: { access_token: accessToken },
    });

    console.log("✅ Token 驗證成功:", verifyResponse.data);

    // 取得 LINE 使用者 profile
    const profileResponse = await axios.get("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userProfile = profileResponse.data;

    console.log("✅ 取得使用者資料:", userProfile);

    return res.json({
      success: true,
      message: "LINE user verified (mock bind success)",
      profile: {
        userId: userProfile.userId,
        displayName: userProfile.displayName,
        pictureUrl: userProfile.pictureUrl,
        // 若 verifyResponse.data 有 id_token，則回傳（前端可再送 id_token 給 /api/bind-line）
        idToken: verifyResponse.data.id_token
      },
    });
  } catch (error) {
    console.error("❌ 驗證失敗:", error.response?.data || error.message);
    return res.status(400).json({
      error: "LINE token verification failed",
      details: error.response?.data || error.message,
    });
  }
});

//  Start bind flow：由前端開啟此 route（GET），server 用 session 暫存 lineUserId，然後導到 /app/login -----------------
app.get(`${APP_BASE}/start-bind`, (req, res) => {
  const { lineUserId } = req.query;
  if (!lineUserId) return res.status(400).send("Missing lineUserId");
  // 把欲綁定的 lineUserId 存到 session（callback 時會使用）
  req.session.pendingBind = lineUserId;
  console.log(`[START-BIND] pendingBind set to ${lineUserId}`);
  // redirect to OIDC auth Keycloak login
  const authUrl =
    `${KC_AUTH_SERVER_URL}/realms/${KC_REALM}/protocol/openid-connect/auth?` +
    new URLSearchParams({
      client_id: KC_CLIENT_ID,
      redirect_uri: KC_REDIRECT_URI,
      response_type: "code",
      scope: "openid profile email",
      // state is optional; we rely on server session pendingBind
    }).toString();
  return res.redirect(authUrl);
});

// ----------------- Keycloak callback ----
// tokenResp.data 存到 session.kcTokens，並於 callback 完成時進行 LDAP 更新（若 session.pendingBind 存在）
app.get(`${APP_BASE}/callback`, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing code");

    const tokenUrl = `${KC_AUTH_SERVER_URL}/realms/${KC_REALM}/protocol/openid-connect/token`;
    const tokenResp = await axios.post(
      tokenUrl,
      qs.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: KC_REDIRECT_URI,
        client_id: KC_CLIENT_ID,
        client_secret: KC_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResp.data.access_token;
    // 存 token data 到 session，供 /api/bind-line 或前端顯示
    req.session.kcTokens = tokenResp.data;
    const userResp = await axios.get(
      `${KC_AUTH_SERVER_URL}/realms/${KC_REALM}/protocol/openid-connect/userinfo`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const userinfo = userResp.data;
    const decoded = jwt.decode(accessToken);
    const kcUserId = decoded.sub;
    const allRoles  = decoded?.realm_access?.roles || [];
    const userRole = allRoles.find(r => VALID_ROLES.includes(r)) || "guest";
    const username = decoded?.preferred_username;
    // const kcUserId = req.session.kcUser.sub;
    req.session.isLoggedIn = true;
    req.session.username = userinfo.preferred_username;
    req.session.kcUser = userinfo;
    req.session.role = userRole;
    console.log("[OIDC callback] kcUserId ", kcUserId);
    console.log("[OIDC callback] login ok for ", username);
    console.log("[OIDC callback] role ", userRole);

    // 如果 session.pendingBind 存在，代表使用者是從 LIFF 啟動綁定流程
    if (req.session?.pendingBind) {
      const lineUserId = req.session.pendingBind;
      console.log("[OIDC callback] pendingBind found:", lineUserId);

      try {
        // 🔥 將資料寫入 SQLite(更新方式)
        const stmt = db.prepare(`
          INSERT INTO user_bindings (lineUserId, kcUserId, username, role)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(lineUserId) DO UPDATE SET
              kcUserId = excluded.kcUserId,
              username = excluded.username,
              role = excluded.role
          `);

        stmt.run(lineUserId, kcUserId, username, userRole);
        console.log("[SQLite] binding saved");

        // 讓前端 /app/liff-link 顯示結果
        req.session.lastBindResult = {
          ok: true,
          lineUserId,
          kcUserId,
          username,
          role: userRole,
          message: `綁定成功`
        };
        // =============== 🔥 推送訊息給 LINE 使用者 ===============
        await lineClient.pushMessage(lineUserId, {
          type: "text",
          text: `✅ 已綁定\n使用者：${username}\n角色：${userRole}`
        });
        // =============== 根據使用者角色給予相對應richmenu ===============
        try {
          console.log("applyRichMenuByRole",lineUserId, userRole);
          await applyRichMenuByRole(lineUserId, userRole);
        } catch (e) {
          console.error("[callback] applyRichMenuByRole failed:", e.message || e);
        }

      } catch (e) {
        console.error("[callback] bind update failed:", e);
        req.session.lastBindResult = { ok: false, error: e.message || e };
      } finally {
        delete req.session.pendingBind;
      }
    }
    // =============== 🔥 回到 LIFF 頁面（不再重新 login） ===============
    return res.redirect(`${APP_BASE}/liff-link?bind=success`);
  } catch (err) {
    console.error("[OIDC callback] error:", err.response?.data || err.message);
    return res.status(500).send("OIDC callback failed");
  }
});


// 啟動伺服器
app.listen(PORT, async() => {
  console.log(`✅ LINE-BOT Server on ${PORT}`);
  console.log(`APP_BASE: ${APP_BASE}, KC_REDIRECT_URI: ${KC_REDIRECT_URI}`);
  console.log("webhookPath: ",webhookPath);
  console.log("channelAccessToken",LINE_CHANNEL_ACCESS_TOKEN);
  console.log("channelSecret",LINE_CHANNEL_SECRET);
  console.log("111");
});

