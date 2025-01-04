// 博物馆门票预订系统 - 前端脚本
document.addEventListener('DOMContentLoaded', init);

// 初始化函数
function init() {
  loadMuseums();
  setupEventListeners();
}

// 加载博物馆列表
async function loadMuseums() {
  try {
    const response = await fetch('/get_museums');
    if (!response.ok) throw new Error('网络请求失败');
    
    const data = await response.json();
    const select = document.getElementById('museumSelect');
    
    // 清空现有选项
    select.innerHTML = '<option value="">请选择博物馆</option>';
    
    // 添加新的博物馆选项
    data.museums.forEach(museum => {
      const option = document.createElement('option');
      option.value = museum.name;
      option.textContent = museum.name;
      select.appendChild(option);
    });
    
    // 初始化日期选择器
    setupDatePicker(data.museums);
  } catch (error) {
    console.error('加载博物馆列表失败:', error);
    showMessage('无法加载博物馆列表，请刷新页面重试', 'error');
  }
}

// 设置日期选择器
function setupDatePicker(museums) {
  const dateInput = document.getElementById('date');
  const today = new Date().toISOString().split('T')[0];
  
  // 设置最小日期为今天
  dateInput.min = today;
  
  // 监听博物馆选择变化
  document.getElementById('museumSelect').addEventListener('change', (e) => {
    const selectedMuseum = museums.find(m => m.name === e.target.value);
    if (selectedMuseum) {
      // 设置可选日期范围
      const minDate = selectedMuseum.ticket_dates[0].date;
      const maxDate = selectedMuseum.ticket_dates[selectedMuseum.ticket_dates.length - 1].date;
      dateInput.min = minDate;
      dateInput.max = maxDate;
    }
  });
}

// 设置事件监听器
function setupEventListeners() {
  const form = document.getElementById('bookingForm');
  form.addEventListener('submit', handleFormSubmit);
  
  // 实时更新剩余票数
  document.getElementById('date').addEventListener('change', updateTicketAvailability);
  document.getElementById('museumSelect').addEventListener('change', updateTicketAvailability);
}

// 处理表单提交
async function handleFormSubmit(event) {
  event.preventDefault();
  
  // 获取票数
  const tickets = parseInt(document.getElementById('tickets').value);
  
  // 验证票数
  if (tickets < 1 || tickets > 2) {
    showMessage('票数必须在1到2之间', 'error');
    return;
  }
  
  // 检查剩余票数
  const remainingTickets = parseInt(document.getElementById('remainingTickets').textContent);
  if (isNaN(remainingTickets) || remainingTickets < tickets) {
    showMessage('剩余票数不足，请选择其他日期或减少票数', 'error');
    return;
  }

  // 获取表单数据
  const formData = {
    name: document.getElementById('name').value,
    museum: document.getElementById('museumSelect').value,
    date: document.getElementById('date').value,
    tickets: tickets
  };

  // 显示加载状态
  showMessage('正在提交预订...', 'info');
  
  try {
    const response = await fetch('/save_booking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    const result = await response.json();
    
    if (response.ok) {
      showMessage(`预订成功！您的预订编号是：${result.bookingNumber}`, 'success');
      updateTicketAvailability();
      document.getElementById('bookingForm').reset();
    } else {
      throw new Error(result.error || '预订失败');
    }
  } catch (error) {
    console.error('预订失败:', error);
    showMessage(`预订失败：${error.message}`, 'error');
  }
}

// 更新剩余票数
async function updateTicketAvailability() {
  const museum = document.getElementById('museumSelect').value;
  const date = document.getElementById('date').value;
  
  if (!museum || !date) return;

  try {
    const response = await fetch(`/get_remaining_tickets?museum=${encodeURIComponent(museum)}&date=${encodeURIComponent(date)}`);
    if (!response.ok) throw new Error('无法获取剩余票数');
    
    const data = await response.json();
    document.getElementById('remainingTickets').textContent = data.remainingTickets || 0;
  } catch (error) {
    console.error('获取剩余票数失败:', error);
    document.getElementById('remainingTickets').textContent = '未知';
  }
}

// 显示消息
function showMessage(message, type) {
  const messageDiv = document.getElementById('message');
  
  // 清除之前的定时器
  if (messageDiv.timer) {
    clearTimeout(messageDiv.timer);
    messageDiv.timer = null;
  }
  
  messageDiv.textContent = message;
  messageDiv.className = type;
  
  // 仅对非成功消息设置定时器
  if (type !== 'success') {
    messageDiv.timer = setTimeout(() => {
      messageDiv.textContent = '';
      messageDiv.className = '';
    }, 3000);
  }
}
