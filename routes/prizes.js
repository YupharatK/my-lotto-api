// routes/prizes.js
// ขี้นเงินรางวัล
const express = require('express');
const db = require('../db');
const router = express.Router();

// routes/prizes.js

const REWARD_CAST = "CAST(REPLACE(pt.reward, ',', '') AS DECIMAL(18,2)) AS reward_num";

/**
 * body: { userId, ticketNumber, drawDate?('YYYY-MM-DD') }
 * ถ้าไม่ส่ง drawDate จะใช้ผลออกรางวัลล่าสุดในตาราง draw_results
 */
router.post('/claim', async (req, res) => {
  const { userId, ticketNumber, drawDate } = req.body || {};
  if (!userId || !ticketNumber) {
    return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) หาใบสลากของ user จากเลขที่ส่งมา + ล็อกกันชน
    const [items] = await conn.execute(
      `
      SELECT li.loto_id, li.userid, li.status AS item_status, li.purchased_at,
             lt.id AS ticket_id, lt.ticket_number
      FROM lotto_item li
      JOIN lotto_tickets lt ON lt.id = li.ticket_id
      WHERE li.userid = ? AND lt.ticket_number = ?
      ORDER BY li.purchased_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [userId, ticketNumber]
    );
    if (items.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'ไม่พบสลากเลขนี้ในบัญชีของคุณ' });
    }
    const it = items[0];
    if (it.item_status === 'claimed') {
      await conn.rollback();
      return res.status(409).json({ message: 'สลากใบนี้ถูกขึ้นเงินรางวัลไปแล้ว' });
    }

    // 2) ดึงผลออกรางวัล (ตามวันที่ส่งมา หรือใช้รายการล่าสุด)
    const [drRows] = await conn.execute(
      drawDate
        ? `SELECT * FROM draw_results WHERE DATE(draw_date)=? ORDER BY draw_date DESC LIMIT 1`
        : `SELECT * FROM draw_results ORDER BY draw_date DESC LIMIT 1`,
      drawDate ? [drawDate] : []
    );
    if (drRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'ยังไม่มีผลออกรางวัล' });
    }
    const dr = drRows[0];

    // 3) เทียบเลข -> หาประเภทของรางวัล
    let prizeName = null;
    let prizeCode = null; // เผื่อใช้คอลัมน์ prizes_type.code
    if (ticketNumber === dr.prize1_number) { prizeName = 'รางวัลที่ 1'; prizeCode = 'P1'; }
    else if (ticketNumber === dr.prize2_number) { prizeName = 'รางวัลที่ 2'; prizeCode = 'P2'; }
    else if (ticketNumber === dr.prize3_number) { prizeName = 'รางวัลที่ 3'; prizeCode = 'P3'; }
    else if (ticketNumber.endsWith(dr.last3_number)) { prizeName = 'รางวัลเลขท้าย 3 ตัว'; prizeCode = 'L3'; }
    else if (ticketNumber.endsWith(dr.last2_number)) { prizeName = 'รางวัลเลขท้าย 2 ตัว'; prizeCode = 'L2'; }

    if (!prizeName) {
      await conn.rollback();
      return res.status(400).json({ message: 'สลากใบนี้ไม่ได้ถูกรางวัล' });
    }

    // 4) ดึงเงินรางวัลจาก prizes_type
    const [ptRows] = await conn.execute(
      `
      SELECT pt.ptype_id, pt.name, ${REWARD_CAST}
      FROM prizes_type pt
      WHERE pt.name = ? OR pt.code = ?
      LIMIT 1
      `,
      [prizeName, prizeCode]
    );
    if (ptRows.length === 0) {
      await conn.rollback();
      return res.status(500).json({ message: 'ไม่พบประเภทของรางวัลในระบบ' });
    }
    const pt = ptRows[0];

    // 5) (optional) บันทึกลงตาราง prizes ไว้เป็นหลักฐาน
    // สร้าง unique index ที่ prizes.lotto_item_id ไว้ล่วงหน้าเพื่อใช้ ON DUPLICATE KEY
    await conn.execute(
      `
      INSERT INTO prizes (lotto_item_id, prizes_type)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE prizes_type = VALUES(prizes_type)
      `,
      [it.loto_id, pt.ptype_id]
    );

    // 6) เติมเงิน + mark claimed
    await conn.execute(
      `UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?`,
      [pt.reward_num, userId]
    );
    await conn.execute(
      `UPDATE lotto_item SET status='claimed', updated_at=NOW() WHERE loto_id = ?`,
      [it.loto_id]
    );

    await conn.commit();
    return res.status(200).json({
      message: `ขึ้นเงินรางวัลจำนวน ${Number(pt.reward_num)} บาทสำเร็จ`,
      prize_name: pt.name,
      reward: Number(pt.reward_num),
      ticket_number: ticketNumber,
      lotto_item_id: it.loto_id
    });
  } catch (err) {
    try { await conn.rollback(); } catch(_) {}
    console.error('Claim-by-number error:', err);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการขึ้นเงินรางวัล' });
  } finally {
    conn.release();
  }
});

module.exports = router;