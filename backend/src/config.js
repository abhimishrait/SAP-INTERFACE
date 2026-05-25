const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env var: ${k}`);
  return v;
};

module.exports = {
  port: Number(process.env.PORT || 4000),
  db: {
    host: must('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    user: must('DB_USER'),
    password: must('DB_PASSWORD'),
    database: must('DB_NAME'),
  },
  sapAuth: {
    user: must('SAP_AUTH_USER'),
    pass: must('SAP_AUTH_PASS'),
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  systemUserId: Number(process.env.SAP_SYSTEM_USER_ID || 1),
  defaults: {
    productionLineCode: process.env.DEFAULT_PRODUCTION_LINE_CODE || 'DEFAULT_LINE',
  },
};
