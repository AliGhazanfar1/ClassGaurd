const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  validGatewayIp: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'The IP address range or exact IP allowed to mark attendance',
  },
  sessionStartTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  sessionEndTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

module.exports = Session;
