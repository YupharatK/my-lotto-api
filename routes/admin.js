const express = require('express');
const db = require('../db');
const router = express.Router();

// --- Helper function to check if a user is an admin ---
const isAdmin = async (userId) => {
    if (!userId) return false;
    const [rows] = await db.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows.length > 0 && rows[0].role === 'admin';
};

// --- Helper function to get the current active round ID ---
const getActiveRoundId = async (connection) => {
    const [rows] = await connection.execute(
        "SELECT id FROM lotto_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    );
    return rows.length > 0 ? rows[0].id : null;
};

// --- 1. API สำหรับการออกรางวัล ---
// POST /api/admin/draw
router.post('/draw', async (req, res) => {
    const { adminUserId } = req.body;

    // 1. Verify if the user is an admin
    if (!(await isAdmin(adminUserId))) {
        return res.status(403).json({ message: 'Permission denied. Admin access required.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction(); // --- START TRANSACTION ---

        const activeRoundId = await getActiveRoundId(connection);
        if (!activeRoundId) {
            await connection.rollback();
            return res.status(404).json({ message: 'ไม่พบรอบลอตเตอรี่ที่กำลังเปิดใช้งาน' });
        }

        // 2. Get all sold tickets for the current round
        const [soldTickets] = await connection.execute(
            'SELECT ticket_number, user_id FROM lotto_tickets WHERE round_id = ?',
            [activeRoundId]
        );

        if (soldTickets.length < 5) {
            await connection.rollback();
            return res.status(400).json({ message: `มีลอตเตอรี่ขายไปเพียง ${soldTickets.length} ใบ ไม่สามารถออกรางวัล 5 อันดับได้` });
        }
        
        // 3. Randomly select 5 unique winners
        const winners = [];
        const prizeAmounts = [10000, 5000, 2000, 1000, 500]; // Prize for Rank 1 to 5
        const shuffledTickets = [...soldTickets].sort(() => 0.5 - Math.random());
        const winningTickets = shuffledTickets.slice(0, 5);

        // 4. Process each winner
        for (let i = 0; i < winningTickets.length; i++) {
            const ticket = winningTickets[i];
            const rank = i + 1;
            const prizeAmount = prizeAmounts[i];

            // Add prize money to winner's wallet
            await connection.execute(
                'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?',
                [prizeAmount, ticket.user_id]
            );

            // Record the prize
            await connection.execute(
                'INSERT INTO prizes (round_id, winning_ticket_number, rank, prize_amount, winner_id) VALUES (?, ?, ?, ?, ?)',
                [activeRoundId, ticket.ticket_number, rank, prizeAmount, ticket.user_id]
            );

            winners.push({ rank, winning_ticket_number: ticket.ticket_number, prize_amount: prizeAmount, winner_id: ticket.user_id });
        }

        // 5. Close the current round
        await connection.execute(
            "UPDATE lotto_rounds SET status = 'closed', end_date = NOW() WHERE id = ?",
            [activeRoundId]
        );

        await connection.commit(); // --- COMMIT TRANSACTION ---
        res.status(200).json({ message: 'ออกรางวัลสำเร็จ!', winners });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
    } finally {
        connection.release();
    }
});


// --- 2. API สำหรับการรีเซ็ตระบบ (เริ่มรอบใหม่) ---
// POST /api/admin/reset
router.post('/reset', async (req, res) => {
    const { adminUserId } = req.body;

    // 1. Verify if the user is an admin
    if (!(await isAdmin(adminUserId))) {
        return res.status(403).json({ message: 'Permission denied. Admin access required.' });
    }
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const activeRoundId = await getActiveRoundId(connection);

        // 2. Close the current active round if it exists
        if (activeRoundId) {
            await connection.execute(
                "UPDATE lotto_rounds SET status = 'closed', end_date = NOW() WHERE id = ?",
                [activeRoundId]
            );
        }

        // 3. Start a new round
        await connection.execute("INSERT INTO lotto_rounds (status, start_date) VALUES ('active', NOW())");

        await connection.commit();
        res.status(200).json({ message: 'ระบบถูกรีเซ็ตและเริ่มรอบใหม่เรียบร้อยแล้ว' });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดใน Server' });
    } finally {
        connection.release();
    }
});


module.exports = router;