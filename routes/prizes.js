// routes/prizes.js
// ขี้นเงินรางวัล
const express = require('express');
const db = require('../db');
const router = express.Router();

// routes/prizes.js

router.post('/claim', async (req, res) => {
    const { userId, lottoItemId } = req.body;

    if (!userId || !lottoItemId) {
        return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if this is a real winning ticket, get its status and reward amount
        const [prizes] = await connection.execute(
            `SELECT 
                li.status, 
                pt.reward 
             FROM prizes p
             JOIN lotto_item li ON p.lotto_item_id = li.loto_id
             JOIN prizes_type pt ON p.prizes_type = pt.ptype_id
             WHERE p.lotto_item_id = ? AND li.userid = ?`,
            [lottoItemId, userId]
        );

        if (prizes.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'ไม่พบข้อมูลการถูกรางวัลสำหรับสลากใบนี้' });
        }
        
        const prizeInfo = prizes[0];

        // 2. Check if it's already claimed
        if (prizeInfo.status === 'claimed') {
            await connection.rollback();
            return res.status(409).json({ message: 'สลากใบนี้ถูกขึ้นเงินรางวัลไปแล้ว' });
        }

        // --- All checks passed, proceed with claiming ---

        // 3. ADDED: Add reward to user's wallet
        await connection.execute(
            "UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?",
            [prizeInfo.reward, userId]
        );

        // 4. Mark the ticket as claimed
        await connection.execute(
            "UPDATE lotto_item SET status = 'claimed' WHERE loto_id = ?",
            [lottoItemId]
        );
        
        await connection.commit();
        res.status(200).json({ message: `ขึ้นเงินรางวัลจำนวน ${prizeInfo.reward} บาทสำเร็จ` });

    } catch (error) {
        await connection.rollback();
        console.error("Claim Prize Error:", error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการขึ้นเงินรางวัล' });
    } finally {
        connection.release();
    }
});

module.exports = router;