// routes/auth.js (Updated for new schema)
const express = require('express');
const db = require('../db');
const router = express.Router();

// --- API Endpoint: POST /api/auth/register ---
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'กรุณากรอก Username และ Password' });
    }

    // CHANGED: Set default role to 'user'
    const defaultRole = 'user'; 
    const initialWallet = 500.00;

    const [result] = await db.execute(
      'INSERT INTO users (username, password, wallet_balance, role) VALUES (?, ?, ?, ?)',
      [username, password, initialWallet, defaultRole]
    );

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', userId: result.insertId });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Username นี้มีผู้ใช้งานแล้ว' });
    }
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
  }
});

// --- API Endpoint: POST /api/auth/login ---
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // CHANGED: Select specific columns and use 'user_id'
    const [rows] = await db.execute(
      'SELECT user_id, username, wallet_balance, role FROM users WHERE username = ?',
      [username]
    );
    const user = rows[0];

    // NOTE: This assumes plaintext password comparison as per previous agreement
    const [passwordCheck] = await db.execute('SELECT password FROM users WHERE username = ?', [username]);

    if (!user || password !== passwordCheck[0].password) {
      return res.status(401).json({ message: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: user });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
  }
});

module.exports = router;