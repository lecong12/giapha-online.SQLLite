function handleTabSwitch(event) {
    // 1. Lấy selector của nội dung mục tiêu từ data-target của nút được click
    const clickedButton = event.currentTarget;
    const targetSelector = clickedButton.dataset.target; 

    if (!targetSelector) return;

    // 2. Xóa trạng thái active và ẩn tất cả nội dung

    // Lấy tất cả các nút tab và phần nội dung
    const tabButtons = document.querySelectorAll('.tab-btn'); 
    const tabContents = document.querySelectorAll('.tab-content'); 
    
    // Vòng lặp gọn gàng để xóa class 'active' và ẩn nội dung
    tabButtons.forEach(button => button.classList.remove('active'));
    tabContents.forEach(content => content.style.display = 'none');
    
    // 3. Cập nhật trạng thái và hiển thị nội dung mục tiêu
    
    // Thêm class 'active' cho nút vừa click
    clickedButton.classList.add('active');
    
    // Hiển thị phần nội dung mục tiêu
    const selectedContent = document.querySelector(targetSelector);
    if (selectedContent) {
        selectedContent.style.display = 'block';
    }
}


/* ==========================================================
    GÁN SỰ KIỆN SAU KHI TẢI TRANG
========================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Gán sự kiện cho tất cả các nút có class .tab-btn
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', handleTabSwitch);
    });

    // 2. Kích hoạt nội dung của tab active ban đầu (để đảm bảo màn hình ban đầu hiện ra)
    const defaultActiveButton = document.querySelector('.tab-btn.active');
    if (defaultActiveButton) {
        const defaultTargetSelector = defaultActiveButton.dataset.target;
        const defaultTarget = document.querySelector(defaultTargetSelector);
        if (defaultTarget) {
            defaultTarget.style.display = 'block';
        }
    }
});