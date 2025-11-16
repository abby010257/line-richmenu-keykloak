// linebot/richmenu/richmenuConfig.js

export const ROLE_KEYS = ["notBinding", "user1", "user2", "admin"];

export const RICHMENU_CONFIG = {
  notBinding: {
    name: "notBindingMenu",
    imageFile: "start.png",
    json: {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: "notBindingMenu",
      chatBarText: "請開始綁定",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 2500, height: 1686 },
          action: { type: "message", text: "綁定帳號" }
        }
      ]
    }
  },

  user1: {
    name: "user1Menu",
    imageFile: "user1.png",
    json: {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: "user1Menu",
      chatBarText: "主選單",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 1250, height: 1686 },
          action: { type: "message", text: "查詢人物" }
        },
        {
          bounds: { x: 1250, y: 0, width: 1250, height: 1686 },
          action: { type: "message", text: "查詢星球" }
        }
      ]
    }
  },

  user2: {
    name: "user2Menu",
    imageFile: "user2.png",
    json: {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: "user2Menu",
      chatBarText: "主選單",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 1250, height: 1686 },
          action: { type: "message", text: "查詢星球" }
        },
        {
          bounds: { x: 1250, y: 0, width: 1250, height: 1686 },
          action: { type: "message", text: "查詢星艦" }
        }
      ]
    }
  },

  admin: {
    name: "adminMenu",
    imageFile: "admin.png",
    json: {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: "adminMenu",
      chatBarText: "管理選單",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 833, height: 1686 },
          action: { type: "message", text: "查詢人物" }
        },
        {
          bounds: { x: 833, y: 0, width: 834, height: 1686 },
          action: { type: "message", text: "查詢星球" }
        },
        {
          bounds: { x: 1667, y: 0, width: 833, height: 1686 },
          action: { type: "message", text: "查詢星艦" }
        }
      ]
    }
  }
};
