const express = require('express');
const db = require('../db');
const router = express.Router();

const TICKET_PRICE = 80.00; // กำหนดราคาลอตเตอรี่ตายตัว

// --- Helper function to get the current active round ---
const getActiveRound = async () => {
    const [rows] = await db.execute(
        "SELECT id FROM lotto_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    if (rows.length === 0) {
        // If no active round, create one (optional, good for robustness)
        const [newRound] = await db.execute("INSERT INTO lotto_rounds (status) VALUES ('active')");
        return newRound.insertId;
    }
    return rows[0].id;
};


// --- 1. API สำหรับดูว่าตัวเองซื้อเลขอะไรไปแล้วบ้าง ---
// GET /api/lotto/tickets/mine?userId=1
router.get('/tickets/mine', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ userId' });
    }

    try {
        const activeRoundId = await getActiveRound();
        const [tickets] = await db.execute(
            'SELECT ticket_number, purchased_at FROM lotto_tickets WHERE user_id = ? AND round_id = ? ORDER BY purchased_at DESC',
            [userId, activeRoundId]
        );
        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
    }
});


// --- 2. API สำหรับดูรายการลอตเตอรี่ที่ "ถูกขายไปแล้ว" ---
// GET /api/lotto/tickets/sold
router.get('/tickets/sold', async (req, res) => {
    try {
        const activeRoundId = await getActiveRound();
        const [tickets] = await db.execute(
            'SELECT ticket_number FROM lotto_tickets WHERE round_id = ?',
            [activeRoundId]
        );
        // ส่งกลับไปแค่ array ของตัวเลข
        const soldNumbers = tickets.map(t => t.ticket_number);
        res.json(soldNumbers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
    }
});


// --- 3. API สำหรับซื้อลอตเตอรี่ ---
// POST /api/lotto/tickets/buy
router.post('/tickets/buy', async (req, res) => {
    const { userId, ticket_number } = req.body;

    // --- Basic Validation ---
    if (!userId || !ticket_number) {
        return res.status(400).json({ message: 'กรุณาส่งข้อมูลให้ครบถ้วน (userId, ticket_number)' });
    }
    if (!/^\d{6}$/.test(ticket_number)) {
        return res.status(400).json({ message: 'หมายเลขลอตเตอรี่ต้องเป็นตัวเลข 6 หลักเท่านั้น' });
    }

    const connection = await db.getConnection(); // Get a connection from the pool for transaction
    try {
        await connection.beginTransaction(); // --- START TRANSACTION ---

        const activeRoundId = await getActiveRound();

        // 1. เช็กว่าเลขนี้ถูกขายไปแล้วหรือยัง (Lock a row for checking)
        const [existingTickets] = await connection.execute(
            'SELECT id FROM lotto_tickets WHERE ticket_number = ? AND round_id = ? FOR UPDATE',
            [ticket_number, activeRoundId]
        );

        if (existingTickets.length > 0) {
            await connection.rollback(); // --- ROLLBACK ---
            return res.status(409).json({ message: 'ขออภัย, หมายเลขนี้ถูกขายไปแล้ว' });
        }
        
        // 2. เช็กเงินในกระเป๋าผู้ใช้ (Lock the user row)
        const [users] = await connection.execute(
            'SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE',
            [userId]
        );

        if (users.length === 0) {
            await connection.rollback(); // --- ROLLBACK ---
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้' });
        }

        const user = users[0];
        if (user.wallet_balance < TICKET_PRICE) {
            await connection.rollback(); // --- ROLLBACK ---
            return res.status(402).json({ message: 'ยอดเงินใน Wallet ของคุณไม่เพียงพอ' });
        }

        // 3. ถ้าทุกอย่างผ่าน -> หักเงินและเพิ่มข้อมูลตั๋ว
        await connection.execute(
            'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?',
            [TICKET_PRICE, userId]
        );

        await connection.execute(
            'INSERT INTO lotto_tickets (user_id, round_id, ticket_number) VALUES (?, ?, ?)',
            [userId, activeRoundId, ticket_number]
        );
        
        await connection.commit(); // --- COMMIT TRANSACTION ---
        
        res.status(201).json({ message: `ซื้อลอตเตอรี่หมายเลข ${ticket_number} สำเร็จ!` });

    } catch (error) {
        await connection.rollback(); // --- ROLLBACK on any other error ---
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดร้ายแรงใน Server' });
    } finally {
        connection.release(); // Release connection back to the pool
    }
});


module.exports = router;