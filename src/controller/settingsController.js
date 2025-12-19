// src/controller/settingsController.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { logActivity } = require('../utils/activityLogger');
function getDb(req) {
  return req.app.get('db');
}

// ============================================================
// CẤU HÌNH MULTER CHO UPLOAD FILE
// ============================================================
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Chỉ chấp nhận file CSV
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file CSV'));
    }
  }
});

/* ============================================================
   1. XUẤT PDF GIA PHẢ
============================================================ */
function exportPDF(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  // Lấy tất cả thành viên
  const sql = `
    SELECT id, full_name, gender, birth_date, death_date, is_alive,
           generation, notes, phone, job, address
    FROM people
    WHERE owner_id = ?
    ORDER BY generation ASC, full_name ASC
  `;

  db.all(sql, [ownerId], (err, members) => {
    if (err) {
      console.error('Lỗi exportPDF:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }

    try {
      // Tạo PDF document
      const doc = new PDFDocument({ margin: 50 });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=gia-pha.pdf');

      // Pipe PDF vào response
      doc.pipe(res);

      // Tiêu đề
      doc.fontSize(24)
         .text('GIA PHA DONG HO', { align: 'center' })
         .moveDown();

      doc.fontSize(12)
         .text(`Ngay xuat: ${new Date().toLocaleDateString('vi-VN')}`, { align: 'center' })
         .moveDown(2);

      // Thống kê tổng quan
      const total = members.length;
      const males = members.filter(m => m.gender === 'Nam').length;
      const females = members.filter(m => m.gender === 'Nữ').length;
      const living = members.filter(m => m.is_alive === 1).length;

      doc.fontSize(14)
         .text('THONG KE TONG QUAN', { underline: true })
         .moveDown(0.5);

      doc.fontSize(11)
         .text(`Tong so thanh vien: ${total}`)
         .text(`Nam: ${males} nguoi`)
         .text(`Nu: ${females} nguoi`)
         .text(`Dang song: ${living} nguoi`)
         .moveDown(2);

      // Danh sách thành viên theo thế hệ
      doc.fontSize(14)
         .text('DANH SACH THANH VIEN', { underline: true })
         .moveDown(0.5);

      // Nhóm theo thế hệ
      const generations = {};
      members.forEach(m => {
        const gen = m.generation || 0;
        if (!generations[gen]) {
          generations[gen] = [];
        }
        generations[gen].push(m);
      });

      // In từng thế hệ
      Object.keys(generations).sort((a, b) => a - b).forEach(gen => {
        doc.fontSize(12)
           .text(`\nDoi ${gen}:`, { bold: true })
           .moveDown(0.3);

        generations[gen].forEach(member => {
          const statusIcon = member.is_alive ? 'Song' : 'Mat';
          const genderIcon = member.gender === 'Nam' ? 'Nam' : 'Nu';
          
          doc.fontSize(10)
             .text(`[${statusIcon}] ${member.full_name} (${genderIcon})`, { continued: true })
             .fontSize(9)
             .fillColor('#666666')
             .text(` - ${member.birth_date || 'N/A'} den ${member.death_date || 'N/A'}`)
             .fillColor('#000000');

          if (member.phone) {
            doc.fontSize(9)
               .fillColor('#666666')
               .text(`   SDT: ${member.phone}`)
               .fillColor('#000000');
          }

          if (member.job) {
            doc.fontSize(9)
               .fillColor('#666666')
               .text(`   Nghe: ${member.job}`)
               .fillColor('#000000');
          }

          doc.moveDown(0.5);

          // Xuống trang mới nếu gần hết trang
          if (doc.y > 700) {
            doc.addPage();
          }
        });
      });

      // Footer
      doc.fontSize(8)
         .fillColor('#999999')
         .text(`Xuat tu he thong Gia Pha Online - ${new Date().toISOString()}`, 
               50, doc.page.height - 50, { align: 'center' });

      // Kết thúc PDF
      doc.end();
// ===== THÊM LOG HOẠT ĐỘNG =====
logActivity(db, {
  owner_id: ownerId,
  actor_id: ownerId,
  actor_role: 'owner',
  actor_name: 'Admin',
  action_type: 'create',
  entity_type: 'setting',
  entity_name: 'Export PDF',
  description: `Đã xuất gia phả ra file PDF (${total} thành viên)`
});
    } catch (error) {
      console.error('Lỗi tạo PDF:', error);
      return res.status(500).json({ success: false, message: 'Lỗi tạo PDF' });
    }
  });
}
function insertMemberFromCSV(db, ownerId, rowData, validationResult, callback) {
  const {
    full_name, gender, birth_date, death_date,
    notes, phone, job, address
  } = rowData;

  const {
    generation, parent_id, spouse_id, member_type
  } = validationResult;

  const is_alive = death_date ? 0 : 1;

  const sql = `
    INSERT INTO people (
      owner_id, full_name, gender, birth_date, death_date, is_alive,
      generation, notes, phone, job, address, member_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    ownerId,
    full_name.trim(),
    gender || null,
     birth_date === 'unknown' ? null : (birth_date || null), // ✅
    death_date === 'unknown' ? null : (death_date || null), // ✅
    is_alive,
    generation,
    notes || null,
    phone || null,
    job || null,
    address || null,
    member_type || 'blood'
  ], function(err) {
    if (err) {
      return callback(new Error(`Lỗi insert: ${err.message}`));
    }

    const newId = this.lastID;

    // ✅ Tạo relationship nếu có parent
    if (parent_id) {
      const sqlRel = `INSERT INTO relationships (parent_id, child_id, relation_type) VALUES (?, ?, 'ruot')`;
      db.run(sqlRel, [parent_id, newId], (errRel) => {
        if (errRel) console.error('⚠️ Lỗi tạo relationship:', errRel.message);
      });
    }

    // ✅ Tạo marriage nếu có spouse
    if (spouse_id) {
      db.get(`SELECT gender FROM people WHERE id = ?`, [newId], (errG, person) => {
        if (!errG && person) {
          let husbandId, wifeId;

          if (person.gender === 'Nam') {
            husbandId = newId;
            wifeId = spouse_id;
          } else {
            husbandId = spouse_id;
            wifeId = newId;
          }

          // ✅ Kiểm tra đã có marriage chưa
          db.get(
            `SELECT id FROM marriages WHERE (husband_id = ? AND wife_id = ?) OR (husband_id = ? AND wife_id = ?)`,
            [husbandId, wifeId, wifeId, husbandId],
            (errCheck, existing) => {
              if (!existing) {
                const sqlMarriage = `INSERT INTO marriages (husband_id, wife_id) VALUES (?, ?)`;
                db.run(sqlMarriage, [husbandId, wifeId], (errMar) => {
                  if (errMar) console.error('⚠️ Lỗi tạo marriage:', errMar.message);
                });
              }
            }
          );
        }
      });
    }

    return callback(null, newId);
  });
}
/* ============================================================
   2. NHẬP DỮ LIỆU TỪ CSV
============================================================ */
/* ============================================================
   2. NHẬP DỮ LIỆU TỪ CSV - HOÀN CHỈNH
============================================================ */
/* ============================================================
   IMPORT CSV - LOGIC MỚI HOÀN TOÀN
   - Xử lý tuần tự từng dòng (không parallel)
   - Validate đầy đủ như createMember
   - Tự động tính generation
============================================================ */
function importCSV(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Chưa chọn file' });
  }

  try {
    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true
    });

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'File CSV rỗng' });
    }

    // ✅ VALIDATE CÁC CỘT BẮT BUỘC
    const requiredColumns = ['full_name', 'gender', 'birth_date'];
    const csvColumns = Object.keys(records[0]);
    const missingColumns = requiredColumns.filter(col => !csvColumns.includes(col));

    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `❌ Thiếu các cột bắt buộc: ${missingColumns.join(', ')}\n\n📋 Cần có: full_name, gender, birth_date` 
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // ✅ XỬ LÝ TUẦN TỰ TỪNG DÒNG
    let currentIndex = 0;

    function processNextRow() {
      if (currentIndex >= records.length) {
        // ✅ ĐÃ XONG TẤT CẢ
        console.log(`\n✅ HOÀN TẤT IMPORT: ${successCount} thành công, ${errorCount} lỗi`);

        // LOG ACTIVITY
        logActivity(db, {
          owner_id: ownerId,
          actor_id: ownerId,
          actor_role: 'owner',
          actor_name: 'Admin',
          action_type: 'create',
          entity_type: 'setting',
          entity_name: 'Import CSV',
          description: `Đã import ${successCount} thành viên từ CSV`
        });

        return res.json({
          success: true,
          message: `✅ Import hoàn tất!`,
          successCount,
          errorCount,
          errors: errors.slice(0, 20)
        });
      }

      const row = records[currentIndex];
      const rowNumber = currentIndex + 2; // +2 vì header là dòng 1

      // VALIDATE CƠ BẢN
      const {
        full_name, gender, birth_date
      } = row;

      // 1. Validate tên
      if (!full_name || !full_name.trim()) {
        errors.push(`Dòng ${rowNumber}: ❌ Thiếu họ tên`);
        errorCount++;
        currentIndex++;
        return processNextRow();
      }

      // 2. Validate giới tính
      if (!gender || !['Nam', 'Nữ', 'nam', 'nữ'].includes(gender)) {
        errors.push(`Dòng ${rowNumber}: ❌ Giới tính phải là 'Nam' hoặc 'Nữ'`);
        errorCount++;
        currentIndex++;
        return processNextRow();
      }

      const normalizedGender = gender === 'Nam' || gender === 'nam' ? 'Nam' : 'Nữ';
      row.gender = normalizedGender;

      // 3. Validate ngày sinh
   // 3. Validate ngày sinh - CHO PHÉP "unknown"
if (!birth_date || birth_date.trim() === '') {
    row.birth_date = null; // Lưu null vào DB
} else if (birth_date.toLowerCase() === 'unknown' || birth_date.toLowerCase() === 'không rõ') {
    row.birth_date = null; // Chuyển "unknown" thành null
} else {
    // Validate format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birth_date)) {
        errors.push(`Dòng ${rowNumber}: ❌ Ngày sinh sai format (cần YYYY-MM-DD hoặc "unknown")`);
        errorCount++;
        currentIndex++;
        return processNextRow();
    }
}
// ✅ Xử lý ngày mất
const death_date = row.death_date ? row.death_date.trim() : '';

if (death_date.toLowerCase() === 'unknown' || death_date.toLowerCase() === 'không rõ') {
    row.death_date = 'unknown';
    row.is_alive = 0;
} else if (death_date && death_date !== '') {
    // Validate format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(death_date)) {
        return callback(new Error(`❌ Ngày mất sai format (cần YYYY-MM-DD hoặc "unknown")`));
    }
    row.is_alive = 0;
} else {
    // Để trống = còn sống
    row.death_date = null;
    row.is_alive = 1;
}
      // ✅ VALIDATE & TÍNH GENERATION
      validateAndCalculateGeneration(db, ownerId, row, (errValidate, validationResult) => {
        if (errValidate) {
          errors.push(`Dòng ${rowNumber}: ${errValidate.message}`);
          errorCount++;
          currentIndex++;
          return processNextRow();
        }

        // ✅ INSERT MEMBER
        insertMemberFromCSV(db, ownerId, row, validationResult, (errInsert, newId) => {
          if (errInsert) {
            errors.push(`Dòng ${rowNumber}: ❌ ${errInsert.message}`);
            errorCount++;
          } else {
            successCount++;
            console.log(`✅ [${currentIndex + 1}/${records.length}] ${row.full_name.trim()} (ID: ${newId})`);
          }

          currentIndex++;
          processNextRow();
        });
      });
    }

    // BẮT ĐẦU XỬ LÝ
    processNextRow();

  } catch (error) {
    console.error('❌ Lỗi importCSV:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Lỗi xử lý file CSV: ' + error.message 
    });
  }
}
/* ============================================================
   3. RESET DỮ LIỆU VỀ MẪU BAN ĐẦU
============================================================ */
function resetData(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;

  // Xóa toàn bộ dữ liệu của owner này
  db.run(`DELETE FROM relationships WHERE child_id IN (SELECT id FROM people WHERE owner_id = ?)`, [ownerId]);
  db.run(`DELETE FROM marriages WHERE husband_id IN (SELECT id FROM people WHERE owner_id = ?) OR wife_id IN (SELECT id FROM people WHERE owner_id = ?)`, [ownerId, ownerId]);
  db.run(`DELETE FROM people WHERE owner_id = ?`, [ownerId], function(err) {
    if (err) {
      console.error('Lỗi xóa dữ liệu:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi xóa dữ liệu' });
    }

    // Load lại dữ liệu mẫu
    loadSampleData(db, ownerId, (errLoad) => {
      if (errLoad) {
        return res.status(500).json({ success: false, message: 'Lỗi load dữ liệu mẫu' });
      }
       // ===== THÊM LOG HOẠT ĐỘNG =====
    logActivity(db, {
      owner_id: ownerId,
      actor_id: ownerId,
      actor_role: 'owner',
      actor_name: 'Admin',
      action_type: 'delete',
      entity_type: 'setting',
      entity_name: 'Reset Data',
      description: `Đã reset toàn bộ dữ liệu và load lại dữ liệu mẫu`
    });

      return res.json({ success: true, message: 'Đã reset dữ liệu về mẫu ban đầu' });
    });
  });
}

/* ============================================================
   4. HÀM LOAD DỮ LIỆU MẪU
============================================================ */
function loadSampleData(db, ownerId, callback) {
  // Thế hệ 1 (thủy tổ)
  const gen1 = [
    { full_name: 'Nguyễn Văn A', gender: 'Nam', birth_date: '1880-01-15', death_date: '1945-08-20', generation: 1, notes: 'Thủy tổ' },
    { full_name: 'Trần Thị B', gender: 'Nữ', birth_date: '1885-03-10', death_date: '1952-06-12', generation: 1, notes: 'Vợ cụ A' }
  ];

  // Thế hệ 2
  const gen2 = [
    { full_name: 'Nguyễn Văn C', gender: 'Nam', birth_date: '1905-04-20', death_date: '1975-12-30', generation: 2 },
    { full_name: 'Lê Thị D', gender: 'Nữ', birth_date: '1910-07-05', death_date: '1980-02-14', generation: 2 },
    { full_name: 'Nguyễn Thị E', gender: 'Nữ', birth_date: '1908-11-18', death_date: '1990-09-22', generation: 2 }
  ];

  // Thế hệ 3
  const gen3 = [
    { full_name: 'Nguyễn Văn F', gender: 'Nam', birth_date: '1930-01-25', death_date: null, generation: 3 },
    { full_name: 'Phạm Thị G', gender: 'Nữ', birth_date: '1935-06-08', death_date: null, generation: 3 },
    { full_name: 'Nguyễn Văn H', gender: 'Nam', birth_date: '1940-05-17', death_date: null, generation: 3 }
  ];

  const allPeople = [...gen1, ...gen2, ...gen3];
  let insertCount = 0;

  allPeople.forEach(person => {
    const is_alive = person.death_date ? 0 : 1;
    
    const sql = `
      INSERT INTO people (
        owner_id, full_name, gender, birth_date, death_date, is_alive, generation, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      ownerId,
      person.full_name,
      person.gender,
      person.birth_date,
      person.death_date,
      is_alive,
      person.generation,
      person.notes || null
    ], function(err) {
      if (err) {
        console.error('Lỗi insert sample:', err.message);
      }
      
      insertCount++;
      
      if (insertCount === allPeople.length) {
        callback(null);
      }
    });
  });
}
/* ============================================================
   HELPER: VALIDATE VÀ TÍNH GENERATION
   - Sử dụng logic giống y createMember
============================================================ */
function validateAndCalculateGeneration(db, ownerId, rowData, callback) {
  const { parent_name, spouse_name, generation: requestedGeneration } = rowData;

  // ✅ CASE 1: Thủy tổ (generation = 1)
  if (requestedGeneration && parseInt(requestedGeneration) === 1) {
    if (parent_name && parent_name.trim()) {
      return callback(new Error('⛔ Thủy tổ (đời 1) KHÔNG được có parent_name'));
    }
    
    // Thủy tổ có thể có hoặc không có vợ/chồng
    let spouse_id = null;
    
    if (spouse_name && spouse_name.trim()) {
      db.get(
        `SELECT id, generation FROM people WHERE full_name = ? AND owner_id = ? LIMIT 1`,
        [spouse_name.trim(), ownerId],
        (errSpouse, spouse) => {
          if (spouse) {
            if (spouse.generation !== 1) {
              return callback(new Error(`⛔ Vợ/chồng của thủy tổ phải là đời 1 (hiện tại: đời ${spouse.generation})`));
            }
            spouse_id = spouse.id;
          }
          
          return callback(null, {
            generation: 1,
            parent_id: null,
            spouse_id: spouse_id,
            member_type: 'blood'
          });
        }
      );
    } else {
      return callback(null, {
        generation: 1,
        parent_id: null,
        spouse_id: null,
        member_type: 'blood'
      });
    }
    return;
  }

  // ✅ CASE 2: Đời > 1
  // Phải có ÍT NHẤT 1 trong 2: parent_name HOẶC spouse_name
  if (!parent_name && !spouse_name) {
    return callback(new Error('⛔ Đời > 1 phải có parent_name (con ruột) HOẶC spouse_name (con dâu/rể)'));
  }

  // ✅ SUB-CASE 2A: CÓ parent_name → Con ruột
  if (parent_name && parent_name.trim()) {
    const sql = `SELECT id, generation FROM people WHERE full_name = ? AND owner_id = ? LIMIT 1`;
    
    db.get(sql, [parent_name.trim(), ownerId], (err, parent) => {
      if (err || !parent) {
        return callback(new Error(`⛔ Không tìm thấy cha/mẹ: "${parent_name}"`));
      }

      const calculatedGeneration = parent.generation + 1;

      // Kiểm tra generation nhập vào có khớp không
      if (requestedGeneration && parseInt(requestedGeneration) !== calculatedGeneration) {
        return callback(new Error(`⛔ Generation phải là ${calculatedGeneration} (cha/mẹ là đời ${parent.generation}), nhưng CSV ghi ${requestedGeneration}`));
      }

      // Tìm spouse_id nếu có
      let spouse_id = null;
      if (spouse_name && spouse_name.trim()) {
        db.get(
          `SELECT id, generation FROM people WHERE full_name = ? AND owner_id = ? LIMIT 1`,
          [spouse_name.trim(), ownerId],
          (errSpouse, spouse) => {
            if (spouse) {
              // Kiểm tra vợ/chồng cùng đời
              if (spouse.generation !== calculatedGeneration) {
                return callback(new Error(`⛔ Vợ/chồng phải cùng đời ${calculatedGeneration} (hiện tại: đời ${spouse.generation})`));
              }
              spouse_id = spouse.id;
            }

            return callback(null, {
              generation: calculatedGeneration,
              parent_id: parent.id,
              spouse_id: spouse_id,
              member_type: 'blood'
            });
          }
        );
      } else {
        return callback(null, {
          generation: calculatedGeneration,
          parent_id: parent.id,
          spouse_id: null,
          member_type: 'blood'
        });
      }
    });
  }
  // ✅ SUB-CASE 2B: KHÔNG CÓ parent_name, CHỈ CÓ spouse_name → Con dâu/rể
  else if (spouse_name && spouse_name.trim()) {
    const sql = `SELECT id, generation FROM people WHERE full_name = ? AND owner_id = ? LIMIT 1`;
    
    db.get(sql, [spouse_name.trim(), ownerId], (err, spouse) => {
      if (err || !spouse) {
        return callback(new Error(`⛔ Không tìm thấy vợ/chồng: "${spouse_name}"`));
      }

      const spouseGeneration = spouse.generation;

      // Kiểm tra generation nhập vào có khớp không
      if (requestedGeneration && parseInt(requestedGeneration) !== spouseGeneration) {
        return callback(new Error(`⛔ Generation phải bằng ${spouseGeneration} (vợ/chồng là đời ${spouseGeneration}), nhưng CSV ghi ${requestedGeneration}`));
      }

      return callback(null, {
        generation: spouseGeneration,
        parent_id: null,
        spouse_id: spouse.id,
        member_type: 'in_law'
      });
    });
  }
}

