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
    // ... (ส่วนโค้ดด้านบนเหมือนเดิมทั้งหมด) ...
    const { adminUserId, drawType = 'sold' } = req.body; // แก้ไข default เป็น sold
    if (!(await isAdmin(adminUserId))) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const findAndProcessWinners = async (connection, prizeTypeId, numberToMatch, matchType = 'exact') => {
            let winnersList = [];
            // SQL Query ถูกต้องแล้ว แต่แก้ไขเล็กน้อยให้ตรงตาม backend ที่คุณใช้
            const sqlQuery = `
                SELECT li.loto_id, lt.ticket_number, u.username, u.user_id, pt.reward 
                FROM lotto_item li 
                JOIN users u ON li.userid = u.user_id 
                JOIN prizes_type pt ON pt.ptype_id = ? 
                JOIN lotto_tickets lt ON li.ticket_id = lt.id 
                WHERE lt.ticket_number ${matchType === 'exact' ? '= ?' : 'LIKE ?'}
            `;

            // แก้ไข matchType สำหรับ LIKE ให้ถูกต้อง
            const matchPattern = matchType === 'exact' ? numberToMatch : `%${numberToMatch}`;
            const [winners] = await connection.execute(sqlQuery, [prizeTypeId, matchPattern]);

            for (const winner of winners) {
                await connection.execute("INSERT INTO prizes (lotto_item_id, prizes_type) VALUES (?, ?)", [winner.loto_id, prizeTypeId]);
                winnersList.push({ username: winner.username, ticket_number: winner.ticket_number });
            }
            return winnersList;
        };

        let winningNumbers = {};
        const allWinners = {};

        if (drawType === 'sold') { // 'from_sold' ในโค้ดเก่า, Flutter ส่ง 'sold'
            const [soldTickets] = await connection.execute(
                "SELECT lt.ticket_number FROM lotto_item li JOIN lotto_tickets lt ON li.ticket_id = lt.id"
            );

            if (soldTickets.length < 5) {
                await connection.rollback();
                return res.status(400).json({ message: `มีสลากขายไปเพียง ${soldTickets.length} ใบ ไม่สามารถออกรางวัลได้` });
            }

            const shuffledTickets = [...soldTickets].sort(() => 0.5 - Math.random());
            const winningTickets = shuffledTickets.slice(0, 5);

            winningNumbers = {
                prize1: winningTickets[0].ticket_number,
                prize2: winningTickets[1].ticket_number,
                prize3: winningTickets[2].ticket_number,
                last3: winningTickets[0].ticket_number.slice(-3),
                last2: winningTickets[3].ticket_number.slice(-2),
            };

        } else { // 'all'
            const prize1 = String(Math.floor(100000 + Math.random() * 900000));
            const prize2 = String(Math.floor(100000 + Math.random() * 900000));
            const prize3 = String(Math.floor(100000 + Math.random() * 900000));
            const last3 = prize1.slice(-3);
            const last2 = String(Math.floor(Math.random() * 100)).padStart(2, "0");
            winningNumbers = { prize1, prize2, prize3, last3, last2 };
        }

        allWinners.prize1 = await findAndProcessWinners(connection, 1, winningNumbers.prize1, "exact");
        allWinners.prize2 = await findAndProcessWinners(connection, 2, winningNumbers.prize2, "exact");
        allWinners.prize3 = await findAndProcessWinners(connection, 3, winningNumbers.prize3, "exact");
        allWinners.last3 = await findAndProcessWinners(connection, 4, winningNumbers.last3, "suffix"); // แก้เป็น suffix
        allWinners.last2 = await findAndProcessWinners(connection, 5, winningNumbers.last2, "suffix"); // แก้เป็น suffix

        // --- เพิ่มส่วนนี้ ---
        // V V V V V V V V V V V
        const insertDrawSql = `
            INSERT INTO draw_results 
            (draw_date, prize1_number, prize2_number, prize3_number, last3_number, last2_number) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const drawValues = [
            new Date(), // วันที่และเวลาปัจจุบัน
            winningNumbers.prize1,
            winningNumbers.prize2,
            winningNumbers.prize3,
            winningNumbers.last3,
            winningNumbers.last2
        ];
        await connection.execute(insertDrawSql, drawValues);
        // ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^
        // --- สิ้นสุดส่วนที่เพิ่ม ---

        await connection.commit();
        res.status(200).json({
            message: `การออกรางวัลแบบ '${drawType}' เสร็จสมบูรณ์`,
            winningNumbers: winningNumbers,
            winners: allWinners,
        });

    } catch (error) {
        // ... (ส่วน catch และ finally เหมือนเดิม) ...
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

// GET - ดึงผลรางวัลงวดล่าสุด
router.get('/results/latest', async (req, res) => {
    const connection = await db.getConnection();
    try {
        const sqlQuery = `
            SELECT * FROM draw_results 
            ORDER BY draw_date DESC 
            LIMIT 1
        `;
        const [results] = await connection.execute(sqlQuery);

        if (results.length === 0) {
            return res.status(404).json({ message: 'ยังไม่มีข้อมูลผลการออกรางวัล' });
        }
        
        // ส่งข้อมูลผลรางวัลล่าสุดกลับไป
        res.status(200).json(results[0]);

    } catch (error) {
        console.error("Get Latest Results Error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูล" });
    } finally {
        connection.release();
    }
});
module.exports = router;
