// routes/auth.js (Updated for new schema)
const express = require('express');
const db = require('../db');
const router = express.Router();

// --- API Endpoint: POST /api/auth/register ---
router.post('/register', async (req, res) => {
  try {
    // แก้ไขตรงนี้
    const { username, email, password, wallet_balance } = req.body;

    if (!username || !email || !password || wallet_balance === undefined) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }
    
    const amount = parseFloat(wallet_balance);
    if (isNaN(amount) || amount < 100) {
      return res.status(400).json({ message: 'ยอดเงินเริ่มต้นต้องเป็นตัวเลขและไม่ต่ำกว่า 100' });
    }

    const defaultRole = 'user';

    const [result] = await db.execute(
      'INSERT INTO users (username, email, password, wallet_balance, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, password, amount, defaultRole]
    );

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', userId: result.insertId }); 

  } catch (error) {
    // ... (error handling)
  }
});

// --- API Endpoint: POST /api/auth/login ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. ดึงข้อมูลทั้งหมดของ user ที่ต้องการในครั้งเดียว
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];

    // 2. ตรวจสอบว่ามี user หรือไม่ และรหัสผ่านตรงกันหรือไม่
    if (!user || password !== user.password) {
      return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    // 3. ลบรหัสผ่านออกจาก object ก่อนส่งกลับไป (เพื่อความปลอดภัย)
    delete user.password;

    // 4. ส่งข้อมูลกลับในรูปแบบที่ Flutter ต้องการ
    res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: user });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
  }
});

module.exports = router;