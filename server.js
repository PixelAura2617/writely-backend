require("dotenv").config();

console.log("ENV CHECK:", process.env.MONGO_URl);

const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URl)
  .then(() => console.log("Mongo Connected ✅"))
  .catch(err => console.log(err));
 
const Chat = require("./models/Chat");

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = "users.json";

// ================= USERS =================
function getUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]");
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// ================= SIGNUP =================
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, msg: "Fill all fields" });
  }

  let users = getUsers();

  // check existing
  if (users.find(u => u.email === email)) {
    return res.json({ success: false, msg: "User already exists" });
  }

  // hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  users.push({
    email,
    password: hashedPassword,
    premium: false,
    chats: []
  });

  saveUsers(users);

  res.json({ success: true, msg: "Signup successful ✅" });
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  let users = getUsers();

  let user = users.find(u => u.email === email);

  if (!user) {
    return res.json({ success: false, msg: "User not found ❌" });
  }

  // compare password
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.json({ success: false, msg: "Wrong password ❌" });
  }

  const token = "user_" + Date.now();

  res.json({
    success: true,
    msg: "Login success ✅",
    token
  });
});

// ================= CHAT =================

// SAVE CHAT
app.post("/save-chat", (req, res) => {
  const { email, message, response } = req.body;

  let users = getUsers();

  users = users.map(u => {
    if (u.email === email) {
      u.chats.push({ message, response });
    }
    return u;
  });

  saveUsers(users);
  res.json({ msg: "Chat saved" });
});

// GET CHAT
app.post("/get-chat", (req, res) => {
  const { email } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) return res.json({ chats: [] });

  res.json({ chats: user.chats || [] });
});

// SEARCH CHAT
app.post("/search-chat", (req, res) => {
  const { email, query } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) return res.json({ results: [] });

  let results = (user.chats || []).filter(c =>
    c.message.toLowerCase().includes(query.toLowerCase())
  );

  res.json({ results });
});

// ================= ADMIN =================

// ADMIN LOGIN
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;

  let admin = getAdmin();

  if (email === admin.email && password === admin.password) {
    return res.json({ msg: "Admin login success" });
  }

  res.json({ msg: "Invalid admin login" });
});

// GET USERS
app.get("/admin/users", (req, res) => {
  res.json(getUsers());
});

// TOGGLE PREMIUM
app.post("/admin/toggle-premium", (req, res) => {
  const { email } = req.body;

  let users = getUsers();

  users = users.map(u => {
    if (u.email === email) {
      u.premium = !u.premium;
    }
    return u;
  });

  saveUsers(users);
  res.json({ msg: "Premium updated" });
});

// DELETE USER
app.post("/admin/delete-user", (req, res) => {
  const { email } = req.body;

  let users = getUsers();
  users = users.filter(u => u.email !== email);

  saveUsers(users);
  res.json({ msg: "User deleted" });
});

// CLEAR CHAT
app.post("/admin/clear-chat", (req, res) => {
  const { email } = req.body;

  let users = getUsers();

  users = users.map(u => {
    if (u.email === email) {
      u.chats = [];
    }
    return u;
  });

  saveUsers(users);
  res.json({ msg: "Chat cleared" });
});

// STATS
app.get("/admin/stats", (req, res) => {
  let users = getUsers();

  let total = users.length;
  let premium = users.filter(u => u.premium).length;

  res.json({
    totalUsers: total,
    premiumUsers: premium,
    freeUsers: total - premium
  });
});

// ================= AI =================
app.post("/generate", async (req, res) => {
  const { prompt, userId = "default" } = req.body;

  try {
    // 🔹 DB se chat load
    let chat = await Chat.findOne({ userId });

    if (!chat) {
      chat = new Chat({ userId, messages: [] });
    }

    // 🔥 undefined fix
    if (!chat.messages) {
      chat.messages = [];
    }

    // 🔹 user msg add
    chat.messages.push({
      role: "user",
      content: prompt
    });

    // 🔹 last 10 msgs only
    const messages = chat.messages.slice(-10);

    // 🔹 API call
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
          temperature: 0.7,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: `{
  role: "system",
  content: `
You are a smart, helpful AI like ChatGPT.

STYLE:
- Talk like a real human (casual, friendly)
- Default language: Hinglish
- Adjust tone based on user (serious / fun / technical)

RULES:
- Give clear, correct answers
- No random or off-topic replies
- If user asks coding → give clean code
- If user is confused → explain simply
- Keep answers useful (not too short, not too long)

BEHAVIOR:
- Understand user intent first
- Maintain conversation context
- Do not repeat same lines again and again
- Sound intelligent but natural

GOAL:
Give helpful, accurate, human-like replies like ChatGPT.
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
      "Bhai thoda issue aa gaya 😅";

    reply = reply.trim();

    // 🔹 assistant reply save
    chat.messages.push({
      role: "assistant",
      content: reply
    });

    // 🔹 DB save
    await chat.save();

    res.json({ reply });

  } catch (err) {
    console.log("ERROR:", err);
    res.json({ reply: "Server error bhai 😓" });
  }
});
// ================= OTP =================

let otpStore = {};

// SEND OTP
app.post("/send-otp", (req, res) => {
  const { email } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) return res.json({ msg: "User not found" });

  let otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[email] = otp;

  console.log("OTP:", otp);

  res.json({ msg: "OTP sent (check console)" });
});

// VERIFY OTP
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (String(otpStore[email]) === String(otp)) {
    return res.json({ msg: "OTP verified" });
  }

  res.json({ msg: "Invalid OTP" });
});

// RESET PASSWORD
app.post("/reset-password", (req, res) => {
  const { email, newPass } = req.body;

  let users = getUsers();

  users = users.map(u => {
    if (u.email === email) {
      u.password = newPass;
    }
    return u;
  });

  saveUsers(users);
  delete otpStore[email];

  res.json({ success: true, msg: "Password reset success" });
});

// ADMIN CHANGE PASSWORD
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
// ================= GOOGLE LOGIN =================
app.post("/google-login", (req, res) => {
  const { email } = req.body;

  let users = getUsers();

  let user = users.find(u => u.email === email);

  if(!user){
    users.push({
      email,
      password: null,
      premium: false
    });
    saveUsers(users);
  }

  const token = "google_" + Date.now();

  res.json({
    success: true,
    token
  });
});
// SAVE CHAT
app.post("/save-chat", (req, res) => {
  const { email, message, reply } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  if (!user) return res.json({ msg: "User not found" });

  user.chats.push({
    message,
    reply,
    time: new Date()
  });

  saveUsers(users);

  res.json({ success: true });
});


// GET CHAT
app.post("/get-chats", (req, res) => {
  const { email } = req.body;

  let users = getUsers();
  let user = users.find(u => u.email === email);

  res.json({ chats: user?.chats || [] });
});
app.post("/get-profile", (req, res) => {
  const { email } = req.body;

  let users = getUsers();

  let user = users.find(u => u.email === email);

  if (!user) {
    return res.json({ success: false, msg: "User not found" });
  }

  res.json({
    success: true,
    email: user.email,
    premium: user.premium
  });
});
app.post("/update-password", async (req, res) => {
  const { email, newPassword } = req.body;

  let users = getUsers();

  let userIndex = users.findIndex(u => u.email === email);

  if (userIndex === -1) {
    return res.json({ success: false, msg: "User not found" });
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  users[userIndex].password = hashed;

  saveUsers(users);

  res.json({ success: true, msg: "Password updated ✅" });
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
