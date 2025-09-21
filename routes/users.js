const express = require('express');
const db = require('../db');
const router = express.Router();

// GET - ดึงสลากทั้งหมดของผู้ใช้พร้อมข้อมูลรางวัล (ถ้ามี)
router.get('/:userId/tickets', async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ message: 'กรุณาระบุ User ID' });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // ใช้ชื่อคอลัมน์ตาม schema จริง ๆ: pt.name และ pt.reward (varchar)
    // แปลง reward เป็นตัวเลขด้วย CAST (... AS DOUBLE) ให้ฝั่งแอปใช้สะดวก
    const sqlQuery = `
      SELECT
        lt.ticket_number,
        pt.name   AS prize_name,
        CAST(pt.reward AS DOUBLE) AS reward
      FROM lotto_item li
      JOIN lotto_tickets lt   ON li.ticket_id    = lt.id
      LEFT JOIN prizes p      ON li.loto_id      = p.lotto_item_id
      LEFT JOIN prizes_type pt ON p.prizes_type  = pt.ptype_id
      WHERE li.userid = ?
      ORDER BY lt.ticket_number;
    `;

    const [rows] = await connection.execute(sqlQuery, [userId]);

    const formatted = rows.map(r => ({
      ticket_number: r.ticket_number,
      is_winner: r.prize_name !== null,   // มีชื่อรางวัล = ถูกรางวัล
      prize_name: r.prize_name,           // null ถ้าไม่ถูกรางวัล
      reward: r.prize_name !== null ? r.reward : null // ตัวเลข (DOUBLE) หรือ null
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error('Get user tickets error:', err?.code, err?.sqlMessage || err?.message);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสลาก' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
