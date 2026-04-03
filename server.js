require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcrypt");
const axios = require("axios");

const Chat = require("./models/Chat");

const app = express();
app.use(cors());
app.use(express.json());

// ================= DB =================
mongoose.connect(process.env.MONGO_URl)
  .then(() => console.log("Mongo Connected ✅"))
  .catch(err => console.log(err));

// ================= FILE =================
const USERS_FILE = "users.json";
const ADMIN_FILE = "admin.json";

// ================= HELPERS =================
function getUsers() {
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function getAdmin() {
  if (!fs.existsSync(ADMIN_FILE)) {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({
      email: "admin@gmail.com",
      password: "admin123"
    }));
  }
  return JSON.parse(fs.readFileSync(ADMIN_FILE));
}

function setAdmin(data) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2));
}

// 🌍 IP TRACK
async function getIP(ip) {
  try {
    let res = await axios.get(`http://ip-api.com/json/${ip}`);
    return {
      ip,
      country: res.data.country || "Unknown"
    };
  } catch {
    return { ip, country: "Unknown" };
  }
}

// ================= SIGNUP =================
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  let users = getUsers();

  if (users.find(u => u.email === email)) {
    return res.json({ msg: "User exists" });
  }

  const hash = await bcrypt.hash(password, 10);

  users.push({
    email,
    password: hash,
    premium: false,
    chats: [],
    earnings: 0,
    country: "Unknown"
  });

  saveUsers(users);

  res.json({ msg: "Signup success" });
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) return res.json({ msg: "User not found" });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.json({ msg: "Wrong password" });

  res.json({
    msg: "Login success",
    token: "user_" + Date.now()
  });
});

// ================= ADMIN LOGIN =================
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;

  let admin = getAdmin();

  if (email === admin.email && password === admin.password) {
    return res.json({
      msg: "Admin login success",
      token: "admin_secure_token"
    });
  }

  res.json({ msg: "Invalid admin" });
});

// ================= USERS =================
app.get("/admin/users", (req, res) => {
  res.json(getUsers());
});

// ================= PREMIUM =================
app.post("/admin/toggle-premium", (req, res) => {
  const { email } = req.body;

  let users = getUsers();

  users = users.map(u => {
    if (u.email === email) u.premium = !u.premium;
    return u;
  });

  saveUsers(users);
  res.json({ msg: "Updated" });
});

// ================= DELETE =================
app.post("/admin/delete-user", (req, res) => {
  const { email } = req.body;

  let users = getUsers().filter(u => u.email !== email);

  saveUsers(users);
  res.json({ msg: "Deleted" });
});

// ================= CLEAR CHAT =================
app.post("/admin/clear-chat", (req, res) => {
  const { email } = req.body;

  let users = getUsers();

  users = users.map(u => {
    if (u.email === email) u.chats = [];
    return u;
  });

  saveUsers(users);
  res.json({ msg: "Cleared" });
});

// ================= EARNING TRACK =================
app.post("/track-earning", (req, res) => {
  const { userId } = req.body;

  let users = getUsers();

  users = users.map(u => {
    if (u.userId === userId) {
      u.earnings = (u.earnings || 0) + 0.02;
    }
    return u;
  });

  saveUsers(users);

  res.json({ msg: "Earning added" });
});

// ================= STATS =================
app.get("/admin/stats", (req, res) => {
  let users = getUsers();

  let total = users.length;
  let premium = users.filter(u => u.premium).length;
  let earnings = users.reduce((sum, u) => sum + (u.earnings || 0), 0);

  let countries = {};
  users.forEach(u => {
    countries[u.country] = (countries[u.country] || 0) + 1;
  });

  res.json({
    totalUsers: total,
    premiumUsers: premium,
    freeUsers: total - premium,
    totalEarnings: earnings.toFixed(2),
    countries
  });
});
app.post("/admin/change-password", (req, res) => {
  const { oldPass, newPass } = req.body;

  let admin = getAdmin();

  if (oldPass !== admin.password) {
    return res.json({ msg: "Wrong old password" });
  }

  admin.password = newPass;
  setAdmin(admin);

  res.json({ msg: "Admin password updated" });
});

// ================= AI =================
app.post("/generate", async (req, res) => {
  const { prompt, userId = "default" } = req.body;

  try {
    // 🔒 safety
    const banned = ["sex","porn","xxx","nude","rape"];
    if (banned.some(w => prompt.toLowerCase().includes(w))) {
      return res.json({
        reply: "Sorry, main is topic par help nahi kar sakta 🙂"
      });
    }

    // 🌍 detect IP + country
    let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    let ipData = await getIP(ip);

    let users = getUsers();

    let user = users.find(u => u.userId === userId);

    if (!user) {
      user = {
        userId,
        email: userId + "@temp.com",
        premium: false,
        chats: [],
        earnings: 0,
        country: ipData.country
      };
      users.push(user);
    }

    user.country = ipData.country;

    saveUsers(users);

    // 🧠 conversation history
    let chat = await Chat.findOne({ userId });

    if (!chat) {
      chat = new Chat({ userId, messages: [] });
    }

    // add user message
    chat.messages.push({
      role: "user",
      content: prompt
    });

    // last 12 messages for memory
    const messages = chat.messages.slice(-12);

    // 🤖 AI CALL (UPGRADED SYSTEM PROMPT)
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.85,
          top_p: 0.95,
          max_tokens: 1000,
          messages: [
            {
              role: "system",
              content: `
You are a highly intelligent, friendly AI assistant like ChatGPT.

🌍 LANGUAGE RULE:
- Detect user's language automatically.
- Reply in SAME language (Hindi, English, Hinglish, Marwadi, etc.)
- If mixed language → reply in natural Hinglish.

💬 STYLE:
- Talk like a real human (not robotic)
- Friendly, engaging, slightly casual
- Use simple words, easy explanations
- Add emotions when needed (🙂🔥😅 but not too many)

🧠 BEHAVIOR:
- Understand user intent deeply
- Give clear, structured answers
- If complex → explain step-by-step
- If simple → short and direct

💡 SMARTNESS:
- If user is confused → simplify
- If user asks code → clean code
- If user asks advice → practical answer

🚫 STRICT RULES:
- No sexual / illegal content
- No harmful advice
- If asked → say:
  "Sorry, main is topic par help nahi kar sakta 🙂"

🎯 GOAL:
Make user feel like they are talking to a real smart human assistant.
              `
            },
            ...messages
          ]
        })
      }
    );

    const data = await response.json();

    let reply =
      data?.choices?.[0]?.message?.content ||
      "⚠️ Thoda issue aa gaya, dobara try karo";

    reply = reply.trim();

    // save reply
    chat.messages.push({
      role: "assistant",
      content: reply
    });

    await chat.save();

    res.json({ reply });

  } catch (err) {
    console.log("AI ERROR:", err);
    res.json({
      reply: "⚠️ Server error, thodi der baad try karo"
    });
  }
});
app.post("/save-chat", (req, res) => {
  const { email, message, reply } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) return res.json({ msg: "User not found" });

  if (!user.chats) user.chats = [];

  user.chats.push({
    message,
    reply,
    time: new Date()
  });

  saveUsers(users);

  res.json({ success: true });
});
app.post("/get-chats", (req, res) => {
  const { email } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  res.json({
    chats: user?.chats || []
  });
});
// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on " + PORT);
});
