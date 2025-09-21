const express = require('express');
const db = require('../db');
const router = express.Router();

// GET - ดึงสลากทั้งหมดของผู้ใช้ พร้อมบอกว่าถูกรางวัล/ชื่อรางวัล/ยอดเงิน
router.get('/:userId/tickets', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ message: 'กรุณาระบุ User ID' });

  let connection;
  try {
    connection = await db.getConnection();

    const sql = `
      SELECT
        li.loto_id                    AS lotto_item_id,
        lt.id                         AS ticket_id,
        lt.ticket_number,
        CAST(lt.price AS DECIMAL(10,2)) AS price,
        li.status                     AS item_status,
        DATE_FORMAT(li.purchased_at, '%Y-%m-%d %H:%i:%s') AS purchased_at,
        pt.name                       AS prize_name,
        CAST(REPLACE(pt.reward, ',', '') AS DECIMAL(18,2)) AS reward
      FROM lotto_item li
      JOIN lotto_tickets lt  ON li.ticket_id     = lt.id
      LEFT JOIN prizes p     ON p.lotto_item_id  = li.loto_id
      LEFT JOIN prizes_type pt ON pt.ptype_id    = p.prizes_type
      WHERE li.userid = ?
      ORDER BY li.purchased_at DESC, lt.ticket_number;
    `;

    const [rows] = await connection.execute(sql, [userId]);

    const data = rows.map(r => ({
      lotto_item_id: r.lotto_item_id,
      ticket_id: r.ticket_id,
      ticket_number: r.ticket_number,
      price: Number(r.price),
      status: r.item_status,                      // 'active' | 'claimed'
      purchased_at: r.purchased_at,
      is_winner: r.prize_name != null,
      prize_name: r.prize_name ?? null,
      reward: r.prize_name != null ? Number(r.reward) : null
    }));

    return res.status(200).json(data);
  } catch (err) {
    console.error(
      'Get user tickets error:',
      err?.code, err?.errno, err?.sqlState,
      err?.sqlMessage || err?.message
    );
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสลาก' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
