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

    // CHANGED: Select specific columns and use 'user_id'
    const [rows] = await db.execute(
      'SELECT user_id, email, wallet_balance, role FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];

    // NOTE: This assumes plaintext password comparison as per previous agreement
    const [passwordCheck] = await db.execute('SELECT password FROM users WHERE email = ?', [email]);

    if (!user || password !== passwordCheck[0].password) {
      return res.status(401).json({ message: 'email หรือ Password ไม่ถูกต้อง' });
    }

    res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: user });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
  }
});

module.exports = router;