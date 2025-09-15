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

//Api สุ่ม lotto
// ในไฟล์ routes/admin.js

// (ต้องมีฟังก์ชัน isAdmin และ db connection เหมือนเดิม)

router.post('/generate-tickets', async (req, res) => {
    const { adminUserId, count = 100, price = 80.00 } = req.body;

    if (!(await isAdmin(adminUserId))) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    try {
        // --- Step 1: Generate unique 6-digit numbers ---
        const ticketNumbers = new Set();
        while (ticketNumbers.size < count) {
            const randomNumber = String(Math.floor(100000 + Math.random() * 900000));
            ticketNumbers.add(randomNumber);
        }

        // --- Step 2: Prepare data for bulk insert ---
        const values = [...ticketNumbers].map(number => [
            number,
            price,
            'available' // Default status for new tickets
        ]);
        
        // --- Step 3: Insert all new tickets into the database in one query ---
        // NOTE: This uses the `lotto_tickets` table from your newer schema
        const sql = 'INSERT INTO lotto_tickets (ticket_number, price, status) VALUES ?';
        const [result] = await db.query(sql, [values]);

        res.status(201).json({ message: `สร้างสลากใหม่จำนวน ${result.affectedRows} ใบสำเร็จ` });

    } catch (error) {
        console.error("Generate Tickets Error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการสร้างสลาก" });
    }
});

// Api ออกรางวัล
// ในไฟล์ routes/admin.js

// (ต้องมีฟังก์ชัน isAdmin และ db connection เหมือนเดิม)

router.post('/draw', async (req, res) => {
    const { adminUserId } = req.body;
    if (!(await isAdmin(adminUserId))) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // --- Step 1: Generate Winning Numbers ---
        const prize1 = String(Math.floor(100000 + Math.random() * 900000));
        const prize2 = String(Math.floor(100000 + Math.random() * 900000));
        const prize3 = String(Math.floor(100000 + Math.random() * 900000));
        const last3 = prize1.slice(-3);
        const last2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');

        const winningNumbers = { prize1, prize2, prize3, last3, last2 };
        const allWinners = {};

        // Helper function to find winners and update database
        const findAndProcessWinners = async (prizeTypeId, numberToMatch, matchType = 'exact') => {
            let winnersList = [];
            let sqlQuery = '';
            
            // NOTE: Assuming your sold tickets are in `lotto_item`
            if (matchType === 'exact') {
                sqlQuery = `SELECT li.loto_id, li.ticket_number, u.username, u.user_id, pt.reward FROM lotto_item li JOIN users u ON li.userid = u.user_id JOIN prizes_type pt ON pt.ptype_id = ? WHERE li.ticket_number = ?`;
            } else { // 'suffix'
                sqlQuery = `SELECT li.loto_id, li.ticket_number, u.username, u.user_id, pt.reward FROM lotto_item li JOIN users u ON li.userid = u.user_id JOIN prizes_type pt ON pt.ptype_id = ? WHERE li.ticket_number LIKE ?`;
            }

            const matchPattern = matchType === 'exact' ? numberToMatch : `%${numberToMatch}`;
            const [winners] = await connection.execute(sqlQuery, [prizeTypeId, matchPattern]);

            for (const winner of winners) {
                // 1. Record the win in the 'prizes' table
                await connection.execute(
                    'INSERT INTO prizes (lotto_item_id, prizes_type_id) VALUES (?, ?)',
                    [winner.loto_id, prizeTypeId]
                );

                // 2. Add reward to user's wallet
                await connection.execute(
                    'UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?',
                    [winner.reward, winner.user_id]
                );

                winnersList.push({ username: winner.username, ticket_number: winner.ticket_number });
            }
            return winnersList;
        };

        // --- Step 2 & 3: Find winners and process for each prize ---
        // Assuming ptype_id: 1=Prize1, 2=Prize2, 3=Prize3, 4=Last3, 5=Last2
        allWinners.prize1 = await findAndProcessWinners(1, winningNumbers.prize1, 'exact');
        allWinners.prize2 = await findAndProcessWinners(2, winningNumbers.prize2, 'exact');
        allWinners.prize3 = await findAndProcessWinners(3, winningNumbers.prize3, 'exact');
        allWinners.last3 = await findAndProcessWinners(4, winningNumbers.last3, 'suffix');
        allWinners.last2 = await findAndProcessWinners(5, winningNumbers.last2, 'suffix');

        // TODO: Add logic to close the current lotto round

        await connection.commit();
        res.status(200).json({
            message: "การออกรางวัลเสร็จสมบูรณ์",
            winningNumbers: winningNumbers,
            winners: allWinners
        });

    } catch (error) {
        await connection.rollback();
        console.error("Draw Error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการออกรางวัล" });
    } finally {
        connection.release();
    }
});

module.exports = router;