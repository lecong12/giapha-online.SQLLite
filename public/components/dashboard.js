// public/components/dashboard.js

/* ==========================================================
0. KIỂM TRA TOKEN
========================================================== */
   
/* ============================================================
   CHECK AUTHENTICATION - Hỗ trợ cả Owner và Viewer
============================================================ */
function ensureAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = "/login";
        return false;
    }

    // Validate token format
    try {
        const parts = token.split('_');
        if (parts.length < 3) {
            throw new Error('Invalid token format');
        }

        const prefix = parts[0]; // 'id' hoặc 'viewer'
        const userId = parts[1];

        // Chấp nhận cả 'id' và 'viewer'
        if (!['id', 'viewer'].includes(prefix)) {
            throw new Error('Invalid token prefix');
        }

        if (!userId || isNaN(userId)) {
            throw new Error('Invalid user ID');
        }

        return true;
    } catch (err) {
        console.error('Token validation failed:', err);
        // Token không hợp lệ, xóa và redirect
        localStorage.removeItem('authToken');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRole');
        window.location.href = "/login";
        return false;
    }
}
// Biến global để lưu danh sách members và trạng thái edit
let allMembers = [];
let editingMemberId = null;
let treeRenderer; // Biến quản lý cây gia phả
/* ==========================================================
   HELPER FUNCTIONS
========================================================== */

/**
 * Tính tuổi từ ngày sinh
 * @param {string} birthDate - Ngày sinh format YYYY-MM-DD
 * @returns {number} - Tuổi
 */
