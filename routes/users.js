const express = require('express');
const db = require('../db'); // mysql2/promise pool
const router = express.Router();

// GET /users/:userId/tickets
router.get('/:userId/tickets', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ message: 'กรุณาระบุ User ID' });

  let connection;
  try {
    connection = await db.getConnection();

    const sql = `
      SELECT
        li.loto_id                          AS lotto_item_id,
        lt.ticket_number                    AS ticket_number,
        li.status                           AS status,
        li.draw_date                        AS draw_date,
        pt.name                             AS prize_name,
        COALESCE(pt.reward, 0)              AS reward,
        CASE WHEN p.lotto_item_id IS NOT NULL THEN 1 ELSE 0 END AS is_winner
      FROM lotto_item li
      JOIN lotto_tickets lt
        ON li.ticket_id = lt.id
      LEFT JOIN prizes p
        ON p.lotto_item_id = li.loto_id
      LEFT JOIN prizes_type pt
        ON p.prizes_type = pt.ptype_id
      WHERE li.userid = ?
      ORDER BY li.loto_id DESC;
    `;

    const [rows] = await connection.execute(sql, [userId]);

    const out = rows.map(r => ({
      lotto_item_id : r.lotto_item_id,
      ticket_number : r.ticket_number,
      status        : r.status,
      draw_date     : r.draw_date,           // ถ้าอยากให้เป็น string เสมอ ดูหมายเหตุข้อ 4
      is_winner     : !!r.is_winner,
      prize_name    : r.prize_name || null,
      reward        : Number(r.reward || 0),
    }));

    return res.status(200).json(out);
  } catch (err) {
    console.error('Get user tickets error:', err);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสลาก' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;  
