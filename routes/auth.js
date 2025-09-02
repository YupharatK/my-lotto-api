// routes/auth.js (Simplified Version)
const express = require('express');
const db = require('../db'); // import connection pool

const router = express.Router();

// --- API Endpoint: POST /api/auth/register ---
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. ตรวจสอบว่ามีข้อมูลครบถ้วนหรือไม่
    if (!username || !password) {
      return res.status(400).json({ message: 'กรุณากรอก Username และ Password' });
    }

    // 2. บันทึกผู้ใช้ใหม่ลงฐานข้อมูล (เก็บรหัสผ่านเป็น Plain Text)
    const [result] = await db.execute(
      'INSERT INTO users (username, password, wallet_balance) VALUES (?, ?, ?)',
      [username, password, 500.00] // เก็บ password ที่รับมาตรงๆ เลย
    );

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', userId: result.insertId });

  } catch (error) {
    // ดักจับ error กรณี username ซ้ำ
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

        // 1. ตรวจสอบว่ามีผู้ใช้นี้ในระบบหรือไม่
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ message: 'Username หรือ Password ไม่ถูกต้อง' });
        }

        // 2. เปรียบเทียบรหัสผ่านแบบตรงๆ (Plain Text Comparison)
        if (password !== user.password) {
            return res.status(401).json({ message: 'Username หรือ Password ไม่ถูกต้อง' });
        }
        
        // 3. ถ้าถูกต้อง ส่งข้อมูล user กลับไปเลย ไม่ต้องสร้าง Token
        // (เราจะลบ field password ออกก่อนส่งกลับไปเพื่อความปลอดภัยเล็กน้อย)
        delete user.password; 
        res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
    }
});

// --- API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด ---
// GET /api/admin/users?adminUserId=1
router.get('/users', async (req, res) => {
    const { adminUserId } = req.query;

    // 1. ตรวจสอบสิทธิ์แอดมิน
    if (!(await isAdmin(adminUserId))) {
        return res.status(403).json({ message: 'Permission denied. Admin access required.' });
    }

    try {
        // 2. ดึงข้อมูลผู้ใช้ทั้งหมดจากฐานข้อมูล (ไม่เอารหัสผ่าน)
        const [users] = await db.execute(
            'SELECT id, username, wallet_balance, role, created_at FROM users'
        );
        res.status(200).json(users);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
    }
});


module.exports = router;