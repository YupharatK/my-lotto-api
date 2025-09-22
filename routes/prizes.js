// routes/prizes.js (ฉบับแก้ไขล่าสุด)
const express = require('express');
const db = require('../db');
const router = express.Router();

router.post('/claim', async (req, res) => {
    const { userId, ticketNumber } = req.body;

    if (!userId || !ticketNumber) {
        return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // ค้นหา loto_id จาก ticket_id และ userid
        const [lottoItems] = await connection.execute(
            // --- จุดที่แก้ไขล่าสุด ---
            `SELECT loto_id FROM lotto_item WHERE userid = ? AND ticket_id = ?`,
            [userId, ticketNumber]
        );

        if (lottoItems.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'ไม่พบสลากหมายเลขนี้ของคุณ' });
        }
        
        const lottoItemId = lottoItems[0].loto_id;

        // ตรวจสอบข้อมูลการถูกรางวัล
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

        if (prizeInfo.status === 'claimed') {
            await connection.rollback();
            return res.status(409).json({ message: 'สลากใบนี้ถูกขึ้นเงินรางวัลไปแล้ว' });
        }

        // เพิ่มเงินเข้า Wallet
        await connection.execute(
            "UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?",
            [prizeInfo.reward, userId]
        );

        // ดึงยอดเงินใหม่
        const [[user]] = await connection.execute(
          "SELECT wallet_balance FROM users WHERE user_id = ?",
          [userId]
        );
        const newBalance = user.wallet_balance;

        // อัปเดตสถานะสลาก
        await connection.execute(
            "UPDATE lotto_item SET status = 'claimed' WHERE loto_id = ?",
            [lottoItemId]
        );
        
        await connection.commit();

        res.status(200).json({ 
            message: `ขึ้นเงินรางวัลจำนวน ${prizeInfo.reward} บาทสำเร็จ`,
            newBalance: newBalance 
        });

    } catch (error) {
        await connection.rollback();
        console.error("Claim Prize Error:", error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการขึ้นเงินรางวัล' });
    } finally {
        connection.release();
    }
});

module.exports = router;