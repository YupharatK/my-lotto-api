const express = require('express');
const db = require('../db'); // <-- ตรวจสอบให้แน่ใจว่า path ไปยังไฟล์เชื่อมต่อ DB ของคุณถูกต้อง
const router = express.Router();
// GET - ดึงข้อมูลสลากที่ซื้อทั้งหมดของผู้ใช้คนเดียว
router.get('/:userId/tickets', async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    let connection;
    try {
        connection = await db.getConnection();
        const sqlQuery = `
            SELECT
                lt.ticket_number, -- <<<< แก้ไข: ดึง ticket_number 6 หลัก
                li.status,
                pt.name AS prize_name,
                pt.reward
            FROM
                lotto_item li
            JOIN 
                lotto_tickets lt ON li.ticket_id = lt.id -- <<<< เพิ่ม: JOIN เพื่อเอาเลข 6 หลัก
            LEFT JOIN
                prizes p ON li.loto_id = p.lotto_item_id
            LEFT JOIN
                prizes_type pt ON p.prizes_type = pt.ptype_id
            WHERE
                li.userid = ?
            ORDER BY 
                li.purchased_at DESC;
        `;
        const [tickets] = await connection.execute(sqlQuery, [userId]);
        
        const formattedTickets = tickets.map(ticket => ({
            ticket_number: ticket.ticket_number, // <<<< แก้ไข: ใช้ Key 'ticket_number'
            is_winner: ticket.prize_name !== null,
            prize_name: ticket.prize_name, 
            reward: ticket.reward,
            status: ticket.status
        }));

        res.status(200).json(formattedTickets);
    } catch (error) {
        console.error("Get user tickets error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลสลาก" });
    } finally {
        if (connection) connection.release();
    }
});

// POST /tickets/mark-as-checked
router.post("/mark-as-checked", async (req, res) => {
    const { userId, ticketNumber } = req.body;

    if (!userId || !ticketNumber) {
        return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
    }

    let connection;
    try {
        connection = await db.getConnection();
        
        // ค้นหา loto_id จาก lotto_item โดย JOIN กับ lotto_tickets
        const findItemQuery = `
            SELECT li.loto_id 
            FROM lotto_item li 
            JOIN lotto_tickets lt ON li.ticket_id = lt.id 
            WHERE li.userid = ? AND lt.ticket_number = ?
        `;
        const [lottoItems] = await connection.execute(findItemQuery, [userId, ticketNumber]);

        if (lottoItems.length === 0) {
            return res.status(404).json({ message: "ไม่พบสลากหมายเลขนี้ของคุณ" });
        }
        
        const lottoItemId = lottoItems[0].loto_id;

        // อัปเดตสถานะเป็น 'checked'
        await connection.execute(
            "UPDATE lotto_item SET status = 'checked' WHERE loto_id = ?",
            [lottoItemId]
        );

        res.status(200).json({ message: "บันทึกสถานะสลากเรียบร้อย" });

    } catch (error) {
        console.error("Mark as checked Error:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ" });
    } finally {
        if (connection) connection.release();
    }
});


module.exports = router;