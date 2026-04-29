const sequelize = require('../config/database');
const User = require('./User');
const Session = require('./Session');
const Attendance = require('./Attendance');
const Log = require('./Log');

// Define Relations

// Admin (User) -> Sessions
User.hasMany(Session, { foreignKey: 'adminId', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });

// Session -> Attendance
Session.hasMany(Attendance, { foreignKey: 'sessionId', as: 'attendances' });
Attendance.belongsTo(Session, { foreignKey: 'sessionId', as: 'session' });

// Student (User) -> Attendance
User.hasMany(Attendance, { foreignKey: 'studentId', as: 'attendances' });
Attendance.belongsTo(User, { foreignKey: 'studentId', as: 'student' });

module.exports = {
  sequelize,
  User,
  Session,
  Attendance,
  Log
};
