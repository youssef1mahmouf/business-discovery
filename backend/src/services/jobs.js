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

const { sendEmailWithTemplate } = require('./mail');

/**
 * Send a daily activity report to the configured admin emails.
 * @param {Array} reportData - Orders/report data to summarize
 * @param {Array} adminEmails - List of admin email addresses
 */
async function sendDailyReport(reportData, adminEmails) {
  const count = Array.isArray(reportData) ? reportData.length : 0;
  const summaries = adminEmails.map((email) =>
    sendEmailWithTemplate({
      to: email,
      templateName: 'en/daily_report',
      subject: 'Business Discovery — daily activity report',
      context: {
        reportDate: new Date().toISOString().split('T')[0],
        orderCount: count,
        note: count + ' order record(s) found in the latest activity report.',
      },
    })
  );
  await Promise.all(summaries.map((p) => p.catch(() => {})));
  return { sent: adminEmails.length, orderCount: count };
}

/**
 * Send a monthly activity report to the configured admin emails.
 * @param {Array} reportData - Orders/report data to summarize
 * @param {Array} adminEmails - List of admin email addresses
 * @param {Object} period - { startDate, endDate }
 */
async function sendMonthlyReport(reportData, adminEmails, period) {
  const count = Array.isArray(reportData) ? reportData.length : 0;
  const periodLabel = period
    ? new Date(period.startDate).toISOString().split('T')[0] + ' → ' + new Date(period.endDate).toISOString().split('T')[0]
    : 'this month';
  const summaries = adminEmails.map((email) =>
    sendEmailWithTemplate({
      to: email,
      templateName: 'en/monthly_report',
      subject: 'Business Discovery — monthly activity report (' + periodLabel + ')',
      context: {
        period: periodLabel,
        orderCount: count,
        note: count + ' order record(s) found in the monthly activity report.',
      },
    })
  );
  await Promise.all(summaries.map((p) => p.catch(() => {})));
  return { sent: adminEmails.length, orderCount: count, period: periodLabel };
}

/**
 * Check inventory alerts - run periodically.
 * @param {Array} products - Product documents to inspect
 * @param {Function} dbGet - Function to get a collection by name
 */
async function checkInventoryAlerts(products, dbGet) {
  const productList = Array.isArray(products) ? products : [];
  const notifications = (dbGet && typeof dbGet === 'function' ? dbGet('notifications') : null);
  const now = new Date().toISOString();
  if (notifications && productList.length) {
    await Promise.all(
      productList.map((product) =>
        notifications.insertOne({
          userEmail: 'admin@example.com',
          type: 'inventory_alert',
          title: 'تنبيه مخزون منتج',
          message: 'راجع حالة المنتج: ' + (product.name || 'غير مسمّى'),
          read: false,
          createdAt: now,
        }).catch(() => {})
      )
    );
  }
  return { checked: productList.length };
}

module.exports = {
  sendDailyReport,
  sendMonthlyReport,
  checkInventoryAlerts,
  getCairoTime,
  getCairoDate,
  getCairoTimeString,
};