import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const WEB_APP_URL =
  process.env.WEB_APP_URL || `http://localhost:${PORT}`;

const publicDir = path.join(__dirname, "public");
const dataFile = path.join(__dirname, "data.json");

const LETTER_REWARD = 5000;
const TASK_TARGET = 130000;
const LETTERS_IN_TASK = 26;

/*
  Demo ma'lumotlar:
  Har bir Telegram foydalanuvchisi alohida saqlanadi.
*/

let database = {
  users: {}
};


// ================================
// DATABASE
// ================================

function loadDatabase() {
  try {
    if (!fs.existsSync(dataFile)) {
      saveDatabase();
      return;
    }

    const raw = fs.readFileSync(dataFile, "utf8");

    if (!raw.trim()) {
      saveDatabase();
      return;
    }

    const parsed = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.users &&
      typeof parsed.users === "object"
    ) {
      database = parsed;
    }
  } catch (error) {
    console.error("data.json o'qishda xato:", error.message);

    database = {
      users: {}
    };
  }
}


function saveDatabase() {
  try {
    fs.writeFileSync(
      dataFile,
      JSON.stringify(database, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("data.json saqlashda xato:", error.message);
  }
}


loadDatabase();


// ================================
// USER
// ================================

function makeUserKey(id) {
  return String(id);
}


function getDisplayName(user) {
  if (!user) {
    return "Foydalanuvchi";
  }

  const firstName =
    String(user.first_name || "").trim();

  const lastName =
    String(user.last_name || "").trim();

  const fullName =
    `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return String(user.username);
  }

  return "Foydalanuvchi";
}


function createUserIfNeeded(telegramUser) {
  if (
    !telegramUser ||
    telegramUser.id === undefined ||
    telegramUser.id === null
  ) {
    return null;
  }

  const key = makeUserKey(telegramUser.id);

  if (!database.users[key]) {
    database.users[key] = {
      id: telegramUser.id,

      firstName:
        telegramUser.first_name || "",

      lastName:
        telegramUser.last_name || "",

      username:
        telegramUser.username || "",

      balance: 0,

      taskEarned: 0,

      digitizedLetters: 0,

      completedTasks: 0,

      withdrawals: [],

      taskCompleted: false,

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString()
    };
  } else {
    database.users[key].firstName =
      telegramUser.first_name ||
      database.users[key].firstName ||
      "";

    database.users[key].lastName =
      telegramUser.last_name ||
      database.users[key].lastName ||
      "";

    database.users[key].username =
      telegramUser.username ||
      database.users[key].username ||
      "";

    database.users[key].updatedAt =
      new Date().toISOString();
  }

  saveDatabase();

  return database.users[key];
}


function getUserById(id) {
  if (id === undefined || id === null) {
    return null;
  }

  return database.users[makeUserKey(id)] || null;
}


function userResponse(user) {
  if (!user) {
    return {
      ok: false
    };
  }

  const fullName =
    `${user.firstName || ""} ${user.lastName || ""}`
      .trim() ||
    user.username ||
    "Foydalanuvchi";

  return {
    ok: true,

    user: {
      id: user.id,

      firstName: user.firstName || "",

      lastName: user.lastName || "",

      username: user.username || "",

      name: fullName,

      role: "Ijrochi",

      balance: Number(user.balance || 0),

      taskEarned: Number(user.taskEarned || 0),

      taskTarget: TASK_TARGET,

      letterReward: LETTER_REWARD,

      lettersInTask: LETTERS_IN_TASK,

      digitizedLetters:
        Number(user.digitizedLetters || 0),

      completedTasks:
        Number(user.completedTasks || 0),

      taskCompleted:
        Boolean(user.taskCompleted),

      withdrawals:
        Array.isArray(user.withdrawals)
          ? user.withdrawals
          : []
    }
  };
}


// ================================
// TELEGRAM API
// ================================

async function telegram(method, body = {}) {
  if (!BOT_TOKEN) {
    console.log("BOT_TOKEN topilmadi.");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
      {
        method: "POST",

        headers: {
          "content-type": "application/json"
        },

        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    return data;
  } catch (error) {
    console.error(
      "Telegram API xatosi:",
      error.message
    );

    return null;
  }
}


// ================================
// BOT MENU
// ================================

async function sendMenu(
  chatId,
  firstName = "Foydalanuvchi"
) {
  const text =
`👋 Assalomu alaykum, ${firstName}!

📝 Sizga qo‘l yozuvi asosida topshiriq beriladi.

🎯 Boshlash tugmasini bosib topshiriqni boshlang.`;

  const result = await telegram(
    "sendMessage",
    {
      chat_id: chatId,

      text,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🟣 Boshlash",

              web_app: {
                url: WEB_APP_URL
              }
            }
          ]
        ]
      }
    }
  );

  console.log(
    "sendMessage javobi:",
    JSON.stringify(result)
  );
}


// ================================
// JSON BODY
// ================================

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

      if (body.length > 1024 * 1024) {
        req.destroy();

        reject(
          new Error("Request juda katta.")
        );
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(
          new Error("JSON noto'g'ri.")
        );
      }
    });

    req.on("error", reject);
  });
}


// ================================
// API RESPONSE
// ================================

function sendJson(res, statusCode, data) {
  const json =
    JSON.stringify(data);

  res.writeHead(
    statusCode,
    {
      "content-type":
        "application/json; charset=utf-8",

      "access-control-allow-origin": "*",

      "access-control-allow-headers":
        "content-type",

      "access-control-allow-methods":
        "GET, POST, OPTIONS"
    }
  );

  res.end(json);
}


// ================================
// HELPERS
// ================================

function cleanCardNumber(value) {
  return String(value || "")
    .replace(/\D/g, "");
}


function formatMoney(value) {
  return Number(value || 0)
    .toLocaleString("uz-UZ");
}


// ================================
// API
// ================================

async function handleApi(req, res, pathname) {

  // ----------------------------
  // OPTIONS
  // ----------------------------

  if (req.method === "OPTIONS") {
    res.writeHead(
      204,
      {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS"
      }
    );

    res.end();

    return true;
  }


  // ----------------------------
  // /api/health
  // ----------------------------

  if (
    req.method === "GET" &&
    pathname === "/api/health"
  ) {
    sendJson(
      res,
      200,
      {
        ok: true,
        server: "Harf Demo Bot",
        time: new Date().toISOString()
      }
    );

    return true;
  }


  // ----------------------------
  // /api/me
  // ----------------------------

  if (
    req.method === "POST" &&
    pathname === "/api/me"
  ) {
    try {
      const body =
        await readJsonBody(req);

      const telegramUser =
        body.telegramUser;

      const user =
        createUserIfNeeded(
          telegramUser
        );

      if (!user) {
        sendJson(
          res,
          400,
          {
            ok: false,
            message:
              "Telegram foydalanuvchisi topilmadi."
          }
        );

        return true;
      }

      sendJson(
        res,
        200,
        userResponse(user)
      );

      return true;
    } catch (error) {
      sendJson(
        res,
        400,
        {
          ok: false,
          message: error.message
        }
      );

      return true;
    }
  }


  // ----------------------------
  // /api/state
  // ----------------------------

  if (
    req.method === "GET" &&
    pathname === "/api/state"
  ) {
    const url =
      new URL(
        req.url,
        `http://${req.headers.host}`
      );

    const userId =
      url.searchParams.get("userId");

    const user =
      getUserById(userId);

    if (!user) {
      sendJson(
        res,
        404,
        {
          ok: false,
          message:
            "Foydalanuvchi topilmadi."
        }
      );

      return true;
    }

    sendJson(
      res,
      200,
      userResponse(user)
    );

    return true;
  }


  // ----------------------------
  // /api/letter-complete
  // ----------------------------

  if (
    req.method === "POST" &&
    pathname === "/api/letter-complete"
  ) {
    try {
      const body =
        await readJsonBody(req);

      const telegramUser =
        body.telegramUser;

      const user =
        createUserIfNeeded(
          telegramUser
        );

      if (!user) {
        sendJson(
          res,
          400,
          {
            ok: false,
            message:
              "Foydalanuvchi topilmadi."
          }
        );

        return true;
      }


      /*
        Agar topshiriq oldin tugagan bo'lsa,
        yangi topshiriqni boshlab yuborish mumkin.
      */

      if (user.taskCompleted) {
        user.taskEarned = 0;
        user.taskCompleted = false;
      }


      /*
        130000 dan oshib ketmasligi uchun
        qolgan summani hisoblaymiz.
      */

      const remaining =
        TASK_TARGET -
        Number(user.taskEarned || 0);

      const reward =
        Math.min(
          LETTER_REWARD,
          Math.max(0, remaining)
        );


      if (reward <= 0) {
        user.taskCompleted = true;

        saveDatabase();

        sendJson(
          res,
          200,
          {
            ok: true,

            reward: 0,

            taskFinished: true,

            user:
              userResponse(user).user
          }
        );

        return true;
      }


      // Balansga qo'shish
      user.balance =
        Number(user.balance || 0) +
        reward;


      // Shu topshiriq daromadi
      user.taskEarned =
        Number(user.taskEarned || 0) +
        reward;


      // Raqamlashtirilgan harf
      user.digitizedLetters =
        Number(user.digitizedLetters || 0) +
        1;


      let taskFinished = false;


      if (
        user.taskEarned >=
        TASK_TARGET
      ) {
        user.taskEarned =
          TASK_TARGET;

        user.taskCompleted =
          true;

        user.completedTasks =
          Number(user.completedTasks || 0) +
          1;

        taskFinished = true;
      }


      user.updatedAt =
        new Date().toISOString();


      saveDatabase();


      sendJson(
        res,
        200,
        {
          ok: true,

          reward,

          rewardFormatted:
            `${formatMoney(reward)} so'm`,

          taskFinished,

          message:
            taskFinished
              ? "Topshiriq tugadi."
              : "Harf muvaffaqiyatli saqlandi.",

          user:
            userResponse(user).user
        }
      );

      return true;

    } catch (error) {
      sendJson(
        res,
        400,
        {
          ok: false,
          message: error.message
        }
      );

      return true;
    }
  }


  // ----------------------------
  // /api/reset-task
  // ----------------------------

  if (
    req.method === "POST" &&
    pathname === "/api/reset-task"
  ) {
    try {
      const body =
        await readJsonBody(req);

      const user =
        createUserIfNeeded(
          body.telegramUser
        );

      if (!user) {
        sendJson(
          res,
          400,
          {
            ok: false,
            message:
              "Foydalanuvchi topilmadi."
          }
        );

        return true;
      }

      user.taskEarned = 0;

      user.taskCompleted =
        false;

      user.updatedAt =
        new Date().toISOString();

      saveDatabase();

      sendJson(
        res,
        200,
        {
          ok: true,
          user:
            userResponse(user).user
        }
      );

      return true;

    } catch (error) {
      sendJson(
        res,
        400,
        {
          ok: false,
          message: error.message
        }
      );

      return true;
    }
  }


  // ----------------------------
  // /api/withdraw
  // ----------------------------

  if (
    req.method === "POST" &&
    pathname === "/api/withdraw"
  ) {
    try {
      const body =
        await readJsonBody(req);

      const telegramUser =
        body.telegramUser;

      const cardNumber =
        cleanCardNumber(
          body.cardNumber
        );

      const amount =
        Number(body.amount);


      const user =
        createUserIfNeeded(
          telegramUser
        );


      if (!user) {
        sendJson(
          res,
          400,
          {
            ok: false,
            message:
              "Foydalanuvchi topilmadi."
          }
        );

        return true;
      }


      if (
        cardNumber.length < 16 ||
        cardNumber.length > 19
      ) {
        sendJson(
          res,
          400,
          {
            ok: false,
            message:
              "Karta raqami noto'g'ri."
          }
        );

        return true;
      }


      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        sendJson(
          res,
          400,
          {
            ok: false,
            message:
              "Summa noto'g'ri."
          }
        );

        return true;
      }


      if (
        amount >
        Number(user.balance || 0)
      ) {
        sendJson(
          res,
          400,
          {
            ok: false,
            message:
              "Balans yetarli emas."
          }
        );

        return true;
      }


      /*
        Bu yerda bank API yo'q.
        Shuning uchun real kartaga pul o'tkazildi
        deb ko'rsatmaymiz.

        So'rov yaratiladi va balans rezerv qilinadi.
      */

      const maskedCard =
        cardNumber.length >= 4
          ? `**** **** **** ${cardNumber.slice(-4)}`
          : "****";


      const withdrawal = {
        id:
          `WD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,

        amount,

        card:
          maskedCard,

        status:
          "pending",

        createdAt:
          new Date().toISOString()
      };


      user.balance =
        Number(user.balance || 0) -
        amount;


      user.withdrawals =
        Array.isArray(user.withdrawals)
          ? user.withdrawals
          : [];


      user.withdrawals.unshift(
        withdrawal
      );


      user.updatedAt =
        new Date().toISOString();


      saveDatabase();


      sendJson(
        res,
        200,
        {
          ok: true,

          status: "pending",

          message:
            "Pul yechish so'rovi qabul qilindi. Bank/to'lov provayderi ulangandan keyin karta orqali o'tkaziladi.",

          withdrawal,

          user:
            userResponse(user).user
        }
      );

      return true;

    } catch (error) {
      sendJson(
        res,
        400,
        {
          ok: false,
          message: error.message
        }
      );

      return true;
    }
  }


  return false;
}


// ================================
// LONG POLLING
// ================================

async function poll(offset = 0) {

  if (!BOT_TOKEN) {
    console.log(
      "BOT_TOKEN kiritilmagan. Mini App lokal rejimda ishlaydi."
    );

    return;
  }


  try {
    console.log(
      "Telegramdan yangiliklar tekshirilmoqda..."
    );


    const result =
      await telegram(
        "getUpdates",
        {
          offset,

          timeout: 25,

          allowed_updates: [
            "message"
          ]
        }
      );


    console.log(
      "Telegram javobi:",
      JSON.stringify(result)
    );


    if (result?.ok) {

      for (
        const update
        of result.result
      ) {

        offset =
          update.update_id + 1;


        console.log(
          "Yangi update:",
          update.update_id
        );


        const msg =
          update.message;


        if (
          !msg?.chat?.id
        ) {
          console.log(
            "Message topilmadi."
          );

          continue;
        }


        console.log(
          "Xabar:",
          msg.text
        );


        // ============================
        // /START
        // ============================

        if (
          msg.text === "/start" ||
          msg.text ===
          "/start@harflipton_bot"
        ) {

          const telegramUser =
            msg.from;


          const user =
            createUserIfNeeded(
              telegramUser
            );


          const name =
            getDisplayName(
              telegramUser
            );


          console.log(
            `👤 Foydalanuvchi: ${name}`
          );


          console.log(
            "User ID:",
            user?.id
          );


          await sendMenu(
            msg.chat.id,
            name
          );
        }
      }
    }

  } catch (error) {

    console.error(
      "Polling xatosi:",
      error.message
    );
  }


  setImmediate(
    () => poll(offset)
  );
}


// ================================
// MIME TYPES
// ================================

const mime = {

  ".html":
    "text/html; charset=utf-8",

  ".js":
    "text/javascript; charset=utf-8",

  ".css":
    "text/css; charset=utf-8",

  ".json":
    "application/json; charset=utf-8",

  ".png":
    "image/png",

  ".jpg":
    "image/jpeg",

  ".jpeg":
    "image/jpeg",

  ".svg":
    "image/svg+xml",

  ".ico":
    "image/x-icon"

};


// ================================
// WEB SERVER
// ================================

const server =
  http.createServer(
    async (req, res) => {

      try {

        const parsedUrl =
          new URL(
            req.url,
            `http://${req.headers.host}`
          );


        const pathname =
          parsedUrl.pathname;


        // API
        if (
          pathname.startsWith("/api/")
        ) {

          const handled =
            await handleApi(
              req,
              res,
              pathname
            );


          if (handled) {
            return;
          }
        }


        // Bosh sahifa
        let urlPath =
          pathname;


        if (
          urlPath === "/" ||
          urlPath === ""
        ) {
          urlPath =
            "/index.html";
        }


        // Xavfsiz path
        const safePath =
          path
            .normalize(urlPath)
            .replace(
              /^(\.\.[/\\])+/, 
              ""
            );


        const filePath =
          path.join(
            publicDir,
            safePath
          );


        console.log(
          "Web:",
          req.method,
          urlPath
        );


        fs.readFile(
          filePath,
          (error, data) => {

            if (error) {

              console.log(
                "Fayl topilmadi:",
                filePath
              );


              res.writeHead(
                404,
                {
                  "content-type":
                    "text/plain; charset=utf-8",

                  "access-control-allow-origin":
                    "*"
                }
              );


              return res.end(
                "Not found"
              );
            }


            const ext =
              path.extname(
                filePath
              );


            res.writeHead(
              200,
              {
                "content-type":
                  mime[ext] ||
                  "application/octet-stream",

                "access-control-allow-origin":
                  "*"
              }
            );


            res.end(data);
          }
        );

      } catch (error) {

        console.error(
          "Web server xatosi:",
          error.message
        );


        res.writeHead(
          500,
          {
            "content-type":
              "text/plain; charset=utf-8"
          }
        );


        res.end(
          "Server error"
        );
      }
    }
  );


// ================================
// SERVER START
// ================================

server.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "================================"
    );

    console.log(
      "HARF DEMO BOT ISHLAYAPTI"
    );

    console.log(
      "================================"
    );


    console.log(
      `Mini App: http://localhost:${PORT}`
    );


    console.log(
      `WEB APP URL: ${WEB_APP_URL}`
    );


    if (BOT_TOKEN) {

      console.log(
        "Telegram bot ishga tushmoqda..."
      );

      console.log(
        "Bot: @harflipton_bot"
      );

      console.log(
        "Telegram polling boshlandi."
      );

      console.log("");

      poll();

    } else {

      console.log(
        "BOT_TOKEN hali kiritilmagan."
      );
    }
  }
);