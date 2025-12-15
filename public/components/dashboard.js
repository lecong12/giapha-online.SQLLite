// public/components/dashboard.js

/* ==========================================================
0. KIỂM TRA TOKEN
========================================================== */

function ensureAuth() {
    const token = localStorage.getItem('authToken');

    // Không có token -> về login
    if (!token) {
        window.location.href = "/login";
        return false;
    }

    try {
        const parts = token.split('_');
        // Ít nhất phải có 3 phần: ["id", "{userId}", "{randomPart}"] --------DEMO
        if (parts.length < 3) {
        throw new Error('Token format invalid');
        }

        const prefix = parts[0];
        const userIdPart = parts[1];

        if (prefix !== 'id') {
        throw new Error('Token prefix invalid');
        }

        const userId = Number(userIdPart);
        if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('User id invalid');
        }

        const randomPart = parts.slice(2).join('_');
        if (!randomPart || randomPart.trim() === '') {
        throw new Error('Random part invalid');
        }

        return true;
    } catch (e) {
        console.error('Token không hợp lệ:', e.message);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRole');
        window.location.href = "/login";
        return false;
    }
}

/* ==========================================================
1. CHUYỂN TAB
========================================================== */

function handleTabSwitch(event) {
    const clickedButton = event.currentTarget;
    const targetSelector = clickedButton.dataset.target;
    if (!targetSelector) return;

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => button.classList.remove('active'));
    tabContents.forEach(content => {
        content.style.display = 'none';
    });

    clickedButton.classList.add('active');

    const selectedContent = document.querySelector(targetSelector);
    if (selectedContent) {
        selectedContent.style.display = 'block';
    }
}

/* ==========================================================
2. HÀM GỌI API KÈM TOKEN
========================================================== */

function getAuthToken() {
  return localStorage.getItem('authToken') || '';
}

async function apiGet(url) {
  const token = getAuthToken();
  if (!token) {
    window.location.href = "/login";
    return { success: false, message: "Chưa đăng nhập" };
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    // Token sai/hết hạn -> xóa và quay lại login
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    window.location.href = "/login";
    return { success: false, message: "Hết phiên đăng nhập" };
  }

  return res.json();
}

/* ==========================================================
3. LOAD STATS CHO TAB DASHBOARD
========================================================== */

