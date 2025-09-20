const express = require('express');
const db = require('../db'); // <-- ตรวจสอบให้แน่ใจว่า path ไปยังไฟล์เชื่อมต่อ DB ของคุณถูกต้อง
const router = express.Router();


// GET - ดึงสลากของผู้ใช้ พร้อมบอกถูกรางวัล/ชื่อรางวัล/เงินรางวัล และส่ง lotto_item_id มาด้วย
router.get('/:userId/tickets', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ message: 'กรุณาระบุ User ID' });

  const connection = await db.getConnection();
  try {
    const sql = `
      SELECT
        li.loto_id                              AS lotto_item_id,   -- 👈 ส่ง id กลับไปให้แอปใช้เคลม
        lt.ticket_number                        AS ticket_number,
        li.status                               AS status,          -- e.g. 'new' | 'claimed'
        li.draw_date                            AS draw_date,
        pt.name                                 AS prize_name,
        COALESCE(pt.reward, 0)                  AS reward,
        CASE WHEN p.lotto_item_id IS NOT NULL
             THEN 1 ELSE 0 END                  AS is_winner
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

    // จัดรูปแบบให้อ่านง่ายในฝั่งแอป
    const out = rows.map(r => ({
      lotto_item_id : r.lotto_item_id,          // 👈 แอปจะอ่านคีย์นี้ (หรือ 'loto_id' ก็ได้ แต่คีย์นี้ชัดกว่า)
      ticket_number : r.ticket_number,
      status        : r.status,
      draw_date     : r.draw_date,              // ถ้าอยากเป็นสตริง date เสมอ ให้เปิด dateStrings ใน config MySQL
      is_winner     : !!r.is_winner,
      prize_name    : r.prize_name || null,
      reward        : Number(r.reward || 0),
    }));

    res.status(200).json(out);
  } catch (err) {
    console.error('Get user tickets error:', err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสลาก' });
  } finally {
    connection.release();
  }
});

module.exports = router;


module.exports = router;