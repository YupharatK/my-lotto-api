// routes/admin.js (Updated for new schema)
const express = require('express');
const db = require('../db');
const router = express.Router();

// --- Helper function to check if a user is an admin ---
const isAdmin = async (userId) => {
  if (!userId) return false;
  // CHANGED: Check 'user_id' instead of 'id'
  const [rows] = await db.execute('SELECT role FROM users WHERE user_id = ?', [userId]);
  // CHANGED: Check for 'admin' role
  return rows.length > 0 && rows[0].role === 'admin';
};

// --- API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด ---
// GET /api/admin/users?adminUserId=1
router.get('/users', async (req, res) => {
  const { adminUserId } = req.query;

  if (!(await isAdmin(adminUserId))) {
    return res.status(403).json({ message: 'Permission denied. Admin access required.' });
  }

  try {
    // CHANGED: Select columns based on new schema ('user_id')
    const [users] = await db.execute(
      'SELECT user_id, username,password,wallet_balance, role, created_at FROM users'
    );
    res.status(200).json(users);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
  }
});

// NOTE: Other admin functions like /draw and /reset would also need updates
// to use 'user_id' when interacting with the 'users' table.

module.exports = router;