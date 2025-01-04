const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = 8080;
const DATA_FILE = path.join(__dirname, 'booking_records.json');
const MAX_FILE_SIZE = '10mb';

// 安全头设置
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// 启用CORS
app.use(cors({
  origin: 'http://localhost:8080',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// 请求体解析
app.use(express.json({ limit: MAX_FILE_SIZE }));

// 文件读写锁
const fileLock = new Map();

// 获取剩余票数
app.get('/get_remaining_tickets', async (req, res) => {
  const { museum, date } = req.query;
  
  if (!museum || !date) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const remaining = await getRemainingTickets(museum, date);
    res.json({ remainingTickets: remaining });
  } catch (err) {
    console.error('Error getting remaining tickets:', err);
    res.status(500).json({ error: 'Failed to get remaining tickets' });
  }
});

// 获取博物馆数据
app.get('/get_museums', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'museum_tickets.json'), 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    console.error('Error reading museum data:', err);
    res.status(500).json({ error: 'Failed to load museum data' });
  }
});

// 保存预订记录
app.post('/save_booking', [
  body('name').trim().isLength({ min: 2 }).escape(),
  body('museum').trim().isLength({ min: 2 }).escape(),
  body('date').isISO8601().toDate(),
  body('tickets').isInt({ min: 1, max: 2 })
], async (req, res) => {
  // 验证输入
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // 验证姓名是否在员工名单中
  try {
    const personnelData = await fs.readFile(path.join(__dirname, 'oec_personnel.json'), 'utf8');
    const { employees } = JSON.parse(personnelData);
    
    if (!employees.includes(req.body.name)) {
      return res.status(403).json({ 
        error: '预订失败：仅限内部员工预订' 
      });
    }
  } catch (err) {
    console.error('Error reading personnel data:', err);
    return res.status(500).json({ error: '无法验证员工身份' });
  }

  const bookingData = req.body;
  bookingData.timestamp = new Date().toISOString();

  try {
    // 获取文件锁
    while (fileLock.get(DATA_FILE)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    fileLock.set(DATA_FILE, true);

    // 读取现有数据
    let bookings = [];
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      bookings = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // 检查重复预订
    const isDuplicate = bookings.records.some(booking => 
      booking.name === bookingData.name &&
      booking.museum === bookingData.museum &&
      booking.date === bookingData.date
    );

    if (isDuplicate) {
      return res.status(400).json({ error: 'Duplicate booking detected' });
    }

    // 生成预订编号
    const bookingNumber = `BK-${Date.now()}`;
    
    // 添加预订编号到预订数据
    bookingData.bookingNumber = bookingNumber;
    
    // 初始化records数组
    if (!bookings.records) {
      bookings.records = [];
    }
    
    // 添加新预订
    bookings.records.push(bookingData);
    await fs.writeFile(DATA_FILE, JSON.stringify(bookings, null, 2));

    // 保存完整预订信息到records.json
    const recordsPath = path.join(__dirname, 'records.json');
    let records = [];
    try {
      const data = await fs.readFile(recordsPath, 'utf8');
      records = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    
    records.push(bookingData);
    
    await fs.writeFile(recordsPath, JSON.stringify(records, null, 2));

    res.json({ 
      success: true,
      bookingNumber,
      remainingTickets: await getRemainingTickets(bookingData.museum, bookingData.date)
    });
  } catch (err) {
    console.error('Error saving booking:', err);
    res.status(500).json({ error: 'Failed to save booking' });
  } finally {
    // 释放文件锁
    fileLock.set(DATA_FILE, false);
  }
});

// 获取剩余票数
async function getRemainingTickets(museum, date) {
  const TICKETS_FILE = path.join(__dirname, 'museum_tickets.json');
  
  try {
    // 获取文件锁
    while (fileLock.get(TICKETS_FILE)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    fileLock.set(TICKETS_FILE, true);

    // 读取票务数据
    const data = await fs.readFile(TICKETS_FILE, 'utf8');
    const { museums } = JSON.parse(data);
    const museumData = museums.find(m => m.name === museum);
    
    if (!museumData) return 0;
    
    // 查找指定日期的票数
    const dateData = museumData.ticket_dates.find(d => d.date === date);
    if (!dateData) return 0;
    
    // 获取已预订票数
    const bookings = await getBookingsForDate(museum, date);
    const bookedTickets = bookings.reduce((sum, booking) => sum + booking.tickets, 0);
    
    const remainingTickets = Math.max(0, dateData.available - bookedTickets);
    
    console.log('剩余票数计算详情：');
    console.log(`- 博物馆: ${museum}`);
    console.log(`- 日期: ${date}`);
    console.log(`- 每日可用票数: ${dateData.available}`);
    console.log(`- 已预订票数: ${bookedTickets}`); 
    console.log(`- 剩余票数: ${remainingTickets}`);
    
    return remainingTickets;
  } catch (err) {
    console.error('Error calculating remaining tickets:', err);
    if (err.code === 'ENOENT') {
      // 如果文件不存在，初始化票务数据
      await initializeMuseumTickets();
      return 100; // 返回初始票数
    }
    return 0;
  } finally {
    // 释放文件锁
    fileLock.set(TICKETS_FILE, false);
  }
}

// 获取指定日期的预订
async function getBookingsForDate(museum, date) {
  try {
    console.log(`Reading booking records from: ${DATA_FILE}`);
    const data = await fs.readFile(DATA_FILE, 'utf8');
    console.log(`Booking records content: ${data}`);
    const { records: bookings } = JSON.parse(data);
    console.log(`Found ${bookings.length} total bookings`);
    const filtered = bookings.filter(booking => 
      booking.museum === museum && 
      booking.date.startsWith(date)
    );
    console.log(`Found ${filtered.length} bookings for ${museum} on ${date}`);
    
    // 计算剩余票数
    const totalTickets = filtered.reduce((sum, booking) => sum + booking.tickets, 0);
    // 读取museum_tickets.json文件
    const ticketsData = await fs.readFile(path.join(__dirname, 'museum_tickets.json'), 'utf8');
    const { museums } = JSON.parse(ticketsData);
    
    // 查找指定博物馆和日期的可用票数
    const museumData = museums.find(m => m.name === museum);
    const dateData = museumData?.ticket_dates.find(d => d.date === date);
    const availableTickets = dateData?.available || 0;
    
    const remainingTickets = availableTickets - totalTickets;
    console.log(`Remaining tickets for ${museum} on ${date}: ${remainingTickets} (${availableTickets} available)`);
    
    return filtered;
  } catch (err) {
    console.error('Error reading booking records:', err);
    if (err.code !== 'ENOENT') throw err;
    return [];
  }
}

// 静态文件服务
app.use('/public', express.static(path.join(__dirname, 'public')));

// 处理所有路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 添加data.js路由
app.get('/data.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'data.js'));
});

module.exports = app;

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
