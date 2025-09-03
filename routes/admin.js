// routes/admin.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// --- Helper function to check if a user is an admin ---
const isAdmin = async (userId) => {
    if (!userId) return false;
    const [rows] = await db.execute('SELECT role FROM users WHERE user_id = ?', [userId]); // << แก้เป็นชื่อที่ถูกต้อง
    return rows.length > 0 && rows[0].role === 'admin';
};

// --- Helper function to get the current active round ID ---
const getActiveRoundId = async (connection) => {
    const [rows] = await connection.execute("SELECT id FROM lotto_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1");
    return rows.length > 0 ? rows[0].id : null;
};

// --- API สำหรับการออกรางวัล ---
router.post('/draw', async (req, res) => {
    // ... (โค้ดส่วนนี้เหมือนเดิม)
});

// --- API สำหรับการรีเซ็ตระบบ (เริ่มรอบใหม่) ---
router.post('/reset', async (req, res) => {
    // ... (โค้ดส่วนนี้เหมือนเดิม)
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