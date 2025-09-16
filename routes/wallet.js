// เติมเงินใน wallet

// routes/wallet.js
const express = require('express');
const db = require('../db');
const router = express.Router();

router.post('/topup', async (req, res) => {
    const { userId, amount } = req.body;

    // 1. Validate input
    const topupAmount = parseFloat(amount);
    if (!userId || isNaN(topupAmount) || topupAmount <= 0) {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง, ยอดเงินต้องเป็นตัวเลขที่มากกว่า 0' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 2. Update the user's wallet balance
        await connection.execute(
            "UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?",
            [topupAmount, userId]
        );

        // 3. Get the new balance to return to the client
        const [rows] = await connection.execute(
            "SELECT wallet_balance FROM users WHERE user_id = ?",
            [userId]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' });
        }

        await connection.commit();
        res.status(200).json({
            message: "เติมเงินสำเร็จ",
            newBalance: rows[0].wallet_balance
        });

    } catch (error) {
        await connection.rollback();
        console.error("Top-up Error:", error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเติมเงิน' });
    } finally {
        connection.release();
    }
});

module.exports = router;