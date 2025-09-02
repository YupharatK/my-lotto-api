const mysql = require('mysql2/promise');
require('dotenv').config();

// สร้าง connection pool เพื่อให้สามารถเชื่อมต่อซ้ำได้
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('✅ Database connection pool created.');

// ส่งออก pool เพื่อให้ไฟล์อื่นนำไปใช้ได้
module.exports = pool;