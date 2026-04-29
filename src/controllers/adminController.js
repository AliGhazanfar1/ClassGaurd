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
    const attendances = await Attendance.findAll({
      where: { sessionId: id },
      include: [{
        model: User,
        as: 'student'
      }],
      order: [['timestamp', 'ASC']]
    });

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    worksheet.columns = [
      { header: 'Student Name', key: 'name', width: 30 },
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Time Marked', key: 'timestamp', width: 25 },
      { header: 'IP Address', key: 'ip', width: 20 },
    ];

    attendances.forEach(att => {
      worksheet.addRow({
        name: att.student.name,
        studentId: att.student.studentId,
        email: att.student.email,
        timestamp: new Date(att.timestamp).toLocaleString(),
        ip: att.ipAddress
      });
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
}
