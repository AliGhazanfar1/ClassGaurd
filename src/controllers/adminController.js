const { Session, Attendance, User, Log } = require('../models');
const exceljs = require('exceljs');

exports.startSession = async (req, res) => {
  try {
    let rawIp = req.headers['x-forwarded-for'];
    let gatewayIp = rawIp ? rawIp.split(',')[0].trim() : req.socket.remoteAddress;
    
    if (gatewayIp === '::1' || gatewayIp === '::ffff:127.0.0.1') {
      gatewayIp = '127.0.0.1';
    }

    const session = await Session.create({
      adminId: req.user.id,
      validGatewayIp: gatewayIp,
      isActive: true,
      sessionStartTime: new Date()
    });

    await Log.create({
      action: 'STARTED_SESSION',
      details: `Session ${session.id} started. Gateway IP: ${gatewayIp}`,
      userId: req.user.id,
      ipAddress: gatewayIp
    });

    res.status(201).json({ status: 'success', data: { session } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.stopSession = async (req, res) => {
  try {
    const { id } = req.params;
    const session = await Session.findByPk(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.adminId !== req.user.id) {
       return res.status(403).json({ error: 'Not authorized to stop this session' });
    }

    session.isActive = false;
    session.sessionEndTime = new Date();
    await session.save();

    await Log.create({
      action: 'STOPPED_SESSION',
      details: `Session ${session.id} stopped.`,
      userId: req.user.id
    });

    res.status(200).json({ status: 'success', data: { session } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAttendanceList = async (req, res) => {
  try {
    const { id } = req.params; // Session ID
    const attendances = await Attendance.findAll({
      where: { sessionId: id },
      include: [{
        model: User,
        as: 'student',
        attributes: ['name', 'studentId', 'email']
      }],
      order: [['timestamp', 'DESC']]
    });

    res.status(200).json({ status: 'success', data: { attendances } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportToExcel = async (req, res) => {
  try {
    const { id } = req.params;
    
    const students = await User.findAll({
      where: { role: 'student' },
      attributes: ['id', 'name', 'studentId', 'email'],
      order: [['name', 'ASC']]
    });

    const attendances = await Attendance.findAll({
      where: { sessionId: id }
    });

    const attendanceMap = {};
    attendances.forEach(att => {
      attendanceMap[att.studentId] = att;
    });

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    worksheet.columns = [
      { header: 'Student Name', key: 'name', width: 30 },
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Time Marked', key: 'timestamp', width: 25 },
      { header: 'IP Address', key: 'ip', width: 20 },
    ];

    students.forEach(student => {
      const att = attendanceMap[student.id];
      worksheet.addRow({
        name: student.name,
        studentId: student.studentId || 'N/A',
        email: student.email,
        status: att ? 'Present' : 'Absent',
        timestamp: att ? new Date(att.timestamp).toLocaleString() : '-',
        ip: att ? att.ipAddress : '-'
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const statusCell = row.getCell('status');
        if (statusCell.value === 'Present') {
          statusCell.font = { color: { argb: 'FF008000' } };
        } else {
          statusCell.font = { color: { argb: 'FFFF0000' } };
        }
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_session_${id}.xlsx`);

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const logs = await Log.findAll({ order: [['timestamp', 'DESC']], limit: 100 });
    res.status(200).json({ status: 'success', data: { logs } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getActiveSession = async (req, res) => {
    try {
        const session = await Session.findOne({
            where: { adminId: req.user.id, isActive: true },
            order: [['sessionStartTime', 'DESC']]
        });
        
        res.status(200).json({ status: 'success', data: { session } });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getAllStudents = async (req, res) => {
  try {
    const students = await User.findAll({
      where: { role: 'student' },
      attributes: ['id', 'name', 'studentId', 'email'],
      order: [['name', 'ASC']]
    });
    res.status(200).json({ status: 'success', data: { students } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportAllSessions = async (req, res) => {
  try {
    const students = await User.findAll({
      where: { role: 'student' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    const sessions = await Session.findAll({
      order: [['sessionStartTime', 'ASC']]
    });

    const attendances = await Attendance.findAll();

    const attendanceMap = {};
    attendances.forEach(att => {
      if (!attendanceMap[att.studentId]) {
        attendanceMap[att.studentId] = {};
      }
      attendanceMap[att.studentId][att.sessionId] = true;
    });

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Master Attendance');

    const columns = [
      { header: 'Student Name', key: 'name', width: 30 }
    ];

    sessions.forEach(session => {
      const dateStr = new Date(session.sessionStartTime).toLocaleDateString();
      columns.push({
        header: dateStr,
        key: `session_${session.id}`,
        width: 15
      });
    });

    worksheet.columns = columns;

    students.forEach(student => {
      const rowData = { name: student.name };
      const studentAtt = attendanceMap[student.id] || {};
      
      sessions.forEach(session => {
        rowData[`session_${session.id}`] = studentAtt[session.id] ? 'Present' : 'Absent';
      });

      worksheet.addRow(rowData);
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell, colNumber) => {
          if (colNumber > 1) {
            if (cell.value === 'Present') {
              cell.font = { color: { argb: 'FF008000' } };
            } else if (cell.value === 'Absent') {
              cell.font = { color: { argb: 'FFFF0000' } };
            }
          }
        });
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=master_attendance_report.xlsx`);

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
