const express = require('express');
const db = require('../db'); // <-- ตรวจสอบให้แน่ใจว่า path ไปยังไฟล์เชื่อมต่อ DB ของคุณถูกต้อง
const router = express.Router();
// GET - ดึงข้อมูลสลากที่ซื้อทั้งหมดของผู้ใช้คนเดียว
router.get('/:userId/tickets', async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    let connection; // ประกาศ connection ข้างนอก try-catch
    try {
        // ใช้ connection จาก pool ที่จัดการการเชื่อมต่อได้ดีกว่า
        connection = await db.getConnection(); 
        
        // --- START: SQL Query ฉบับแก้ไข ---
        const sqlQuery = `
            SELECT
                li.ticket_id,      -- แก้ไข #1: ดึง ticket_id ที่แอปต้องการ
                li.status,
                pt.name AS prize_name, -- แก้ไข #2: ดึง pt.name และตั้งชื่อให้ตรงกับที่ใช้
                pt.reward
            FROM
                lotto_item li
            LEFT JOIN
                prizes p ON li.loto_id = p.lotto_item_id
            LEFT JOIN
                prizes_type pt ON p.prizes_type = pt.ptype_id
            WHERE
                li.userid = ?
            ORDER BY 
                li.purchased_at DESC;
        `;
        // --- END: SQL Query ฉบับแก้ไข ---

        const [tickets] = await connection.execute(sqlQuery, [userId]);
        
        // --- START: การจัดรูปแบบข้อมูลฉบับแก้ไข ---
        const formattedTickets = tickets.map(ticket => ({
            // ใช้ Key 'ticket_id' ให้ตรงกับที่ Flutter ต้องการ
            ticket_id: ticket.ticket_id, 
            is_winner: ticket.prize_name !== null,
            // ใช้ Key 'prize_name' ที่เราตั้งชื่อไว้ใน Query
            prize_name: ticket.prize_name, 
            reward: ticket.reward,
            status: ticket.status // ส่งสถานะไปด้วยเผื่อใช้ในอนาคต (เช่น "claimed")
        }));
        // --- END: การจัดรูปแบบข้อมูลฉบับแก้ไข ---

        res.status(200).json(formattedTickets);

    } catch (error) {
        console.error("Get user tickets error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลสลาก" });
    } finally {
        // ตรวจสอบก่อนว่า connection ถูกสร้างแล้วหรือยังก่อน release
        if (connection) {
            connection.release();
        }
    }
});

module.exports = router;

module.exports = router;