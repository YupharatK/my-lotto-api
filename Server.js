const express = require('express');
require('dotenv').config();

const authRoutes = require('./routes/auth'); // import auth routes
const lottoRoutes = require('./routes/lotto');
const adminRoutes = require('./routes/admin');
const walletRoutes = require('./routes/wallet');
const resultsRoutes = require('./routes/results');
const prizesRoutes = require('./routes/prizes');
const usersRouter = require('./routes/users');



const app = express();
const PORT = process.env.PORT || 3000;

// Middleware เพื่อให้ Express อ่าน JSON จาก request body ได้
app.use(express.json());

// --- Routes ---
// กำหนดให้ทุก request ที่ขึ้นต้นด้วย /api/auth ให้ไปที่ authRoutes
app.use('/api/auth', authRoutes);
app.use('/api/lotto', lottoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/prizes', prizesRoutes);
app.use('/api/users',usersRouter);

// Route พื้นฐานสำหรับทดสอบว่า Server ทำงาน
app.get('/', (req, res) => {
  res.send('Lotto Backend API is running!');
});

// เริ่มรัน Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});