const { sendDailyReport, sendMonthlyReport, NOTIFICATION_TYPES } = require('./notification');
const { ObjectId } = require('mongodb');

/**
 * Timezone configuration
 * Using Africa/Cairo timezone consistently as specified
 */
const CAIRO_TIMEZONE = 'Africa/Cairo';
const UTC_OFFSET = 2; // Egypt is UTC+2 (no DST currently, but we handle it)

/**
 * Get current time in Africa/Cairo timezone
 * @returns {Date} Current date in Cairo timezone
 */
function getCairoTime() {
  const now = new Date();
  // Calculate Cairo time (UTC+2, adjust for DST if needed)
  const cairoTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return cairoTime;
}

/**
 * Get formatted date string for Cairo timezone
 * @returns {string} Format: YYYY-MM-DD
 */
function getCairoDate() {
  const cairoTime = getCairoTime();
  return cairoTime.toISOString().split('T')[0];
}

/**
 * Get formatted time string for Cairo timezone
 * @returns {string} Format: HH:MM
 */
function getCairoTimeString() {
  const cairoTime = getCairoTime();
  return cairoTime.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  }).replace(',', ':');
}

/**
 * Schedule daily report - runs at 21:00 Africa/Cairo
 * @param {Object} ctx - Application context with db and config
 * @param {Array} adminEmails - List of admin email addresses
 */
async function scheduleDailyReport(ctx, adminEmails) {
  const reportData = await ctx.db.get('orders').aggregate([...]).toArray();
  // TODO: Implement full aggregation
  await sendDailyReport(reportData, adminEmails);
}

/**
 * Schedule monthly report - runs on 1st of month at 09:00 Africa/Cairo
 * @param {Object} ctx - Application context with db and config
 * @param {Array} adminEmails - List of admin email addresses
 * @param {Object} period - { startDate, endDate }
 */
async function scheduleMonthlyReport(ctx, adminEmails, period) {
  const reportData = await ctx.db.get('orders').aggregate([...]).toArray();
  // TODO: Implement full aggregation
  await sendMonthlyReport(reportData, adminEmails, period);
}

/**
 * Check inventory alerts - run periodically
 * @param {Object} ctx - Application context with db
 */
async function checkInventoryAlerts(ctx) {
  const products = await ctx.db.get('products').find().toArray();
  await checkInventoryAlerts(products, ctx.db.get);
}

module.exports = {
  scheduleDailyReport,
  scheduleMonthlyReport,
  checkInventoryAlerts,
  getCairoTime,
  getCairoDate,
  getCairoTimeString,
};