// routes/admin.js (Updated for new schema)
const express = require("express");
const db = require("../db");
const router = express.Router();

// --- Helper function to check if a user is an admin ---
const isAdmin = async (userId) => {
  if (!userId) return false;
  // CHANGED: Check 'user_id' instead of 'id'
  const [rows] = await db.execute("SELECT role FROM users WHERE user_id = ?", [
    userId,
  ]);
  // CHANGED: Check for 'admin' role
  return rows.length > 0 && rows[0].role === "admin";
};

// --- API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด ---
// GET /api/admin/users?adminUserId=1
router.get("/users", async (req, res) => {
  const { adminUserId } = req.query;

  if (!(await isAdmin(adminUserId))) {
    return res
      .status(403)
      .json({ message: "Permission denied. Admin access required." });
  }

  try {
    // CHANGED: Select columns based on new schema ('user_id')
    const [users] = await db.execute(
      "SELECT user_id, username,password,wallet_balance, role, created_at FROM users"
    );
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดใน Server" });
  }
});

// NOTE: Other admin functions like /draw and /reset would also need updates
// to use 'user_id' when interacting with the 'users' table.

//Api สุ่ม lotto
// ในไฟล์ routes/admin.js

// (ต้องมีฟังก์ชัน isAdmin และ db connection เหมือนเดิม)

router.post("/generate-tickets", async (req, res) => {
  const { adminUserId, count = 100, price = 80.0 } = req.body;

  if (!(await isAdmin(adminUserId))) {
    return res.status(403).json({ message: "Permission denied" });
  }

  try {
    // --- Step 1: Generate unique 6-digit numbers ---
    const ticketNumbers = new Set();
    while (ticketNumbers.size < count) {
      const randomNumber = String(Math.floor(100000 + Math.random() * 900000));
      ticketNumbers.add(randomNumber);
    }

    // --- Step 2: Prepare data for bulk insert ---
    const values = [...ticketNumbers].map((number) => [
      number,
      price,
      "available", // Default status for new tickets
    ]);

    // --- Step 3: Insert all new tickets into the database in one query ---
    // NOTE: This uses the `lotto_tickets` table from your newer schema
    const sql =
      "INSERT INTO lotto_tickets (ticket_number, price, status) VALUES ?";
    const [result] = await db.query(sql, [values]);

    res
      .status(201)
      .json({ message: `สร้างสลากใหม่จำนวน ${result.affectedRows} ใบสำเร็จ` });
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

        // ===================================================
        // >>  ประกาศฟังก์ชันผู้ช่วย (Helper Function) ไว้ตรงนี้ <<
        // ===================================================
        const findAndProcessWinners = async (connection, prizeTypeId, numberToMatch, matchType = 'exact') => {
            let winnersList = [];
            const sqlQuery = `
                SELECT 
                    li.loto_id, 
                    lt.ticket_number, 
                    u.username, 
                    u.user_id, 
                    pt.reward 
                FROM 
                    lotto_item li 
                    JOIN users u ON li.userid = u.user_id 
                    JOIN prizes_type pt ON pt.ptype_id = ? 
                    JOIN lotto_tickets lt ON li.ticket_id = lt.id 
                WHERE 
                    lt.ticket_number ${matchType === 'exact' ? '= ?' : 'LIKE ?'}
            `;
            const matchPattern = matchType === 'exact' ? numberToMatch : `%${numberToMatch}`;
            const [winners] = await connection.execute(sqlQuery, [prizeTypeId, matchPattern]);

            for (const winner of winners) {
                // บันทึกการถูกรางวัลลงในตาราง prizes
                await connection.execute("INSERT INTO prizes (lotto_item_id, prizes_type_id) VALUES (?, ?)", [winner.loto_id, prizeTypeId]);
                
                // (เราได้ย้ายการจ่ายเงินไปไว้ที่ API claim แล้ว)

                winnersList.push({ username: winner.username, ticket_number: winner.ticket_number });
            }
            return winnersList;
        };
        // ===================================================

        // 1. Generate all 5 winning numbers
        const prize1 = String(Math.floor(100000 + Math.random() * 900000));
        const prize2 = String(Math.floor(100000 + Math.random() * 900000));
        const prize3 = String(Math.floor(100000 + Math.random() * 900000));
        const last3 = prize1.slice(-3);
        const last2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        const winningNumbers = { prize1, prize2, prize3, last3, last2 };

        // 2. Save the results to the 'draw_results' table
        await connection.execute(
            'INSERT INTO draw_results (prize1_number, prize2_number, prize3_number, last3_number, last2_number) VALUES (?, ?, ?, ?, ?)',
            [prize1, prize2, prize3, last3, last2]
        );

        // 3. Find winners for all prizes by calling the helper function
        const allWinners = {};
        allWinners.prize1 = await findAndProcessWinners(connection, 1, winningNumbers.prize1, 'exact');
        allWinners.prize2 = await findAndProcessWinners(connection, 2, winningNumbers.prize2, 'exact');
        allWinners.prize3 = await findAndProcessWinners(connection, 3, winningNumbers.prize3, 'exact');
        allWinners.last3 = await findAndProcessWinners(connection, 4, winningNumbers.last3, 'suffix');
        allWinners.last2 = await findAndProcessWinners(connection, 5, winningNumbers.last2, 'suffix');

        await connection.commit();
        res.status(200).json({
            message: "การออกรางวัลเสร็จสมบูรณ์",
            winningNumbers,
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



//Api รีเซ็ตระบบสุ่มเลข 100  //
router.post('/reset-system', async (req, res) => {
    const { adminUserId } = req.body;
    if (!(await isAdmin(adminUserId))) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // --- 1. Clear ALL data for a full reset ---
        await connection.execute("DELETE FROM prizes");
        await connection.execute("DELETE FROM lotto_item");
        await connection.execute("DELETE FROM lotto_tickets");
        await connection.execute("DELETE FROM draw_results"); // ADDED: Clear prize history

        // --- 2. REMOVED: The ticket generation logic is gone ---

        await connection.commit();
        res.status(200).json({ message: `รีเซ็ตระบบ ล้างข้อมูลสลากและผลรางวัลทั้งหมดสำเร็จ` });

    } catch (error) {
        await connection.rollback();
        console.error("System Reset Error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการรีเซ็ตระบบ" });
    } finally {
        connection.release();
    }
});
module.exports = router;
