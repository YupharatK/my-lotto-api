// routes/results.js
// API สำหรับตรวจ lotto
const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/latest', async (req, res) => {
    try {
        // CHANGED: Query from 'draw_results' table
        const [rows] = await db.execute(
            `SELECT prize1_number, prize2_number, prize3_number, last3_number, last2_number, draw_date 
             FROM draw_results 
             ORDER BY draw_date DESC 
             LIMIT 1`
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'ยังไม่มีข้อมูลผลรางวัล' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error("Get Latest Results Error:", error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงผลรางวัล' });
    }
});


module.exports = router;