async function loadDashboardStats() {
  try {
    const data = await apiGet('/api/dashboard/stats');
    if (!data || !data.success) {
      console.error(data && data.message ? data.message : 'Không lấy được thống kê.');
      return;
    }

    const stats = data.stats || {};
    const total = stats.total || 0;
    const males = stats.males || 0;
    const females = stats.females || 0;
    const maxGen = stats.maxGeneration || 0;

    // 1. Gán số liệu vào các ô
    const totalEl = document.getElementById('totalMembers');
    const maleCountEl = document.getElementById('maleCount');
    const femaleCountEl = document.getElementById('femaleCount');
    const malePercentEl = document.getElementById('malePercent');
    const femalePercentEl = document.getElementById('femalePercent');
    const generationCountEl = document.getElementById('generationCount');

    if (totalEl) totalEl.textContent = total;
    if (maleCountEl) maleCountEl.textContent = males;
    if (femaleCountEl) femaleCountEl.textContent = females;
    if (generationCountEl) generationCountEl.textContent = maxGen;

    // 2. Tính % Nam / Nữ trên tổng
    let malePercentText = '0%';
    let femalePercentText = '0%';

    if (total > 0) {
      const malePercent = Math.round((males / total) * 100);
      const femalePercent = Math.round((females / total) * 100);
      malePercentText = malePercent + '%';
      femalePercentText = femalePercent + '%';
    }

    if (malePercentEl) malePercentEl.textContent = malePercentText;
    if (femalePercentEl) femalePercentEl.textContent = femalePercentText;

    // 3. Phân bố thế hệ theo %
    const genDist = stats.generations || []; // [{ generation, count }]
    renderGenerationPie(genDist, total);

    // 4. Sinh nhật sắp tới (raw, sẽ render sau)
    const upcoming = stats.upcomingBirthdays || [];
  } catch (err) {
    console.error('Không thể kết nối server.', err);
  }
}
function renderGenerationPie(genDist, total) {
    const container = document.getElementById('generationChart');
    if (!container) return;

    container.innerHTML = '';

    // Lọc bỏ những item không có generation (null/undefined)
    const validGenDist = genDist.filter(item => item.generation !== null && item.generation !== undefined);

    if (!validGenDist.length || total <= 0) {
        container.textContent = 'Chưa có dữ liệu thế hệ.';
        return;
    }

    const segments = validGenDist.map(item => {
        const percent = Math.round((item.count / total) * 100);
        return {
        generation: item.generation,
        count: item.count,
        percent
        };
    });

    // Tạo pie chart đơn giản bằng conic-gradient
    let gradientParts = [];
    let currentDeg = 0;
    segments.forEach((seg, idx) => {
        const color = getGenerationColor(idx); // màu cho từng segment
        const deg = (seg.percent / 100) * 360;
        const start = currentDeg;
        const end = currentDeg + deg;
        gradientParts.push(`${color} ${start}deg ${end}deg`);
        currentDeg = end;
    });

    const chart = document.createElement('div');
    chart.style.width = '320px';
    chart.style.height = '320px';
    chart.style.borderRadius = '50%';
    chart.style.margin = '0 auto 16px auto';
    chart.style.background = `conic-gradient(${gradientParts.join(',')})`;
    chart.style.boxShadow = '0 4px 10px rgba(0,0,0,0.1)';
    chart.style.position = 'relative';

    // Lõi trắng giữa cho đẹp
    const inner = document.createElement('div');
    inner.style.position = 'absolute';
    inner.style.top = '50%';
    inner.style.left = '50%';
    inner.style.transform = 'translate(-50%, -50%)';
    inner.style.width = '220px';
    inner.style.height = '220px';
    inner.style.borderRadius = '50%';
    inner.style.background = '#fff';
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.fontSize = '24px';
    inner.innerHTML = `<strong>${total}</strong><span style="font-size:12px;color:#666;">Thành viên</span>`;

    chart.appendChild(inner);

    // Legend
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.flexDirection = 'column';
    legend.style.gap = '4px';
    legend.style.marginTop = '8px';
    legend.style.maxHeight = '200px';
    legend.style.overflowY = 'auto';

    segments.forEach((seg, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.fontSize = '16px';

        const colorBox = document.createElement('span');
        colorBox.style.display = 'inline-block';
        colorBox.style.width = '12px';
        colorBox.style.height = '12px';
        colorBox.style.borderRadius = '4px';
        colorBox.style.background = getGenerationColor(idx);

        const label = document.createElement('span');
        label.textContent = `Đời ${seg.generation}: ${seg.count} (~${seg.percent}%)`;

        row.appendChild(colorBox);
        row.appendChild(label);
        legend.appendChild(row);
    });

    container.appendChild(chart);
    container.appendChild(legend);
}

// Màu cho từng thế hệ (lặp lại nếu nhiều)
function getGenerationColor(index) {
    const colors = [
        '#f97316', // cam
        '#0ea5e9', // xanh dương
        '#22c55e', // xanh lá
        '#a855f7', // tím
        '#f43f5e', // đỏ hồng
        '#14b8a6'  // teal
    ];
    return colors[index % colors.length];
}

/* ==========================================================
4. KHỞI TẠO SỰ KIỆN
========================================================== */
function handleLogout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');

  window.location.href = '/login';
}
document.addEventListener('DOMContentLoaded', () => {
    // Nếu token lỗi / không có -> ensureAuth sẽ tự chuyển về /login
    if (!ensureAuth()) return;

    // Gán click cho các tab
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', handleTabSwitch);
    });

    // Hiện tab đang active mặc định
    const defaultActiveButton = document.querySelector('.tab-btn.active');
    if (defaultActiveButton) {
        const defaultTargetSelector = defaultActiveButton.dataset.target;
        const defaultTarget = document.querySelector(defaultTargetSelector);
        if (defaultTarget) {
        defaultTarget.style.display = 'block';
        }
    }

    // Nếu tab Dashboard đang active ban đầu thì load stats
    const dashboardTab = document.getElementById('dashboard');
    if (dashboardTab && dashboardTab.classList.contains('active')) {
        loadDashboardStats();
    }

    // Mỗi lần click vào tab Dashboard thì reload stats
    const dashBtn = document.querySelector('.tab-btn[data-target="#dashboard"]');
    if (dashBtn) {
        dashBtn.addEventListener('click', () => {
        loadDashboardStats();
        });
    }

    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});
