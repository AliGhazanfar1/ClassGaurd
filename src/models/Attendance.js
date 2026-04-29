const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deviceInfo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deviceFingerprint: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  deviceTicket: {
    type: DataTypes.STRING,
    allowNull: true,
  }
});

module.exports = Attendance;
