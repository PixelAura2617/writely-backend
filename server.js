async function fetchWithRetry(url, options, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      console.log("Retry...", i);
      if (i === retries) throw err;
    }
  }
}

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT ERROR:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("UNHANDLED PROMISE:", err);
});

require ("dotenv").config();
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
  const { prompt } = req.body;

  try {
    const response = await fetch(
     https://api-inference.huggingface.co/models/google/flan-t5-base",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
        }),
      }
    );

    const text = await response.text();
    console.log("RAW RESPONSE:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.json({ reply: text });
    }

    let reply =
      data?.[0]?.generated_text ||
      data?.error ||
      "No response";

    res.json({ reply });

  } catch (error) {
    console.log("ERROR:", error);
    res.json({ reply: "Server error" });
  }
});
  

// IMAGE AI
app.post("/image", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch(
      "https://openrouter.ai/api/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          size: "1024x1024"
        })
      }
    );

    const data = await response.json();

    res.json({
      url: data?.data?.[0]?.url || ""
    });

  } catch (err) {
    res.json({ url: "" });
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
