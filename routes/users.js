const express = require('express');
const db = require('../db'); // <-- ตรวจสอบให้แน่ใจว่า path ไปยังไฟล์เชื่อมต่อ DB ของคุณถูกต้อง
const router = express.Router();

// GET - ดึงข้อมูลสลากที่ซื้อทั้งหมดพร้อมผลรางวัลของผู้ใช้คนเดียว
router.get('/:userId/tickets', async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    const connection = await db.getConnection();
    try {
        // SQL Query ที่ใช้ LEFT JOIN เพื่อดึงสลากทั้งหมด
        // และจะแสดงข้อมูลรางวัลเฉพาะสลากใบที่ถูกรางวัลเท่านั้น
        const sqlQuery = `
            SELECT
                lt.ticket_number,
                pt.ptype_name,
                pt.reward
            FROM
                lotto_item li
            JOIN
                lotto_tickets lt ON li.ticket_id = lt.id
            LEFT JOIN
                prizes p ON li.loto_id = p.lotto_item_id
            LEFT JOIN
                prizes_type pt ON p.prizes_type = pt.ptype_id
            WHERE
                li.userid = ?
            ORDER BY 
                lt.ticket_number;
        `;

        const [tickets] = await connection.execute(sqlQuery, [userId]);
        
        // จัดรูปแบบข้อมูลเพื่อให้ฝั่งแอปนำไปใช้ง่ายขึ้น
        const formattedTickets = tickets.map(ticket => ({
            ticket_number: ticket.ticket_number,
            is_winner: ticket.ptype_name !== null, // ถ้า ptype_name ไม่ใช่ null แสดงว่าถูกรางวัล
            prize_name: ticket.ptype_name,
            reward: ticket.reward
        }));

        res.status(200).json(formattedTickets);

    } catch (error) {
        console.error("Get user tickets error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลสลาก" });
    } finally {
        connection.release();
    }
});

module.exports = router;