/* ============================================================
   HELPER: INSERT MEMBER VỚI VALIDATION ĐẦY ĐỦ
============================================================ */

/* ============================================================
   4. XÓA TOÀN BỘ THÀNH VIÊN - CHỈ OWNER
============================================================ */
function deleteAllMembers(req, res) {
  const db = getDb(req);
  const ownerId = req.user.id;
  const userRole = req.user.role;

  // ✅ CHỈ OWNER MỚI ĐƯỢC XÓA
  if (userRole !== 'owner') {
    return res.status(403).json({ 
      success: false, 
      message: '⛔ Chỉ Admin mới có quyền xóa toàn bộ thành viên' 
    });
  }

  // ✅ XÓA THEO THỨ TỰ: relationships → marriages → people
  
  // 1. Xóa relationships
  db.run(`DELETE FROM relationships WHERE child_id IN (SELECT id FROM people WHERE owner_id = ?)`, [ownerId], (errRel) => {
    if (errRel) {
      console.error('Lỗi xóa relationships:', errRel.message);
      return res.status(500).json({ success: false, message: 'Lỗi xóa quan hệ' });
    }

    // 2. Xóa marriages
    db.run(`DELETE FROM marriages WHERE husband_id IN (SELECT id FROM people WHERE owner_id = ?) OR wife_id IN (SELECT id FROM people WHERE owner_id = ?)`, 
      [ownerId, ownerId], (errMar) => {
        if (errMar) {
          console.error('Lỗi xóa marriages:', errMar.message);
          return res.status(500).json({ success: false, message: 'Lỗi xóa hôn nhân' });
        }

        // 3. Đếm số thành viên trước khi xóa
        db.get(`SELECT COUNT(*) as count FROM people WHERE owner_id = ?`, [ownerId], (errCount, row) => {
          const deletedCount = row ? row.count : 0;

          // 4. Xóa people
          db.run(`DELETE FROM people WHERE owner_id = ?`, [ownerId], function(errPeople) {
            if (errPeople) {
              console.error('Lỗi xóa people:', errPeople.message);
              return res.status(500).json({ success: false, message: 'Lỗi xóa thành viên' });
            }

            // ✅ LOG HOẠT ĐỘNG
            logActivity(db, {
              owner_id: ownerId,
              actor_id: ownerId,
              actor_role: 'owner',
              actor_name: 'Admin',
              action_type: 'delete',
              entity_type: 'setting',
              entity_name: 'Delete All Members',
              description: `Đã xóa toàn bộ ${deletedCount} thành viên khỏi gia phả`
            });

            return res.json({ 
              success: true, 
              message: `✅ Đã xóa toàn bộ ${deletedCount} thành viên`,
              deletedCount: deletedCount
            });
          });
        });
      }
    );
  });
}
/* ============================================================
   EXPORT TẤT CẢ - CHỈ 1 LẦN DUY NHẤT Ở CUỐI FILE
============================================================ */
module.exports = {
  exportPDF,
  importCSV,
  uploadMiddleware: upload.single('file'),
  resetData,
  deleteAllMembers  // ← THÊM DÒNG NÀY
};