const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: "*" }));
app.use(express.json());

/* ================= MONGODB ================= */
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

/* ================= SCHEMA ================= */
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,

  otp: String,
  otpExpires: Date,
  verified: { type: Boolean, default: false }
});

userSchema.index({ email: 1, role: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);

/* ================= MAILER ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

/* ================= HEALTH CHECK ================= */
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* =====================================================
   STUDENT ROUTES
===================================================== */

app.post("/api/student/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existing = await User.findOne({ email, role: "student" });
    if (existing) {
      return res.status(409).json({ message: "Student already exists" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const user = new User({
      name,
      email,
      password,
      role: "student",
      otp,
      otpExpires: Date.now() + 5 * 60 * 1000
    });

    await user.save();

    console.log("📧 Sending student OTP email...");
    transporter.sendMail({
      from: `"ETCE Portal" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "ETCE Student Registration OTP",
      html: `
        <h2>Welcome to ETCE Department</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes.</p>
      `
    }).then(() => {
      console.log("✅ Student OTP email sent");
    }).catch(err => {
      console.error("❌ Student email error:", err);
    });

    res.json({ message: "OTP sent to email" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/student/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    role: "student",
    otp,
    otpExpires: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  user.verified = true;
  user.otp = null;
  user.otpExpires = null;

  await user.save();
  res.json({ message: "Email verified successfully" });
});

app.post("/api/student/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  const user = await User.findOne({ email, password, role: "student" });

  if (!user) {
    return res.status(401).json({ message: "Invalid student credentials" });
  }

  if (!user.verified) {
    return res.status(403).json({ message: "Please verify email first" });
  }

  res.json({
    message: "Student login successful",
    user: { name: user.name, email: user.email }
  });
});

/* =====================================================
   FACULTY ROUTES
===================================================== */

app.post("/api/faculty/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const exists = await User.findOne({ email, role: "faculty" });
    if (exists) {
      return res.status(409).json({ message: "Faculty already exists" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const user = new User({
      name,
      email,
      password,
      role: "faculty",
      otp,
      otpExpires: Date.now() + 5 * 60 * 1000
    });

    await user.save();

    console.log("📧 Sending faculty OTP email...");
    transporter.sendMail({
      from: `"ETCE Portal" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "ETCE Faculty Email Verification",
      html: `
        <h2>ETCE Faculty Registration</h2>
        <p><strong>Name:</strong> ${name}</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes.</p>
      `
    }).then(() => {
      console.log("✅ Faculty OTP email sent");
    }).catch(err => {
      console.error("❌ Faculty email error:", err);
    });

    res.json({ message: "Faculty OTP sent to email" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

app.post("/api/faculty/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    role: "faculty",
    otp,
    otpExpires: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  user.verified = true;
  user.otp = null;
  user.otpExpires = null;

  await user.save();
  res.json({ message: "Faculty email verified successfully" });
});

app.post("/api/faculty/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  const user = await User.findOne({ email, password, role: "faculty" });

  if (!user) {
    return res.status(401).json({ message: "Invalid faculty credentials" });
  }

  if (!user.verified) {
    return res.status(403).json({ message: "Please verify your email first" });
  }

  res.json({
    message: "Faculty login successful",
    user: { name: user.name, email: user.email }
  });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});



