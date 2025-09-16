// routes/lotto.js
//ซื้อ lotto
const express = require('express');
const db = require('../db');
const router = express.Router();

router.post('/purchase', async (req, res) => {
    const { userId, ticketNumber } = req.body;

    if (!userId || !ticketNumber) {
        return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Find the ticket and check if it's available, locking the row
        const [tickets] = await connection.execute(
            "SELECT id, price, status FROM lotto_tickets WHERE ticket_number = ? FOR UPDATE",
            [ticketNumber]
        );

        if (tickets.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'ไม่พบสลากหมายเลขนี้' });
        }
        
        const ticket = tickets[0];
        if (ticket.status !== 'available') {
            await connection.rollback();
            return res.status(409).json({ message: 'สลากหมายเลขนี้ถูกขายไปแล้ว' });
        }

        // 2. Check user's wallet balance, locking the row
        const [users] = await connection.execute(
            "SELECT wallet_balance FROM users WHERE user_id = ? FOR UPDATE",
            [userId]
        );

        const user = users[0];
        if (user.wallet_balance < ticket.price) {
            await connection.rollback();
            return res.status(402).json({ message: 'ยอดเงินใน Wallet ไม่เพียงพอ' });
        }

        // --- All checks passed, proceed with purchase ---

        // 3. Deduct money from user's wallet
        await connection.execute(
            "UPDATE users SET wallet_balance = wallet_balance - ? WHERE user_id = ?",
            [ticket.price, userId]
        );

        // 4. Mark the ticket as 'sold'
        await connection.execute(
            "UPDATE lotto_tickets SET status = 'sold' WHERE id = ?",
            [ticket.id]
        );
        
        // 5. Create a record in lotto_item to link user and ticket
        // Assuming lotto_item's `ticket_id` is the foreign key to lotto_tickets' `id`
        await connection.execute(
            "INSERT INTO lotto_item (userid, ticket_id, purchased_at) VALUES (?, ?, NOW())",
            [userId, ticket.id]
        );

        await connection.commit();
        res.status(200).json({ message: `ซื้อสลากหมายเลข ${ticketNumber} สำเร็จ` });

    } catch (error) {
        await connection.rollback();
        console.error("Purchase Error:", error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการซื้อสลาก' });
    } finally {
        connection.release();
    }
});

//

module.exports = router;