const { Sequelize } = require('sequelize');
const path = require('path');

// Environment Switch: Cloud (Postgres) vs Local (SQLite)
let sequelize;

if (process.env.DATABASE_URL) {
  // Production (Cloud Host automatically injects DATABASE_URL)
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Required for many managed DBs like Neon/Render
      }
    },
    logging: false
  });
} else {
  // Local Development
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false
  });
}

module.exports = sequelize;
