// routes/prizes.js
// ขี้นเงินรางวัล
const express = require('express');
const db = require('../db');
const router = express.Router();

// routes/prizes.js

router.post('/claim', async (req, res) => {
  const { userId, lottoItemId, ticketNumber } = req.body;

  if (!userId || (!lottoItemId && !ticketNumber)) {
    return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน (ต้องมี userId และ lottoItemId หรือ ticketNumber อย่างใดอย่างหนึ่ง)' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 0) ถ้าไม่มี lottoItemId ให้ resolve จากเลขสลากของผู้ใช้
    let itemId = lottoItemId;
    if (!itemId) {
      const [resolved] = await connection.execute(
        `
        SELECT li.loto_id AS lotto_item_id
        FROM lotto_item li
        JOIN lotto_tickets lt ON lt.id = li.ticket_id
        WHERE li.userid = ?
          AND LPAD(REPLACE(lt.ticket_number, ' ', ''), 6, '0')
              = LPAD(REPLACE(?, ' ', ''), 6, '0')
        LIMIT 1
        `,
        [userId, ticketNumber]
      );

      if (resolved.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'ไม่พบสลากของคุณจากเลขที่ให้มา' });
      }
      itemId = resolved[0].lotto_item_id;
    }

    // 1) ตรวจข้อมูลการถูกรางวัล + สถานะใบสลาก (ล็อกแถวไว้กันเคลมซ้อน)
    const [prizes] = await connection.execute(
      `
      SELECT 
        li.loto_id           AS lotto_item_id,
        li.status            AS item_status,
        pt.reward            AS reward
      FROM prizes p
      JOIN lotto_item li   ON p.lotto_item_id = li.loto_id
      JOIN prizes_type pt  ON p.prizes_type = pt.ptype_id
      WHERE p.lotto_item_id = ? AND li.userid = ?
      FOR UPDATE
      `,
      [itemId, userId]
    );

    if (prizes.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'ไม่พบข้อมูลการถูกรางวัลสำหรับสลากใบนี้' });
    }

    const prizeInfo = prizes[0];

    // 2) กันเคลมซ้ำ
    if (String(prizeInfo.item_status).toLowerCase() === 'claimed') {
      await connection.rollback();
      return res.status(409).json({ message: 'สลากใบนี้ถูกขึ้นเงินรางวัลไปแล้ว' });
    }

    // 3) บวกเงินเข้ากระเป๋าผู้ใช้ (ให้ MySQL จัดการเลขทศนิยมเอง)
    await connection.execute(
      'UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?',
      [prizeInfo.reward, userId]
    );

    // 4) อัปเดตสถานะสลากเป็น claimed (+ timestamp)
    await connection.execute(
      "UPDATE lotto_item SET status = 'claimed', claimed_at = NOW() WHERE loto_id = ?",
      [itemId]
    );

    // (ทางเลือก) ถ้าต้องการ mark ตาราง prizes ด้วย
    // await connection.execute(
    //   "UPDATE prizes SET claimed = 1, claimed_at = NOW() WHERE lotto_item_id = ?",
    //   [itemId]
    // );

    // 5) ดึงยอดกระเป๋าล่าสุดเพื่อส่งกลับ
    const [balanceRows] = await connection.execute(
      'SELECT wallet_balance FROM users WHERE user_id = ?',
      [userId]
    );
    const newBalance = balanceRows?.[0]?.wallet_balance;

    await connection.commit();
    return res.status(200).json({
      message: `ขึ้นเงินรางวัลจำนวน ${prizeInfo.reward} บาทสำเร็จ`,
      lottoItemId: itemId,
      reward: prizeInfo.reward,
      balance: newBalance,
    });

  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error('Claim Prize Error:', error);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการขึ้นเงินรางวัล' });
  } finally {
    connection.release();
  }
});

module.exports = router;