function calculateAge(birthDate) {
  if (!birthDate) return 0;
  
  const today = new Date();
  const birth = new Date(birthDate);
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  // Nếu chưa đến sinh nhật trong năm nay thì trừ 1 tuổi
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Rút gọn tên hiển thị cho cây gia phả (theo yêu cầu: 3-4 chữ giữ nguyên, dài hơn lấy 3 chữ cuối)
 */
function formatNameForTree(fullName) {
  if (!fullName) return '';
  const words = fullName.trim().split(/\s+/);
  if (words.length <= 4) return fullName;
  return words.slice(-3).join(' ');
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

    // ✅ THÊM LOGIC NÀY
    if (targetSelector === '#tree') {
        if (!treeRenderer) {
            setTimeout(initFamilyTree, 100);
        } else {
            // Cập nhật lại dữ liệu và dropdown khi quay lại tab cây (để hiển thị thành viên mới thêm)
            setTimeout(async () => {
                await treeRenderer.loadData(treeRenderer.selectedPersonId);
                populatePersonDropdown();
            }, 100);
        }
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
    let maxGen = stats.maxGeneration || 0;

    // ✅ Fix: Tự động tính tổng số đời từ danh sách thế hệ nếu API trả về 0
    if (maxGen === 0 && stats.generations && Array.isArray(stats.generations)) {
        const validGens = stats.generations
            .map(g => parseInt(g.generation))
            .filter(g => !isNaN(g));
            
        if (validGens.length > 0) {
            maxGen = Math.max(...validGens);
        }
    }

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
    renderUpcomingBirthdays(upcoming);

    // 5. Ngày giỗ sắp tới
    const deathAnniversaries = stats.upcomingDeathAnniversaries || [];
    if (typeof renderUpcomingDeathAnniversaries === 'function') {
        renderUpcomingDeathAnniversaries(deathAnniversaries);
    }

    const activities = stats.activities || [];
    renderRecentActivities(activities);
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
    chart.style.width = '400px';
    chart.style.height = '400px';
    chart.style.borderRadius = '50%';
    chart.style.margin = '0 auto -100px auto';
    chart.style.background = `conic-gradient(${gradientParts.join(',')})`;
    chart.style.boxShadow = '0 4px 10px rgba(0,0,0,0.1)';
    chart.style.position = 'relative';

    // Lõi trắng giữa cho đẹp
    const inner = document.createElement('div');
    inner.style.position = 'absolute';
    inner.style.top = '50%';
    inner.style.left = '50%';
    inner.style.transform = 'translate(-50%, -50%)';
    inner.style.width = '200px';
    inner.style.height = '200px';
    inner.style.borderRadius = '50%';
    inner.style.background = '#fff';
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.fontSize = '32px';
    inner.innerHTML = `<strong>${total}</strong><span style="font-size:12px;color:#666;">Thành viên</span>`;

    chart.appendChild(inner);

    // Legend
    const legend = document.createElement('div');
    legend.style.display = 'flex';
    legend.style.flexDirection = 'column';
    legend.style.gap = '4px';
    legend.style.marginTop = '8px';
    legend.style.maxHeight = '300px';
    legend.style.maxWidth = '500px';
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
        label.textContent = `Đời thứ ${seg.generation}: ${seg.count} (~${seg.percent}%)`;

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
        '#f97316', '#000000ff',
        '#0ea5e9', '#1eff00ff',
        '#43ad6aff', '#5300beff',
        '#a855f7', 
        '#f43f5e', 
        '#0e6b60ff', 
        '#203475ff', 
        '#eea932ff',
        '#ff0fd7ff',
        '#8b5cf6ff',
        '#6d0606ff', 
        '#314640ff',
    ];
    return colors[index % colors.length];
}
function renderUpcomingBirthdays(list) {
  const container = document.getElementById('birthdayList');
  if (!container) return;

  container.innerHTML = '';

  if (!list.length) {
    container.textContent = 'Chưa có sinh nhật sắp tới.';
    return;
  }

  list.forEach(item => {
    const row = document.createElement('div');
    row.className = 'birthday-item';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.padding = '8px 12px';
    row.style.borderRadius = '8px';
    row.style.background = 'rgba(250, 247, 247, 1)';
    row.style.boxShadow = '0px 3px 5px rgba(0,0,0,0.2)';
    row.style.maxWidth = '95%';

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'space-between';
    top.style.alignItems = 'center';
    top.style.marginBottom = '4px';

    const name = document.createElement('span');
    name.style.fontWeight = '600';
    name.textContent = item.full_name;

    const days = document.createElement('span');
    days.style.fontSize = '12px';
    days.style.color = '#16a34a';
    days.textContent = item.daysLeft === 0
      ? 'Hôm nay'
      : `Còn ${item.daysLeft} ngày`;

    top.appendChild(name);
    top.appendChild(days);

    const bottom = document.createElement('div');
    bottom.style.fontSize = '12px';
    bottom.style.color = '#555';
    bottom.textContent = `Ngày sinh: ${item.birthday} (lần tới: ${item.nextBirthday})`;

    row.appendChild(top);
    row.appendChild(bottom);
    container.appendChild(row);
  });
}
// Thay function renderRecentActivities() cũ
function renderRecentActivities(list) {
  const container = document.getElementById('activityList');
  if (!container) return;

  container.innerHTML = '';

  if (!list.length) {
    container.textContent = 'Chưa có hoạt động gần đây.';
    return;
  }

  const userRole = localStorage.getItem('userRole');

  list.forEach(item => {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-radius: 8px;
      background: rgba(255,255,255,0.9);
      box-shadow: 0px 3px 5px rgba(0,0,0,0.15);
      max-width: 95%;
      gap: 12px;
    `;

    // Icon theo action_type
    const icons = {
      'create': '✅',
      'update': '✏️',
      'delete': '🗑️'
    };

    const icon = icons[item.action_type] || '📝';

    // Badge role
    const roleBadge = item.actor_role === 'viewer'
      ? '<span style="background: #dbeafe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 10px;">👁️ Viewer</span>'
      : '<span style="background: #fed7aa; color: #c2410c; padding: 2px 6px; border-radius: 4px; font-size: 10px;">👑 Admin</span>';

    // Thời gian
    const timeAgo = formatTimeAgo(item.created_at);

    // Bên trái: icon + mô tả + actor
    const left = document.createElement('div');
    left.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';
    left.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">${icon}</span>
        <span style="font-weight: 600; font-size: 13px;">${item.description}</span>
      </div>
      <div style="font-size: 11px; color: #666; display: flex; align-items: center; gap: 6px;">
        <span>${item.actor_name}</span>
        ${roleBadge}
      </div>
    `;

    // Bên phải: thời gian + nút xóa (chỉ owner)
    const right = document.createElement('div');
    right.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 4px;';

    const timeEl = document.createElement('span');
    timeEl.style.cssText = 'font-size: 11px; color: #6b7280;';
    timeEl.textContent = timeAgo;

    right.appendChild(timeEl);

    // Nút xóa chỉ cho owner
    if (userRole === 'owner') {
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      deleteBtn.style.cssText = `
        padding: 4px 8px;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 10px;
      `;
      deleteBtn.onclick = () => deleteActivityLog(item.id);
      right.appendChild(deleteBtn);
    }

    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
}

// Helper: Format time ago
function formatTimeAgo(dateString) {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  
  return past.toLocaleDateString('vi-VN');
}

// Function xóa 1 activity log
async function deleteActivityLog(logId) {
  if (!confirm('⚠️ Xóa lịch sử này?')) return;

  try {
    const result = await apiDelete(`/api/activities/${logId}`);
    
    if (result && result.success) {
      showCopyNotification('✅ Đã xóa lịch sử');
      await loadDashboardStats(); // Reload
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('Lỗi xóa log:', err);
    alert('❌ Không thể kết nối server');
  }
}

// Function xóa TẤT CẢ logs (thêm vào Settings)
async function clearAllActivityLogs() {
  if (!confirm('⚠️ BẠN CHẮC CHẮN MUỐN XÓA TẤT CẢ LỊCH SỬ?\n\n❌ Hành động này không thể hoàn tác!')) {
    return;
  }

  if (!confirm('⚠️ XÁC NHẬN LẦN CUỐI!\n\nXóa tất cả lịch sử hoạt động?')) {
    return;
  }

  try {
    const result = await apiDelete('/api/activities/clear/all');

    if (result && result.success) {
      alert('✅ ' + result.message);
      await loadDashboardStats();
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('Lỗi clear logs:', err);
    alert('❌ Không thể kết nối server');
  }
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
/* ==========================================================
5. XỬ LÝ TAB MEMBERS
========================================================== */

// 5.1. Load tất cả thành viên
async function loadMembers() {
  try {
    const data = await apiGet('/api/members');
    
    if (!data || !data.success) {
      console.error('Không load được members');
      return;
    }

    allMembers = data.members || [];
    renderMembers(allMembers);
  } catch (err) {
    console.error('Lỗi loadMembers:', err);
  }
}

// 5.2. Render danh sách members
function renderMembers(members) {
  const grid = document.getElementById('membersGrid');
  if (!grid) return;

  grid.innerHTML = '';

  if (!members || members.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#999;">Chưa có thành viên nào</p>';
    return;
  }

  members.forEach(member => {
    const card = document.createElement('div');
    card.className = 'member-item';
    
    // Avatar
    const avatarHtml = member.avatar 
      ? `<img src="${member.avatar}" class="member-avatar" alt="${member.full_name}" />`
      : `<div class="member-avatar">${member.full_name.charAt(0)}</div>`;

    // Giới tính icon
    const genderIcon = member.gender === 'Nam' 
      ? '<i class="fas fa-mars" style="color:#0ea5e9;"></i>'
      : '<i class="fas fa-venus" style="color:#ec4899;"></i>';

    // Trạng thái
  // Trạng thái - Hiển thị tuổi nếu còn sống, "Đã mất" nếu đã mất
let statusText = '';
let statusColor = '';

if (member.is_alive) {
  // Người còn sống → Hiển thị tuổi
  const age = calculateAge(member.birth_date);
  statusText = age > 0 ? `${age} tuổi` : 'N/A';
  statusColor = age > 0 ? '#10b981' : '#f59e0b'; // Màu xanh hoặc cam
} else {
  // Người đã mất
  statusText = 'Đã mất';
  statusColor = '#6b7280'; // Màu xám
}

  // Kiểm tra role để hiển thị nút
    const userRole = localStorage.getItem('userRole');
    let actionsHtml = '';
    
    if (userRole === 'owner') {
      actionsHtml = `
        <div class="member-actions">
          <button class="btn-edit" onclick="openEditMemberModal(${member.id})" style="padding: 4px 8px; font-size: 12px;">
            <i class="fas fa-edit"></i> Sửa
          </button>
          <button class="btn-delete" onclick="deleteMember(${member.id})" style="padding: 4px 8px; font-size: 12px;">
            <i class="fas fa-trash"></i> Xóa
          </button>
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="member-actions">
          <button class="btn-edit" onclick="viewMemberDetail(${member.id})" style="background: linear-gradient(135deg, #0ea5e9, #38bdf8);">
            <i class="fas fa-eye"></i> Xem Chi Tiết
          </button>
        </div>
      `;
    }
   let memberTypeBadge = '';
if (member.member_type === 'in_law') {
  memberTypeBadge = '<span style="background: #fef3c7; color: #f59e0b; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px;">👰 Con dâu/rễ</span>';
}
    card.innerHTML = `
       <div class="member-header">
        ${avatarHtml}
         <div>
           <span class="generation-badge-small">Đời thứ ${member.generation || 'N/A'}</span>
            ${memberTypeBadge}
          </div>
         </div>
      <div class="member-details">
        <h3>${member.full_name} ${genderIcon}</h3>
        <div class="member-info">
          <p><i class="fas fa-birthday-cake"></i> ${member.birth_date || 'N/A'}</p>
          <p><i class="fas fa-heart"></i> <span style="color:${statusColor}">${statusText}</span></p>
          ${member.phone ? `<p><i class="fas fa-phone"></i> ${member.phone}</p>` : ''}
          ${member.job ? `<p><i class="fas fa-briefcase"></i> ${member.job}</p>` : ''}
        </div>
        ${actionsHtml}
      </div>
    `;
    // Click vào card để xem chi tiết
    card.addEventListener('click', (e) => {
      // Không trigger nếu click vào button
      if (e.target.closest('button')) return;
      viewMemberDetail(member.id);
    });

    grid.appendChild(card);
  });
}

// 5.3. Tìm kiếm đơn giản (search bar)
function setupSimpleSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    
    if (!keyword) {
      renderMembers(allMembers);
      return;
    }

    const filtered = allMembers.filter(m => 
      m.full_name.toLowerCase().includes(keyword)
    );

    renderMembers(filtered);
  });
}

// 5.4. Mở modal thêm thành viên
async function openAddMemberModal() {
  const userRole = localStorage.getItem('userRole');
  
  if (userRole === 'viewer') {
    alert('⛔ Bạn không có quyền thêm thành viên.\n\nChỉ Admin mới có thể thực hiện thao tác này.');
    return;
  }

  editingMemberId = null;
  
  const modal = document.getElementById('addMemberModal');
  const title = document.getElementById('addModalTitle');
  const form = document.getElementById('memberForm');
  
  if (!modal || !form) return;

  form.reset();
  title.textContent = 'Thêm Thành Viên';
  
  // ✅ THÊM LOGIC: Ẩn/hiện field Generation
  setupGenerationField();
  
  await loadParentOptions();
  await loadSpouseOptions();
  
  modal.classList.add('active');
}

// 5.5. Mở modal sửa thành viên
// 5.5. Mở modal sửa thành viên
async function openEditMemberModal(memberId) {
    const userRole = localStorage.getItem('userRole');
  
    if (userRole === 'viewer') {
        alert('⛔ Bạn không có quyền sửa thành viên.\n\nChỉ Admin mới có thể thực hiện thao tác này.');
        return;
    }

    editingMemberId = memberId;
  
    const modal = document.getElementById('addMemberModal');
    const title = document.getElementById('addModalTitle');
    const form = document.getElementById('memberForm');
  
    if (!modal || !form) return;

    title.textContent = 'Sửa Thành Viên';
  
    // Load thông tin member
    const data = await apiGet(`/api/members/${memberId}`);
  
    if (!data || !data.success) {
        alert('Không load được thông tin thành viên');
        return;
    }

    const member = data.member;
  
    // Điền thông tin vào form
    document.getElementById('memberName').value = member.full_name || '';
    document.getElementById('memberGender').value = member.gender === 'Nam' ? 'male' : 'female';
 document.getElementById('memberBirth').value = (member.birth_date && member.birth_date !== 'unknown') ? member.birth_date : '';
document.getElementById('memberDeath').value = (member.death_date && member.death_date !== 'unknown') ? member.death_date : '';

// ✅ Set checkbox "đã mất nhưng không rõ"
const isDeceasedUnknown = !member.is_alive && member.death_date === 'unknown';
document.getElementById('isDeceasedUnknown').checked = isDeceasedUnknown;
    document.getElementById('memberPhone').value = member.phone || '';
    document.getElementById('memberGeneration').value = member.generation || '1';
    document.getElementById('memberJob').value = member.job || '';
    document.getElementById('memberAddress').value = member.address || '';
    document.getElementById('memberNote').value = member.notes || '';
  
    // Load options
    await loadParentOptions(member.parents && member.parents.length > 0 ? member.parents[0].id : null);
    await loadSpouseOptions(member.spouse ? member.spouse.spouse_id : null);
  
    // ✅ THÊM DÒNG NÀY - Setup generation field cho chế độ edit
    // Khi edit, generation nên bị disable (không cho sửa)
    const generationSelect = document.getElementById('memberGeneration');
    const generationGroup = generationSelect.closest('.form-group');
    
    if (generationGroup && generationSelect) {
        generationGroup.style.display = 'block';
        generationSelect.disabled = true; // Không cho sửa generation khi edit
        
        // Hiển thị thông tin generation hiện tại
        generationSelect.innerHTML = `<option value="${member.generation || 1}">Thế hệ ${member.generation || 1} (Không thể sửa)</option>`;
    }
  
    modal.classList.add('active');
}
// 5.6. Đóng modal
function closeAddMemberModal() {
  const modal = document.getElementById('addMemberModal');
  if (modal) {
    modal.classList.remove('active');
  }
  editingMemberId = null;
}

// 5.7. Load danh sách cha/mẹ
async function loadParentOptions(selectedId = null) {
  const select = document.getElementById('memberParent');
  if (!select) return;

  select.innerHTML = '<option value="">-- Không có --</option>';
  
  allMembers.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.full_name} (Đời ${m.generation || 'N/A'})`;
    if (selectedId && m.id === selectedId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// 5.8. Load danh sách vợ/chồng
async function loadSpouseOptions(selectedId = null) {
  const select = document.getElementById('memberSpouse');
  if (!select) return;

  select.innerHTML = '<option value="">-- Không có --</option>';
  
  allMembers.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = `${m.full_name} (${m.gender})`;
    if (selectedId && m.id === selectedId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// 5.9. Submit form (thêm/sửa)
async function submitMemberForm(event) {
  event.preventDefault();
  
  const form = document.getElementById('memberForm');
  if (!form) return;

  const parentId = document.getElementById('memberParent').value;
  const spouseId = document.getElementById('memberSpouse').value;
  const generation = document.getElementById('memberGeneration').value;

  // ✅ VALIDATION MỚI
  
  // TH1: Thủy tổ (đời 1)
  if (generation == '1') {
    if (parentId) {
      alert('⚠️ Thủy tổ (đời 1) không được có cha/mẹ');
      return;
    }
    // Thủy tổ có thể có hoặc không có vợ/chồng
  }
  
  // TH2: Đời > 1
  else {
    // Phải có ít nhất 1 trong 2: cha/mẹ HOẶC vợ/chồng
    if (!parentId && !spouseId) {
      alert('⚠️ Thành viên đời > 1 phải có cha/mẹ (con ruột) hoặc vợ/chồng (con dâu/rễ)');
      return;
    }
    
    // Nếu có cả cha/mẹ và vợ/chồng → Con ruột (ưu tiên)
    // Nếu chỉ có vợ/chồng → Con dâu/rễ
  }

  // Thu thập dữ liệu
  // Lấy giá trị checkbox "đã mất nhưng không rõ ngày"
const isDeceasedUnknown = document.getElementById('isDeceasedUnknown').checked;
const deathDateInput = document.getElementById('memberDeath').value;

// Xử lý death_date
let death_date = null;
let is_alive = 1;

if (deathDateInput) {
    // Có ngày mất cụ thể
    death_date = deathDateInput;
    is_alive = 0;
} else if (isDeceasedUnknown) {
    // Đã mất nhưng không rõ ngày → dùng giá trị đặc biệt
    death_date = 'unknown';
    is_alive = 0;
} else {
    // Còn sống hoặc để trống
    death_date = null;
    is_alive = 1;
}

const data = {
    full_name: document.getElementById('memberName').value.trim(),
    gender: document.getElementById('memberGender').value === 'male' ? 'Nam' : 'Nữ',
    birth_date: document.getElementById('memberBirth').value || null, // ✅ Cho phép null
    death_date: death_date,
    is_alive: is_alive, // ✅ Thêm field này
    phone: document.getElementById('memberPhone').value.trim(),
    generation: generation,
    job: document.getElementById('memberJob').value.trim(),
    address: document.getElementById('memberAddress').value.trim(),
    notes: document.getElementById('memberNote').value.trim(),
    parent_id: parentId || null,
    spouse_id: spouseId || null,
    member_type: parentId ? 'blood' : 'in_law'
};

  if (!data.full_name) {
    alert('Vui lòng nhập họ tên');
    return;
  }

  try {
    let result;
    
    if (editingMemberId) {
      result = await apiPut(`/api/members/${editingMemberId}`, data);
    } else {
      result = await apiPost('/api/members', data);
    }

    if (result && result.success) {
      alert(result.message || 'Thành công');
      closeAddMemberModal();
      await loadMembers();
    } else {
      alert(result.message || 'Có lỗi xảy ra');
    }
  } catch (err) {
    console.error('Lỗi submit:', err);
    alert('Không thể kết nối server');
  }
}

// 5.10. Xóa thành viên
async function deleteMember(memberId) {
    const userRole = localStorage.getItem('userRole');
  
  // Chặn nếu là viewer
  if (userRole === 'viewer') {
    alert('⛔ Bạn không có quyền xóa thành viên.\n\nChỉ Admin mới có thể thực hiện thao tác này.');
    return;
  }
  if (!confirm('Bạn chắc chắn muốn xóa thành viên này?\nMọi quan hệ liên quan cũng sẽ bị xóa.')) {
    return;
  }

  try {
    const result = await apiDelete(`/api/members/${memberId}`);
    
    if (result && result.success) {
      alert('Xóa thành công');
      await loadMembers();
    } else {
      alert(result.message || 'Có lỗi xảy ra');
    }
  } catch (err) {
    console.error('Lỗi xóa:', err);
    alert('Không thể kết nối server');
  }
}

// 5.11. Xem chi tiết thành viên
async function viewMemberDetail(memberId) {
  try {
    const data = await apiGet(`/api/members/${memberId}`);
    
    if (!data || !data.success) {
      alert('Không load được thông tin');
      return;
    }

    const member = data.member;
    const modal = document.getElementById('memberModal');
    const content = document.getElementById('memberDetailContent');
    const memberTypeText = member.member_type === 'in_law' 
  ? '👰 Con dâu/rễ '
  : '👨‍👩‍👧‍👦 Con ruột';
    if (!modal || !content) return;

    // Render chi tiết
    const avatarHtml = member.avatar 
      ? `<img src="${member.avatar}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;" />`
      : `<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#f97316,#fbbf24);display:flex;align-items:center;justify-content:center;color:white;font-size:36px;font-weight:bold;">${member.full_name.charAt(0)}</div>`;

let statusText = '';
let statusColor = '';

if (member.is_alive) {
  const age = calculateAge(member.birth_date);
  statusText = age > 0 ? `${age} tuổi` : '🔸 Không rõ tuổi';
  statusColor = age > 0 ? '#10b981' : '#f59e0b';
} else {
  // Người đã mất
  if (member.death_date === 'unknown') {
    statusText = '⚰️ Đã mất (không rõ ngày)';
  } else if (member.death_date) {
    statusText = `⚰️ Mất ${member.death_date}`;
  } else {
    statusText = '⚰️ Đã mất';
  }
  statusColor = '#6b7280';
}
    const parentsHtml = member.parents && member.parents.length > 0
      ? member.parents.map(p => `<span>${p.full_name}</span>`).join(', ')
      : 'Không có';

    const spouseHtml = member.spouse 
      ? member.spouse.spouse_name 
      : 'Không có';

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:20px;">
        <div style="text-align:center;">
          ${avatarHtml}
          <h2 style="margin-top:12px;">${member.full_name}</h2>
          <p style="color:${statusColor};font-weight:600;">${statusText}</p>
        </div>
        <div style="grid-column:1/-1;"><strong>Loại thành viên:</strong> ${memberTypeText}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><strong>Giới tính:</strong> ${member.gender || 'N/A'}</div>
          <div><strong>Thế hệ:</strong> Đời ${member.generation || 'N/A'}</div>
         <div><strong>Ngày sinh:</strong> ${member.birth_date && member.birth_date !== 'unknown' ? member.birth_date : '🔸 Không rõ'}</div>
<div><strong>Ngày mất:</strong> ${
  member.is_alive 
    ? 'Còn sống' 
    : (member.death_date === 'unknown' ? '⚰️ Không rõ' : member.death_date || '⚰️ Không rõ')
}</div>
          <div><strong>Số điện thoại:</strong> ${member.phone || 'N/A'}</div>
          <div><strong>Nghề nghiệp:</strong> ${member.job || 'N/A'}</div>
          <div style="grid-column:1/-1;"><strong>Địa chỉ:</strong> ${member.address || 'N/A'}</div>
          <div style="grid-column:1/-1;"><strong>Cha/Mẹ:</strong> ${parentsHtml}</div>
          <div style="grid-column:1/-1;"><strong>Vợ/Chồng:</strong> ${spouseHtml}</div>
        </div>

        ${member.biography ? `
          <div>
            <strong>Tiểu sử:</strong>
            <p style="margin-top:8px;line-height:1.6;">${member.biography}</p>
          </div>
        ` : ''}

        ${member.notes ? `
          <div>
            <strong>Ghi chú:</strong>
            <p style="margin-top:8px;line-height:1.6;">${member.notes}</p>
          </div>
        ` : ''}
      </div>
    `;

    modal.classList.add('active');
  } catch (err) {
    console.error('Lỗi viewMemberDetail:', err);
  }
}

// 5.12. Đóng modal chi tiết
function closeMemberModal() {
  const modal = document.getElementById('memberModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/* ==========================================================
6. XỬ LÝ TÌM KIẾM NÂNG CAO
========================================================== */

// 6.1. Mở modal tìm kiếm nâng cao
// 6.1. Mở modal tìm kiếm nâng cao
async function openAdvancedSearch() {
  const modal = document.getElementById('advancedSearchModal');
  const form = document.getElementById('advancedSearchForm');
  
  if (!modal || !form) return;

  form.reset();
  
  // ✅ THÊM DÒNG NÀY - Load generation options
  await loadGenerationOptions();
  
  restrictViewerInAdvancedSearch();
  modal.classList.add('active');
}

// 6.2. Đóng modal tìm kiếm
function closeAdvancedSearch() {
  const modal = document.getElementById('advancedSearchModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// 6.3. Reset tìm kiếm
function resetAdvancedSearch() {
  const form = document.getElementById('advancedSearchForm');
  if (form) {
    form.reset();
  }
  renderMembers(allMembers);
}

// 6.4. Thực hiện tìm kiếm nâng cao
async function performAdvancedSearch() {
  const filters = {
    name: document.getElementById('searchName').value.trim(),
    generation: document.getElementById('searchGeneration').value,
    gender: document.getElementById('searchGender').value,
    status: document.getElementById('searchStatus').value,
    job: document.getElementById('searchJob').value.trim(),
    ageMin: document.getElementById('searchAgeMin').value,
    ageMax: document.getElementById('searchAgeMax').value,
    address: document.getElementById('searchAddress').value.trim()
  };

  try {
    const result = await apiPost('/api/members/search', filters);
    
    if (result && result.success) {
      const members = result.members || [];
      renderMembers(members);
      
      // Hiển thị thông báo kết quả
      alert(`Tìm thấy ${result.count || 0} kết quả`);
      
      closeAdvancedSearch();
    } else {
      alert('Có lỗi khi tìm kiếm');
    }
  } catch (err) {
    console.error('Lỗi tìm kiếm:', err);
    alert('Không thể kết nối server');
  }
}

/* ==========================================================
7. XỬ LÝ SETTINGS
========================================================== */

async function exportPDF() {
  if (!confirm('Bạn muốn xuất toàn bộ gia phả ra file PDF?')) {
    return;
  }

  try {
    const token = getAuthToken();
    if (!token) {
      window.location.href = "/login";
      return;
    }

    // Hiển thị loading
    alert('⏳ Đang tạo file PDF, vui lòng đợi...');

    const response = await fetch('/api/settings/export-pdf', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      throw new Error('Không thể tạo PDF');
    }

    // Tải file PDF về máy
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gia-pha-${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    alert('✅ Xuất PDF thành công!');
  } catch (err) {
    console.error('Lỗi exportPDF:', err);
    alert('❌ Có lỗi khi xuất PDF');
  }
}
async function importData() {
  // Tạo input file ẩn
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('Chỉ chấp nhận file CSV');
      return;
    }

    if (!confirm(`Bạn muốn import file: ${file.name}?\n\nFormat CSV cần có:\n- full_name (bắt buộc)\n- gender (Nam/Nữ)\n- birth_date (YYYY-MM-DD)\n- death_date (YYYY-MM-DD)\n- generation, notes, phone, job, address (tùy chọn)`)) {
      return;
    }

    try {
      const token = getAuthToken();
      if (!token) {
        window.location.href = "/login";
        return;
      }

      // Tạo FormData
      const formData = new FormData();
      formData.append('file', file);

      // Upload
      const response = await fetch('/api/settings/import-csv', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = "/login";
        return;
      }

      const result = await response.json();

   if (result.success) {
  let message = `✅ ${result.message}\n\nThành công: ${result.successCount}\nLỗi: ${result.errorCount}`;
  
  // ✅ HIỂN THỊ CHI TIẾT LỖI
  if (result.errors && result.errors.length > 0) {
    message += '\n\n📋 CHI TIẾT LỖI:\n' + '='.repeat(50) + '\n';
    message += result.errors.slice(0, 20).join('\n'); // Chỉ hiện 20 lỗi đầu
    
    if (result.errors.length > 20) {
      message += `\n\n... và ${result.errors.length - 20} lỗi khác`;
    }
    
    // ✅ IN RA CONSOLE ĐỂ COPY DỄ DÀNG
    console.log('=== CHI TIẾT LỖI IMPORT ===');
    result.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. ${err}`);
    });
    console.log('=== KẾT THÚC ===');
  }
  
  alert(message);
        // Reload danh sách members
        await loadMembers();
      } else {
        alert(`❌ ${result.message}`);
      }

    } catch (err) {
      console.error('Lỗi import:', err);
      alert('❌ Có lỗi khi import dữ liệu');
    }
  };

  input.click();
}
function downloadSampleCSV() {
  const csvContent = `full_name,gender,birth_date,death_date,generation,notes,phone,job,address,parent_name,spouse_name
Nguyễn Văn A,Nam,1880-01-15,1945-08-20,1,Thủy tổ dòng họ,0912345678,Nông dân,Hà Nội,,Trần Thị B
Trần Thị B,Nữ,unknown,1952-06-12,1,Vợ cụ A - Không rõ ngày sinh,0987654321,Dệt vải,Hà Nội,,Nguyễn Văn A
Nguyễn Văn C,Nam,1905-04-20,unknown,2,Đã mất nhưng không rõ ngày,0912345679,Quan lại,Hà Nội,Nguyễn Văn A,Lê Thị D
Lê Thị X,Nữ,unknown,unknown,2,Không rõ cả ngày sinh và mất,0912345690,Không rõ,Hà Nội,Nguyễn Văn A,`;

  // Tạo BOM cho UTF-8
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mau-import-gia-pha.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  alert(`✅ Đã tải file mẫu!

📋 CẤU TRÚC FILE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 CÁC CỘT BẮT BUỘC:
   • full_name - Họ và tên đầy đủ
   • gender - "Nam" hoặc "Nữ"  
   • birth_date - Ngày sinh (YYYY-MM-DD)
   • generation - Thế hệ (1, 2, 3...)

📌 QUY TẮC QUAN TRỌNG:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ THỦY TỔ (ĐỜI 1):
   ✅ generation = 1
   ✅ parent_name = TRỐNG
   ✅ spouse_name = tên vợ/chồng (nếu có)

2️⃣ CON RUỘT (ĐỜI > 1):
   ✅ CÓ parent_name → tự động tính generation
   ✅ member_type = "blood" (tự động)

3️⃣ CON DÂU/RỂ (ĐỜI > 1):
   ✅ KHÔNG CÓ parent_name
   ✅ CÓ spouse_name → generation = generation của vợ/chồng
   ✅ member_type = "in_law" (tự động)

⚠️ THỨ TỰ QUAN TRỌNG:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   • Import cha/mẹ TRƯỚC
   • Import con SAU
   • Import theo đúng thứ tự đời 1 → 2 → 3 → ...

💡 VÍ DỤ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dòng 1: Nguyễn Văn A (thủy tổ, đời 1, không có parent)
Dòng 2: Trần Thị B (vợ A, đời 1, không có parent, có spouse = A)
Dòng 3: Nguyễn Văn C (con A, đời 2, có parent = A, có spouse = D)
Dòng 4: Lê Thị D (con dâu, đời 2, KHÔNG có parent, có spouse = C)`);
}
/* ==========================================================
   8. XÓA TOÀN BỘ THÀNH VIÊN (CHỈ OWNER)
========================================================== */
async function deleteAllMembers() {
  // Xác nhận lần 1
  if (!confirm('⚠️ BẠN CHẮC CHẮN MUỐN XÓA TẤT CẢ THÀNH VIÊN?\n\n❌ Hành động này sẽ:\n- Xóa TẤT CẢ thành viên trong gia phả\n- Xóa TẤT CẢ mối quan hệ\n- Xóa TẤT CẢ hôn nhân\n\n⚠️ KHÔNG THỂ HOÀN TÁC!')) {
    return;
  }

  // Xác nhận lần 2
  if (!confirm('⚠️ XÁC NHẬN LẦN CUỐI!\n\nBạn có THỰC SỰ muốn xóa toàn bộ không?')) {
    return;
  }

  try {
    const result = await apiDelete('/api/settings/delete-all-members');

    if (result && result.success) {
      alert('✅ ' + result.message);
      
      // Reload lại trang để cập nhật UI
      window.location.reload();
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('Lỗi deleteAllMembers:', err);
    alert('❌ Không thể kết nối server');
  }
}
/* ==========================================================
10. QUẢN LÝ VIEWER (CHỈ ADMIN)
========================================================== */

// 10.1. Hiển thị card Quản lý Viewer nếu là admin
// Thêm vào function showViewerManagementIfAdmin()
function showViewerManagementIfAdmin() {
  const userRole = localStorage.getItem('userRole');
  
  if (userRole === 'owner') {
    const viewerCard = document.getElementById('viewerManagementCard');
    if (viewerCard) viewerCard.style.display = 'block';
    
    // THÊM DÒNG NÀY
    const clearLogsCard = document.getElementById('clearLogsCard');
    if (clearLogsCard) clearLogsCard.style.display = 'block';
      const deleteAllCard = document.getElementById('deleteAllMembersCard');
    if (deleteAllCard) deleteAllCard.style.display = 'block';
  }
}

// 10.2. Mở modal quản lý viewer
async function openViewerManagement() {
  const modal = document.getElementById('viewerModal');
  if (!modal) return;

  modal.classList.add('active');
  await loadViewers();
}

// 10.3. Đóng modal
function closeViewerModal() {
  const modal = document.getElementById('viewerModal');
  if (modal) {
    modal.classList.remove('active');
  }
  
  // Ẩn form tạo mới
  const form = document.getElementById('createViewerForm');
  if (form) form.style.display = 'none';
}

// 10.4. Load danh sách viewer
async function loadViewers() {
  try {
    const data = await apiGet('/api/viewers');
    
    if (!data || !data.success) {
      console.error('Không load được viewers');
      return;
    }

    renderViewers(data.viewers || []);
  } catch (err) {
    console.error('Lỗi loadViewers:', err);
  }
}

// 10.5. Render danh sách viewer
function renderViewers(viewers) {
  const container = document.getElementById('viewerList');
  const emptyState = document.getElementById('viewerEmptyState');
  
  if (!container) return;

  container.innerHTML = '';

  if (viewers.length === 0) {
    container.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  container.style.display = 'grid';
  if (emptyState) emptyState.style.display = 'none';

  viewers.forEach(viewer => {
    const card = document.createElement('div');
    card.className = 'viewer-card';

    const createdDate = new Date(viewer.created_at).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    card.innerHTML = `
      <div class="viewer-card-header">
        <div style="flex: 1;">
          <h3 class="viewer-card-title">
            <i class="fas fa-user" style="color: #8b5cf6;"></i>
            ${viewer.full_name}
          </h3>
          <span class="viewer-badge">
            <i class="fas fa-eye"></i> Viewer
          </span>
        </div>
      </div>

      <div style="margin: 16px 0;">
        <div class="viewer-card-code">
          <i class="fas fa-key"></i>
          <span>${viewer.viewer_code}</span>
        </div>
      </div>

      <div class="viewer-card-info">
        <div>
          <i class="fas fa-calendar" style="width: 16px;"></i>
          <strong>Ngày tạo:</strong> ${createdDate}
        </div>
        <div>
          <i class="fas fa-shield-alt" style="width: 16px;"></i>
          <strong>Quyền:</strong> Chỉ xem (Không thể sửa/xóa)
        </div>
      </div>

      <div class="viewer-card-actions" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <button class="btn-copy" onclick="copyViewerCode('${viewer.viewer_code}')" title="Copy mã">
          <i class="fas fa-copy"></i>
          Copy Mã
        </button>
        <button class="btn-delete" onclick="deleteViewerAccount(${viewer.id})" title="Xóa viewer">
          <i class="fas fa-trash"></i>
          Xóa
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// 10.6. Mở form tạo viewer
function openCreateViewerForm() {
  const form = document.getElementById('createViewerForm');
  if (form) {
    form.style.display = 'block';
    document.getElementById('newViewerName').value = '';
    document.getElementById('newViewerName').focus();
  }
}

// 10.7. Hủy tạo viewer
// 10.7. Hủy tạo viewer
function cancelCreateViewer() {
  const form = document.getElementById('createViewerForm');
  if (form) {
    form.style.display = 'none';
    document.getElementById('newViewerName').value = '';
    document.getElementById('newViewerPassword').value = ''; // THÊM DÒNG NÀY
  }
}

// 10.8. Submit tạo viewer
// 10.8. Submit tạo viewer
async function submitCreateViewer() {
  const nameInput = document.getElementById('newViewerName');
  const passwordInput = document.getElementById('newViewerPassword');
  
  const name = nameInput.value.trim();
  const password = passwordInput.value;

  // Validate name
  if (!name) {
    alert('⚠️ Vui lòng nhập họ tên');
    nameInput.focus();
    return;
  }

  // Validate password
  if (!password) {
    alert('⚠️ Vui lòng nhập mật khẩu');
    passwordInput.focus();
    return;
  }

  if (password.length < 6) {
    alert('⚠️ Mật khẩu phải có ít nhất 6 ký tự');
    passwordInput.focus();
    return;
  }

  try {
    const result = await apiPost('/api/viewers', { 
      full_name: name,
      password: password 
    });

    if (result && result.success) {
      const viewer = result.viewer;
      
      // Hiển thị thông báo với mã và password
      alert(`✅ Tạo viewer thành công!

👤 Họ tên: ${viewer.full_name}
🔑 Mã đăng nhập: ${viewer.viewer_code}
🔐 Mật khẩu: ${viewer.password}

📋 Hướng dẫn cho người xem:
1. Truy cập: ${window.location.origin}
2. Chọn role "Viewer"
3. Nhập mã: ${viewer.viewer_code}
4. Nhập mật khẩu: ${viewer.password}

⚠️ Lưu ý: Thông tin này chỉ hiển thị một lần, hãy lưu lại!`);
      
      // Copy thông tin vào clipboard
      const info = `Mã: ${viewer.viewer_code}\nMật khẩu: ${viewer.password}`;
      copyToClipboard(info);
      
      cancelCreateViewer();
      await loadViewers();
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('Lỗi tạo viewer:', err);
    alert('❌ Không thể kết nối server');
  }
}

// Helper function copy
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showCopyNotification('✅ Đã copy thông tin đăng nhập');
    }).catch(() => {
      // Fallback
    });
  }
}

// 10.9. Copy viewer code
function copyViewerCode(code) {
  // Thử dùng Clipboard API (modern browsers)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      showCopyNotification(`✅ Đã copy mã: ${code}`);
    }).catch(() => {
      fallbackCopy(code);
    });
  } else {
    fallbackCopy(code);
  }
}

// Fallback copy method
function fallbackCopy(code) {
  const input = document.createElement('input');
  input.value = code;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  
  try {
    document.execCommand('copy');
    showCopyNotification(`✅ Đã copy mã: ${code}`);
  } catch (err) {
    alert(`Mã viewer: ${code}\n\n(Hãy copy thủ công)`);
  }
  
  document.body.removeChild(input);
}

// Hiển thị thông báo copy
function showCopyNotification(message) {
  // Tạo notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #10b981, #34d399);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
    z-index: 10000;
    font-weight: 600;
    animation: slideInRight 0.3s ease;
  `;
  notification.innerHTML = `
    <i class="fas fa-check-circle"></i> ${message}
  `;
  
  document.body.appendChild(notification);
  
  // Tự động ẩn sau 3 giây
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// 10.10. Xóa viewer
async function deleteViewerAccount(viewerId) {
  if (!confirm('⚠️ Bạn chắc chắn muốn xóa viewer này?\n\n❌ Viewer sẽ không thể đăng nhập nữa.\n✅ Dữ liệu gia phả vẫn được giữ nguyên.')) {
    return;
  }

  try {
    const result = await apiDelete(`/api/viewers/${viewerId}`);

    if (result && result.success) {
      showCopyNotification('✅ Đã xóa viewer');
      await loadViewers();
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('Lỗi xóa viewer:', err);
    alert('❌ Không thể kết nối server');
  }
}
async function resetData() {
  if (!confirm('⚠️ BẠN CHẮC CHẮN MUỐN RESET TOÀN BỘ DỮ LIỆU?\n\n❌ Hành động này sẽ:\n- Xóa TẤT CẢ thành viên hiện tại\n- Xóa TẤT CẢ mối quan hệ\n- Load lại dữ liệu mẫu ban đầu\n\n⚠️ KHÔNG THỂ HOÀN TÁC!')) {
    return;
  }

  if (!confirm('⚠️ XÁC NHẬN LẦN CUỐI!\n\nBạn có THỰC SỰ muốn reset không?')) {
    return;
  }

  try {
    const result = await apiPost('/api/settings/reset-data', {});

    if (result && result.success) {
      alert('✅ ' + result.message);
      
      // Reload lại trang để cập nhật dữ liệu mới
      window.location.reload();
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('Lỗi reset:', err);
    alert('❌ Không thể kết nối server');
  }
}
/* ==========================================================
8. HÀM GỌI API BỔ SUNG (POST, PUT, DELETE)
========================================================== */

async function apiPost(url, body) {
  const token = getAuthToken();
  if (!token) {
    window.location.href = "/login";
    return { success: false, message: "Chưa đăng nhập" };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (res.status === 401) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    window.location.href = "/login";
    return { success: false, message: "Hết phiên đăng nhập" };
  }

  return res.json();
}

async function apiPut(url, body) {
  const token = getAuthToken();
  if (!token) {
    window.location.href = "/login";
    return { success: false, message: "Chưa đăng nhập" };
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (res.status === 401) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    window.location.href = "/login";
    return { success: false, message: "Hết phiên đăng nhập" };
  }

  return res.json();
}

async function apiDelete(url) {
  const token = getAuthToken();
  if (!token) {
    window.location.href = "/login";
    return { success: false, message: "Chưa đăng nhập" };
  }

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (res.status === 401) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    window.location.href = "/login";
    return { success: false, message: "Hết phiên đăng nhập" };
  }

  return res.json();
} 
/* ==========================================================
12. QUẢN LÝ BÀI VIẾT
========================================================== */

// Biến global
let editingPostId = null;

// 12.1. Load tất cả bài viết
async function loadPosts() {
  console.log('🔍 loadPosts() called');
  
  try {
    const data = await apiGet('/api/posts');
    
    console.log('📦 API Response:', data);
    
    if (!data || !data.success) {
      console.error('❌ Không load được posts');
      return;
    }

    console.log('✅ Posts loaded:', data.posts.length);
    renderPosts(data.posts || []);
  } catch (err) {
    console.error('💥 Lỗi loadPosts:', err);
  }
}

// 12.2. Render danh sách bài viết
function renderPosts(posts) {
  console.log('🎨 renderPosts() called with', posts.length, 'posts');
  
  const grid = document.getElementById('postsGrid');
  const emptyState = document.getElementById('postsEmptyState');
  
  if (!grid) {
    console.error('❌ Không tìm thấy element #postsGrid');
    return;
  }

  grid.innerHTML = '';

  if (posts.length === 0) {
    grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  if (emptyState) emptyState.style.display = 'none';

  const userRole = localStorage.getItem('userRole');
  const token = localStorage.getItem('authToken');
  const userId = token ? parseInt(token.split('_')[1]) : 0;

  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
      cursor: pointer;
    `;

    card.onmouseenter = () => {
      card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
      card.style.transform = 'translateY(-2px)';
    };

    card.onmouseleave = () => {
      card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      card.style.transform = 'translateY(0)';
    };
    
    // Icon theo category
    const categoryIcons = {
      'announcement': '📢',
      'event': '🎉',
      'news': '📰'
    };

    const categoryNames = {
      'announcement': 'Thông báo',
      'event': 'Sự kiện',
      'news': 'Tin tức'
    };

    const icon = categoryIcons[post.category] || '📰';
    const categoryName = categoryNames[post.category] || 'Khác';

    // Định dạng ngày
    const createdDate = new Date(post.created_at).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Rút gọn nội dung
    const shortContent = post.content.length > 150 
      ? post.content.substring(0, 150) + '...'
      : post.content;

    // Badge author
    const authorBadge = post.author_role === 'viewer' 
      ? '<span style="background: #dbeafe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 11px;">👁️ Viewer</span>'
      : '<span style="background: #fed7aa; color: #c2410c; padding: 2px 8px; border-radius: 4px; font-size: 11px;">👑 Admin</span>';

    // Kiểm tra quyền sửa/xóa
    const canEdit = (post.author_id === userId);
    const canDelete = (userRole === 'owner') || (post.author_id === userId);

    let actionsHtml = '';
    if (canEdit || canDelete) {
      actionsHtml = `<div class="post-actions" style="display: flex; gap: 8px;">`;
      
      if (canEdit) {
        actionsHtml += `
          <button class="btn-edit" onclick="event.stopPropagation(); openEditPostModal(${post.id})" 
                  style="padding: 4px 8px; font-size: 12px; background: linear-gradient(135deg, #0ea5e9, #38bdf8); color: white; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-edit"></i> Sửa
          </button>
        `;
      }
      
      if (canDelete) {
        actionsHtml += `
          <button class="btn-delete" onclick="event.stopPropagation(); deletePost(${post.id})" 
                  style="padding: 4px 8px; font-size: 12px; background: linear-gradient(135deg, #ef4444, #f87171); color: white; border: none; border-radius: 6px; cursor: pointer;">
            <i class="fas fa-trash"></i> Xóa
          </button>
        `;
      }
      
      actionsHtml += `</div>`;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
         <h3 style="font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">${post.title}</h3>
          <div style="display: flex; gap: 12px; font-size: 12px; color: #666; flex-wrap: wrap;">
            <span>${icon} ${categoryName}</span>
            <span>•</span>
            <span><i class="fas fa-user"></i> ${post.author_name || 'Unknown'}</span>
            ${authorBadge}
            <span>•</span>
            <span><i class="fas fa-clock"></i> ${createdDate}</span>
          </div>
        </div>
        ${actionsHtml}
      </div>

      <div style="margin: 12px 0; line-height: 1.6; color: #374151;">${shortContent}</div>

      <button onclick="event.stopPropagation(); viewPostDetail(${post.id})" style="padding: 8px 16px; background: linear-gradient(135deg, #0ea5e9, #38bdf8); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">
        <i class="fas fa-book-open"></i> Đọc tiếp
      </button>
    `;

    // Click vào card để xem chi tiết
    card.addEventListener('click', () => {
      viewPostDetail(post.id);
    });

    grid.appendChild(card);
  });
  
  console.log('✅ renderPosts completed');
}

// 12.3. Mở modal tạo bài viết
function openCreatePostModal() {
  console.log('📝 openCreatePostModal() called');
  
  editingPostId = null;
  
  const modal = document.getElementById('postModal');
  const title = document.getElementById('postModalTitle');
  const form = document.getElementById('postForm');
  
  if (!modal || !form) {
    console.error('❌ Modal hoặc form không tồn tại');
    return;
  }

  // Reset form
  form.reset();
  title.textContent = '✍️ Tạo Bài Viết';
  
  modal.classList.add('active');
  console.log('✅ Modal opened');
}

// 12.4. Mở modal sửa bài viết
async function openEditPostModal(postId) {
  console.log('✏️ openEditPostModal() called with ID:', postId);
  
  editingPostId = postId;
  
  const modal = document.getElementById('postModal');
  const title = document.getElementById('postModalTitle');
  const form = document.getElementById('postForm');
  
  if (!modal || !form) return;

  title.textContent = '✏️ Sửa Bài Viết';
  
  // Load thông tin bài viết
  const data = await apiGet(`/api/posts/${postId}`);
  
  if (!data || !data.success) {
    alert('Không load được bài viết');
    return;
  }

  const post = data.post;
  
  // Điền vào form
  document.getElementById('postTitle').value = post.title || '';
  document.getElementById('postCategory').value = post.category || 'announcement';
  document.getElementById('postContent').value = post.content || '';
  document.getElementById('postPinned').checked = post.is_pinned === 1;
  
  modal.classList.add('active');
  console.log('✅ Edit modal opened');
}

// 12.5. Đóng modal tạo/sửa
function closePostModal() {
  const modal = document.getElementById('postModal');
  if (modal) {
    modal.classList.remove('active');
  }
  editingPostId = null;
}

// 12.6. Submit form tạo/sửa
async function submitPostForm(event) {
  event.preventDefault();
  console.log('💾 submitPostForm() called');
  
  const data = {
    title: document.getElementById('postTitle').value.trim(),
    content: document.getElementById('postContent').value.trim(),
    category: document.getElementById('postCategory').value,
    is_pinned: document.getElementById('postPinned').checked
  };

  console.log('📤 Submitting data:', data);

  if (!data.title || !data.content) {
    alert('Vui lòng nhập đầy đủ thông tin');
    return;
  }

  try {
    let result;
    
    if (editingPostId) {
      // Sửa
      console.log('✏️ Updating post ID:', editingPostId);
      result = await apiPut(`/api/posts/${editingPostId}`, data);
    } else {
      // Tạo mới
      console.log('✍️ Creating new post');
      result = await apiPost('/api/posts', data);
    }

    console.log('📥 Result:', result);

    if (result && result.success) {
      alert('✅ ' + result.message);
      closePostModal();
      await loadPosts();
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('💥 Lỗi submit post:', err);
    alert('❌ Không thể kết nối server');
  }
}

// 12.7. Xem chi tiết bài viết
async function viewPostDetail(postId) {
  console.log('👁️ viewPostDetail() called with ID:', postId);
  
  try {
    const data = await apiGet(`/api/posts/${postId}`);
    
    if (!data || !data.success) {
      alert('Không load được bài viết');
      return;
    }

    const post = data.post;
    const modal = document.getElementById('viewPostModal');
    const titleEl = document.getElementById('viewPostTitle');
    const metaEl = document.getElementById('viewPostMeta');
    const contentEl = document.getElementById('viewPostContent');
    const actionsEl = document.getElementById('viewPostActions');
    
    if (!modal) return;

    // Tiêu đề
    const categoryIcons = { 'announcement': '📢', 'event': '🎉', 'news': '📰' };
    const icon = categoryIcons[post.category] || '📰';
    titleEl.textContent = `${icon} ${post.title}`;

    // Meta
    const createdDate = new Date(post.created_at).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const authorBadge = post.author_role === 'viewer'
      ? '<span style="background: #dbeafe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 11px;">👁️ Viewer</span>'
      : '<span style="background: #fed7aa; color: #c2410c; padding: 2px 8px; border-radius: 4px; font-size: 11px;">👑 Admin</span>';

    metaEl.innerHTML = `
      <span><i class="fas fa-user"></i> ${post.author_name || 'Unknown'}</span>
      ${authorBadge}
      <span>•</span>
      <span><i class="fas fa-calendar"></i> ${createdDate}</span>
      ${post.is_pinned ? '<span style="color: #f97316;">📌 Ghim</span>' : ''}
    `;

    // Nội dung
    contentEl.textContent = post.content;

    // Actions
    const userRole = localStorage.getItem('userRole');
    const token = localStorage.getItem('authToken');
    const userId = token ? parseInt(token.split('_')[1]) : 0;
    const canEdit = (post.author_id === userId);
const canDelete = (userRole === 'owner') || (post.author_id === userId);

actionsEl.innerHTML = '';

if (canEdit || canDelete) {
  let buttonsHtml = '';
  
  if (canEdit) {
    buttonsHtml += `
      <button class="btn-edit" onclick="closeViewPostModal(); openEditPostModal(${post.id});" 
              style="padding: 6px 12px; font-size: 13px; background: linear-gradient(135deg, #0ea5e9, #38bdf8); color: white; border: none; border-radius: 8px; cursor: pointer;">
        <i class="fas fa-edit"></i> Sửa
      </button>
    `;
  }
  
  if (canDelete) {
    buttonsHtml += `
      <button class="btn-delete" onclick="closeViewPostModal(); deletePost(${post.id});" 
              style="padding: 6px 12px; font-size: 13px; background: linear-gradient(135deg, #ef4444, #f87171); color: white; border: none; border-radius: 8px; cursor: pointer;">
        <i class="fas fa-trash"></i> Xóa
      </button>
    `;
  }
  
  actionsEl.innerHTML = buttonsHtml;
}

    modal.classList.add('active');
    console.log('✅ View modal opened');
  } catch (err) {
    console.error('💥 Lỗi viewPostDetail:', err);
  }
}

// 12.8. Đóng modal xem chi tiết
function closeViewPostModal() {
  const modal = document.getElementById('viewPostModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// 12.9. Xóa bài viết
async function deletePost(postId) {
  console.log('🗑️ deletePost() called with ID:', postId);
  
  if (!confirm('⚠️ Bạn chắc chắn muốn xóa bài viết này?')) {
    return;
  }

  try {
    const result = await apiDelete(`/api/posts/${postId}`);

    if (result && result.success) {
      alert('✅ Xóa bài viết thành công');
      await loadPosts();
    } else {
      alert('❌ ' + (result.message || 'Có lỗi xảy ra'));
    }
  } catch (err) {
    console.error('💥 Lỗi deletePost:', err);
    alert('❌ Không thể kết nối server');
  }
}
document.addEventListener('DOMContentLoaded', () => {
  
    if (!ensureAuth()) return;
    // Hiển thị banner cho viewer
showViewerNotice();
    // Hiển thị thông tin user
    const userName = localStorage.getItem('userName') || 'User';
    const userRole = localStorage.getItem('userRole') || 'viewer';
    
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    
    if (userNameEl) userNameEl.textContent = userName;
    if (userRoleEl) {
    userRoleEl.textContent = userRole === 'owner' ? '👑 Admin' : '👁️ Viewer';
    userRoleEl.className = `role-badge ${userRole}`;
}
 const token = localStorage.getItem('authToken');
 showViewerManagementIfAdmin();
    hideSettingsForViewer(); 
     // ✅ THÊM DÒNG NÀY (tùy chọn)
    loadGenerationOptions();
    if (token) {
        const tokenParts = token.split('_');
        if (tokenParts.length >= 2) {
            const ownerId = tokenParts[1];
            const ownerIdEl = document.getElementById('ownerIdDisplay');
            if (ownerIdEl) {
                ownerIdEl.textContent = ownerId;
            }
        }
    }
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

    // Load stats cho Dashboard tab nếu đang active
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

    // Mỗi lần click vào tab Members thì load members
// Mỗi lần click vào tab Members thì load members
const membersBtn = document.querySelector('.tab-btn[data-target="#members"]');
if (membersBtn) {
    membersBtn.addEventListener('click', () => {
        loadMembers();
        setupSimpleSearch();
        setupMembersUI(); // THÊM DÒNG NÀY
    });
}
    // Mỗi lần click vào tab Posts thì load posts
    const postsBtn = document.querySelector('.tab-btn[data-target="#posts"]');
    if (postsBtn) {
        postsBtn.addEventListener('click', () => {
            console.log('🔘 Posts tab clicked');
            loadPosts();
        });
    }

    // Setup form submit cho posts
    const postForm = document.getElementById('postForm');
    if (postForm) {
        postForm.addEventListener('submit', submitPostForm);
    }
    // Logout
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Setup form submit cho thêm/sửa member
    const memberForm = document.getElementById('memberForm');
    if (memberForm) {
        memberForm.addEventListener('submit', submitMemberForm);
    }

    // Click outside modal để đóng
    window.addEventListener('click', (e) => {
        const memberModal = document.getElementById('memberModal');
        const addModal = document.getElementById('addMemberModal');
        const searchModal = document.getElementById('advancedSearchModal');

        if (e.target === memberModal) closeMemberModal();
        if (e.target === addModal) closeAddMemberModal();
        if (e.target === searchModal) closeAdvancedSearch();
    });

    // Load members ngay khi vào trang nếu tab members đang active
    const membersTab = document.getElementById('members');
    if (membersTab && membersTab.classList.contains('active')) {
        loadMembers();
        setupSimpleSearch();
    }

});
/* ==========================================================
   TREE CONTROLS - XỬ LÝ CÂY GIA PHẢ
========================================================== */
/**
 * Hiển thị toàn bộ cây gia phả (tất cả thủy tổ)
 */
async function showFullFamilyTree() {
    if (!treeRenderer) {
        alert('⚠️ Hệ thống cây chưa được khởi tạo. Vui lòng đợi...');
        
        // Thử khởi tạo lại
        await initFamilyTree();
        
        if (!treeRenderer) {
            alert('❌ Không thể khởi tạo cây gia phả');
            return;
        }
    }

    try {
        console.log('🌳 Đang tải toàn bộ cây gia phả...');
        
        // Hiển thị loading
        showLoadingIndicator('Đang tải toàn bộ cây gia phả...');
        
        // Gọi method mới
        await treeRenderer.renderFullTree();
        
        // Ẩn loading
        hideLoadingIndicator();
        
        // Thông báo thành công
        showNotification('✅ Đã tải toàn bộ cây gia phả', 'success');
        
        console.log('✅ Hoàn thành tải toàn bộ cây');
        
    } catch (error) {
        console.error('❌ Lỗi hiển thị toàn bộ cây:', error);
        
        hideLoadingIndicator();
        
        alert('❌ Lỗi: ' + error.message);
    }
}

/**
 * Hiển thị loading indicator
 */
function showLoadingIndicator(message = 'Đang tải...') {
    // Tạo overlay loading
    let loader = document.getElementById('treeLoader');
    
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'treeLoader';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;
        
        loader.innerHTML = `
            <div style="
                background: white;
                padding: 40px;
                border-radius: 16px;
                text-align: center;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            ">
                <div style="
                    width: 60px;
                    height: 60px;
                    border: 5px solid #e5e7eb;
                    border-top-color: #f97316;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 20px;
                "></div>
                <p style="
                    font-size: 16px;
                    font-weight: 600;
                    color: #1f2937;
                    margin: 0;
                ">${message}</p>
            </div>
        `;
        
        document.body.appendChild(loader);
        
        // Thêm animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    loader.style.display = 'flex';
}

/**
 * Ẩn loading indicator
 */
function hideLoadingIndicator() {
    const loader = document.getElementById('treeLoader');
    if (loader) {
        loader.style.display = 'none';
    }
}

/**
 * Hiển thị notification
 */
function showNotification(message, type = 'info') {
    const colors = {
        success: { bg: '#10b981', icon: 'check-circle' },
        error: { bg: '#ef4444', icon: 'exclamation-circle' },
        info: { bg: '#0ea5e9', icon: 'info-circle' }
    };
    
    const config = colors[type] || colors.info;
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${config.bg};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 10001;
        font-weight: 600;
        animation: slideInRight 0.3s ease;
    `;
    
    notification.innerHTML = `
        <i class="fas fa-${config.icon}"></i> ${message}
    `;
    
    document.body.appendChild(notification);
    
    // Tự động ẩn sau 3 giây
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}
/**
 * Khởi tạo cây gia phả
 */
async function initFamilyTree() {
    try {
        console.log('🔄 Đang khởi tạo cây gia phả...');
        
        treeRenderer = new FamilyTreeRenderer('familyTreeSvg');
        
        await treeRenderer.render(1);
        
        populatePersonDropdown();
        
        console.log('✅ Cây gia phả đã sẵn sàng');
    } catch (error) {
        console.error('❌ Lỗi khởi tạo cây:', error);
        alert('Lỗi tải cây gia phả: ' + error.message);
    }
}

/**
 * Tạo dropdown danh sách người
 */
function populatePersonDropdown() {
    const select = document.getElementById('personSelect');
    
    // ✅ Tự động hiển thị cây khi chọn người (không cần bấm nút Xem)
    select.onchange = showSelectedPersonTree;

    // ✅ Sửa lỗi xung đột màu sắc (ép buộc chữ đen nền trắng cho dropdown)
    select.style.color = '#1f2937';
    select.style.backgroundColor = '#ffffff';

    if (!treeRenderer || !treeRenderer.allPeople || treeRenderer.allPeople.length === 0) {
        select.innerHTML = '<option value="">❌ Không có dữ liệu</option>';
        return;
    }

    const sorted = [...treeRenderer.allPeople].sort((a, b) => {
        const genDiff = (a.generation || 99) - (b.generation || 99);
        if (genDiff !== 0) return genDiff;
        return (a.full_name || '').localeCompare(b.full_name || '');
    });

    select.innerHTML = '<option value="">-- Chọn người để xem cây gia phả --</option>';
    
    sorted.forEach(person => {
        const option = document.createElement('option');
        option.value = person.id;
        
        // Đảm bảo màu sắc option rõ ràng
        option.style.color = '#1f2937';
        option.style.backgroundColor = '#ffffff';
        
        const rawName = person.full_name || 'Không tên';
        const name = formatNameForTree(rawName);
        const gen = person.generation || '?';
        let year = '?';
        if (person.birth_date && person.birth_date !== 'unknown') {
            const y = new Date(person.birth_date).getFullYear();
            if (!isNaN(y)) year = y;
        }
        const status = person.is_alive ? '✅' : '⚰️';
        
        option.textContent = `${status} ${name} - Đời thứ ${gen}`;
        
        if (person.id === treeRenderer.selectedPersonId) {
            option.selected = true;
        }
        
        select.appendChild(option);
    });

    console.log(`✅ Dropdown đã tạo: ${sorted.length} người`);
}

/**
 * Hiển thị cây của người được chọn
 */
async function showSelectedPersonTree() {
    const select = document.getElementById('personSelect');
    const personId = parseInt(select.value);
    
    if (!personId) {
        alert('⚠️ Vui lòng chọn một người từ danh sách');
        return;
    }

    try {
        const person = treeRenderer.allPeople.find(p => p.id === personId);
        const name = person ? person.full_name : `ID ${personId}`;
        
        console.log(`🔄 Đang tải cây gia phả của ${name}...`);
        
        await treeRenderer.render(personId);
        
        console.log(`✅ Đã tải xong cây của ${name}`);
    } catch (error) {
        console.error('❌ Lỗi hiển thị cây:', error);
        alert('❌ Lỗi: ' + error.message);
    }
}

/**
 * Reset zoom về mặc định
 */
function resetZoom() {
    if (treeRenderer && treeRenderer.resetZoom) {
        treeRenderer.resetZoom();
        console.log('🔍 Đã đặt lại zoom');
    }
}

/**
 * Download cây dưới dạng PDF
 */
async function downloadTree() {
    if (treeRenderer && treeRenderer.exportPDF) {
        await treeRenderer.exportPDF();
    } else {
        alert('❌ Chức năng xuất PDF chưa sẵn sàng');
    }
}
/* ==========================================================
11. SETUP UI DỰA VÀO ROLE
========================================================== */

// 11.1. Ẩn/hiện các nút dựa vào role
// 11.1. Ẩn/hiện các nút dựa vào role
function setupMembersUI() {
  const userRole = localStorage.getItem('userRole');
  
  if (userRole !== 'viewer') return; // Nếu không phải viewer thì không cần làm gì
  
  // Tìm tất cả nút trong members header
  const membersHeader = document.querySelector('#members .members-header');
  if (!membersHeader) return;
  
  // Tìm tất cả button trong header
  const buttons = membersHeader.querySelectorAll('button');
  
  buttons.forEach(btn => {
    const text = btn.textContent.trim();
    if (text.includes('Thêm Thành viên')) {
      btn.style.display = 'none';
    }
  });
}
// 11.2. Ẩn tab Settings với viewer
function hideSettingsForViewer() {
  const userRole = localStorage.getItem('userRole');
  
  if (userRole === 'viewer') {
    const settingsTab = document.querySelector('.tab-btn[data-target="#settings"]');
    if (settingsTab) {
      settingsTab.style.display = 'none';
    }
  }
}
// 11.3. Hiển thị thông báo cho viewer
function showViewerNotice() {
  const userRole = localStorage.getItem('userRole');
  
  if (userRole === 'viewer') {
    // Tìm dashboard content
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    // Tạo notice banner
    const notice = document.createElement('div');
    notice.style.cssText = `
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
      border-left: 4px solid #0ea5e9;
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    `;
    
    notice.innerHTML = `
      <i class="fas fa-info-circle" style="font-size: 24px; color: #0284c7;"></i>
      <div>
        <p style="margin: 0; font-weight: 600; color: #0369a1;">
          Bạn đang ở chế độ xem (Viewer)
        </p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #0284c7;">
          Bạn có thể xem thông tin gia phả nhưng không thể thêm, sửa hoặc xóa dữ liệu.
        </p>
      </div>
    `;

    // Chèn vào đầu dashboard
    dashboard.insertBefore(notice, dashboard.firstChild);
  }
}
// Thêm function render ngày giỗ
function renderUpcomingDeathAnniversaries(list) {
  const container = document.getElementById('deathAnniversaryList');
  if (!container) return;

  container.innerHTML = '';

  if (!list.length) {
    container.textContent = 'Không có ngày giỗ sắp tới.';
    return;
  }

  list.forEach(item => {
    const row = document.createElement('div');
    row.className = 'death-anniversary-item';
    row.style.cssText = `
      display: flex;
      flex-direction: column;
      padding: 12px;
      border-radius: 8px;
      background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
      box-shadow: 0px 3px 5px rgba(0,0,0,0.15);
      max-width: 95%;
      border-left: 4px solid #6b7280;
    `;

    const top = document.createElement('div');
    top.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    `;

    const name = document.createElement('span');
    name.style.fontWeight = '600';
    name.textContent = item.full_name;

    const days = document.createElement('span');
    days.style.cssText = 'font-size: 12px; color: #6b7280;';
    days.textContent = item.daysLeft === 0
      ? '🕯️ Hôm nay'
      : `Còn ${item.daysLeft} ngày`;

    top.appendChild(name);
    top.appendChild(days);

    const bottom = document.createElement('div');
    bottom.style.cssText = 'font-size: 12px; color: #555;';
    bottom.textContent = `Giỗ năm thứ ${item.yearCount} • ${item.death_date} → ${item.nextAnniversary}`;

    row.appendChild(top);
    row.appendChild(bottom);
    container.appendChild(row);
  });
}

/* ==========================================================
   13. LOGIC TỰ ĐỘNG GENERATION
========================================================== */

/* ==========================================================
   13. LOGIC TỰ ĐỘNG GENERATION
========================================================== */

// Setup generation field dựa vào parent_id
function setupGenerationField() {
    const parentSelect = document.getElementById('memberParent');
    const spouseSelect = document.getElementById('memberSpouse');
    const generationSelect = document.getElementById('memberGeneration');
    const generationGroup = generationSelect.closest('.form-group');

    if (!parentSelect || !generationSelect || !spouseSelect) return;

    // Clone để xóa event listener cũ
    const newParentSelect = parentSelect.cloneNode(true);
    const newSpouseSelect = spouseSelect.cloneNode(true);
    
    parentSelect.parentNode.replaceChild(newParentSelect, parentSelect);
    spouseSelect.parentNode.replaceChild(newSpouseSelect, spouseSelect);

    // Ẩn field generation ban đầu
    generationGroup.style.display = 'none';

    // Function helper tính generation
    function updateGeneration() {
        const parentId = newParentSelect.value;
        const spouseId = newSpouseSelect.value;

        // TRƯỜNG HỢP 1: Có cha/mẹ → Con ruột
        if (parentId) {
            const parent = allMembers.find(m => m.id == parentId);
            
            if (parent && parent.generation) {
                const childGeneration = parent.generation + 1;
                
                generationGroup.style.display = 'block';
                generationSelect.innerHTML = `<option value="${childGeneration}">Thế hệ ${childGeneration} (Con ruột)</option>`;
                generationSelect.value = childGeneration;
                generationSelect.disabled = true;
            }
        }
        // TRƯỜNG HỢP 2: Không có cha/mẹ, nhưng có vợ/chồng → Con dâu/rễ
        else if (spouseId) {
            const spouse = allMembers.find(m => m.id == spouseId);
            
            if (spouse && spouse.generation) {
                generationGroup.style.display = 'block';
                generationSelect.innerHTML = `<option value="${spouse.generation}">Thế hệ ${spouse.generation} (Con dâu/rễ)</option>`;
                generationSelect.value = spouse.generation;
                generationSelect.disabled = true;
            }
        }
        // TRƯỜNG HỢP 3: Không có cả cha/mẹ và vợ/chồng → Thủy tổ
        else {
            generationGroup.style.display = 'block';
            generationSelect.innerHTML = '<option value="1">Thế hệ 1 (Thủy tổ)</option>';
            generationSelect.value = '1';
            generationSelect.disabled = false;
        }
    }

    // Lắng nghe thay đổi
    newParentSelect.addEventListener('change', updateGeneration);
    newSpouseSelect.addEventListener('change', updateGeneration);

    // Trigger ban đầu
    updateGeneration();
}
/* ==========================================================
   14. SETUP VIEWER RESTRICTIONS (BỔ SUNG)
========================================================== */
/* ==========================================================
   15. LOAD GENERATION OPTIONS CHO ADVANCED SEARCH
========================================================== */

/**
 * Load danh sách thế hệ từ dữ liệu thực tế
 * Tự động cập nhật dropdown trong Advanced Search
 */
async function loadGenerationOptions() {
  const select = document.getElementById('searchGeneration');
  if (!select) return;

  try {
    // Lấy danh sách thế hệ từ stats API
    const data = await apiGet('/api/dashboard/stats');
    
    if (!data || !data.success) {
      console.error('Không load được stats để lấy thế hệ');
      return;
    }

    const stats = data.stats || {};
    const maxGeneration = stats.maxGeneration || 5; // Default 5 nếu không có data

    // Xóa tất cả option cũ (trừ "-- Tất cả --")
    const options = select.querySelectorAll('option:not([value=""])');
    options.forEach(opt => opt.remove());

    // Tạo option từ 1 đến maxGeneration
    for (let i = 1; i <= maxGeneration; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `Thế hệ ${i}`;
      select.appendChild(option);
    }

    console.log(`✅ Đã load ${maxGeneration} thế hệ vào dropdown`);
  } catch (err) {
    console.error('Lỗi loadGenerationOptions:', err);
  }
}
// Gọi function này khi mở Advanced Search Modal
function restrictViewerInAdvancedSearch() {
  const userRole = localStorage.getItem('userRole');
  
  if (userRole === 'viewer') {
    // Viewer có thể tìm kiếm bình thường
    // Không cần hạn chế gì thêm
    console.log('Viewer đang sử dụng tìm kiếm nâng cao');
  }
}
/* ==========================================================
   14. SETUP VIEWER RESTRICTIONS (BỔ SUNG)
========================================================== */
/* ==========================================================
   15. LOAD GENERATION OPTIONS CHO ADVANCED SEARCH
========================================================== */

/**
 * Load danh sách thế hệ từ dữ liệu thực tế
 * Tự động cập nhật dropdown trong Advanced Search
 */
async function loadGenerationOptions() {
  const select = document.getElementById('searchGeneration');
  if (!select) return;

  try {
    // Lấy danh sách thế hệ từ stats API
    const data = await apiGet('/api/dashboard/stats');
    
    if (!data || !data.success) {
      console.error('Không load được stats để lấy thế hệ');
      return;
    }

    const stats = data.stats || {};
    const maxGeneration = stats.maxGeneration || 5; // Default 5 nếu không có data

    // Xóa tất cả option cũ (trừ "-- Tất cả --")
    const options = select.querySelectorAll('option:not([value=""])');
    options.forEach(opt => opt.remove());

    // Tạo option từ 1 đến maxGeneration
    for (let i = 1; i <= maxGeneration; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `Thế hệ ${i}`;
      select.appendChild(option);
    }

    console.log(`✅ Đã load ${maxGeneration} thế hệ vào dropdown`);
  } catch (err) {
    console.error('Lỗi loadGenerationOptions:', err);
  }
}
// Gọi function này khi mở Advanced Search Modal
function restrictViewerInAdvancedSearch() {
  const userRole = localStorage.getItem('userRole');
  
  if (userRole === 'viewer') {
    // Viewer có thể tìm kiếm bình thường
    // Không cần hạn chế gì thêm
    console.log('Viewer đang sử dụng tìm kiếm nâng cao');
  }
}