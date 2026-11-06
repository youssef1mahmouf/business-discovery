const { sendEmailWithTemplate } = require('../mail');

module.exports = {
  NOTIFICATION_TYPES: {
    REGISTRATION_VERIFICATION: 'registration_verification',
    PASSWORD_RESET: 'password_reset',
    PASSWORD_CHANGE: 'password_change',
    PURCHASE_CONFIRMATION: 'purchase_confirmation',
    ORDER_STATUS: 'order_status',
    PAYMENT_CONFIRMATION: 'payment_confirmation',
  },
  sendRegistrationVerification,
  sendPasswordReset,
  sendPasswordChange,
  sendPurchaseConfirmation,
  sendOrderStatus,
  sendDailyReport,
  sendMonthlyReport,
  sendInventoryAlert,
  checkInventoryAlerts,
};
const { sendEmailWithTemplate, renderTemplate, stripHtml } = require('../mail');
const { ObjectId } = require('mongodb');

/**
 * Customer notification types
 */
const NOTIFICATION_TYPES = {
  REGISTRATION_VERIFICATION: 'registration_verification',
  PASSWORD_RESET: 'password_reset',
  PASSWORD_CHANGE: 'password_change',
  PURCHASE_CONFIRMATION: 'purchase_confirmation',
  ORDER_STATUS: 'order_status',
  PAYMENT_CONFIRMATION: 'payment_confirmation',
};

/**
 * Send registration verification email
 */
async function sendRegistrationVerification(user) {
  const verificationUrl = `${process.env.FRONTEND_ORIGIN}/verify-email?token=${user.verificationToken}`;
  
  await sendEmailWithTemplate({
    to: user.email,
    subject: 'Verify Your Email - Business Discovery',
    templateName: 'verify_email',
    context: {
      rtl: user.locale && user.locale.startsWith('ar'),
      verificationUrl,
      year: new Date().getFullYear(),
      userName: user.name || '',
    },
  });
}

/**
 * Send password reset email
 */
async function sendPasswordReset(user) {
  const resetUrl = `${process.env.FRONTEND_ORIGIN}/reset-password?token=${user.resetToken}`;
  
  await sendEmailWithTemplate({
    to: user.email,
    subject: 'Password Reset - Business Discovery',
    templateName: 'password_reset',
    context: {
      rtl: user.locale && user.locale.startsWith('ar'),
      resetUrl,
      resetCode: user.resetToken,
      year: new Date().getFullYear(),
      userName: user.name || '',
    },
  });
/**
 * Send password change notification
 */
async function sendPasswordChange(user) {
  await sendEmailWithTemplate({
    to: user.email,
    subject: 'Password Changed - Business Discovery',
    templateName: 'password_reset',
/**
 * Send order status change notification
 */
async function sendOrderStatus(order, options = {}) {
  await sendEmailWithTemplate({
    to: order.buyerEmail,
    subject: `Order Status Update - #${order.referenceNumber || order._id.slice(-6)}`,
    templateName: 'order_status',
/**
 * Send admin monthly report
 */
async function sendMonthlyReport(reportData, adminEmails, period) {
  const startDate = period.startDate ? new Date(period.startDate) : new Date();
  const endDate = period.endDate ? new Date(period.endDate) : new Date();
  
  const periodStart = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const periodEnd = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  await sendEmailWithTemplate({
    to: adminEmails.join(','),
    subject: `Monthly Admin Report - ${periodStart} - ${periodEnd}`,
    templateName: 'monthly_report',
/**
 * Check and send inventory alerts for products that crossed thresholds
 * @param {Array} products - Product objects to check
 * @param {Function} getDb - Function to access database
 */
async function checkInventoryAlerts(products, getDb) {
  for (const product of products) {
    const stockStatus = product.stock <= 0 ? 'out_of_stock' : 
                       product.stock <= (product.lowStockThreshold || 10) ? 'low_stock' : 
                       'normal';
    
    if (stockStatus === 'normal') continue;
    
    const notifications = await getDb('notifications').find({
      type: 'inventory_alert',
      'metadata.productId': product._id.toString(),
      read: false,
module.exports = { NOTIFICATION_TYPES, sendRegistrationVerification, sendPasswordReset, sendPasswordChange, sendPurchaseConfirmation, sendOrderStatus, sendDailyReport, sendMonthlyReport, sendInventoryAlert, checkInventoryAlerts };
    }).toArray();
    
    if (notifications.length > 0) continue;
    
    await sendInventoryAlert(product, stockStatus);
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  sendRegistrationVerification,
  sendPasswordReset,
  sendPasswordChange,
  sendPurchaseConfirmation,
  sendOrderStatus,
  sendDailyReport,
  sendMonthlyReport,
  sendInventoryAlert,
  checkInventoryAlerts,
};
    context: {
      rtl: false,
      startDate: periodStart,
      endDate: periodEnd,
      totalOrders: reportData.totalOrders || 0,
      completedSalesCount: reportData.completedSales || 0,
      verifiedRevenue: reportData.verifiedRevenue || 0,
      currency: reportData.currency || 'EGP',
      refundedAmount: reportData.refundedAmount || 0,
      currency2: reportData.currency2 || '',
      refundedCount: reportData.refundedCount || 0,
      cancelledCount: reportData.cancelledCount || 0,
      newCustomerCount: reportData.newCustomers || 0,
      activeCustomerCount: reportData.activeCustomers || 0,
      bestSellingProducts: reportData.bestSellingProducts || [],
      lowStockCount: reportData.lowStockProducts || 0,
      outOfStockCount: reportData.outOfStockProducts || 0,
      paymentStatusBreakdown: reportData.paymentStatusBreakdown || [],
      monthComparison: reportData.monthComparison || [],
      year: endDate.getFullYear(),
    },
  });
}

/**
 * Send inventory alert to admin
 */
async function sendInventoryAlert(product, alertType) {
  const threshold = product.lowStockThreshold || 10;
  const message = alertType === 'low_stock'
    ? `Product "${product.name}" is running low on stock (current: ${product.stock}, threshold: ${threshold})`
    : `Product "${product.name}" is out of stock (current: ${product.stock})`;
  
  const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
  
  if (adminEmails.length === 0) {
    console.warn('No admin emails configured for inventory alerts');
    return;
  }
  
  await sendEmailWithTemplate({
    to: adminEmails.join(','),
    subject: `Inventory Alert: ${product.name}`,
    templateName: 'daily_report',
    context: {
      rtl: false,
      year: new Date().getFullYear(),
      message,
      productId: product._id,
      alertType,
      lowStockThreshold: threshold,
    },
  });
}

module.exports = { NOTIFICATION_TYPES, sendRegistrationVerification, sendPasswordReset, sendPasswordChange, sendPurchaseConfirmation, sendOrderStatus, sendDailyReport, sendMonthlyReport, sendInventoryAlert };
    context: {
      rtl: order.locale && order.locale.startsWith('ar'),
      items: order.items.map(item => ({
        name: item.productName,
        quantity: item.quantity,
      })),
      status: options.newStatus || order.status,
      previousStatus: options.previousStatus || 'pending',
      year: new Date().getFullYear(),
    },
  });
}

/**
 * Send admin daily report
 */
async function sendDailyReport(reportData, adminEmails) {
  const today = new Date();
  const cairoTime = new Date(today.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  
  const formattedDate = cairoTime.toLocaleDateString('en-CA');
  
  await sendEmailWithTemplate({
    to: adminEmails.join(','),
    subject: `Daily Admin Report - ${formattedDate}`,
    templateName: 'daily_report',
    context: {
      rtl: false,
      date: formattedDate,
      time: cairoTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        timeZone: 'Africa/Cairo' 
      }),
      newOrders: reportData.newOrders || [],
      completedSales: reportData.completedSales || [],
      verifiedCount: reportData.verifiedPayments || 0,
      verifiedAmount: reportData.verifiedPaymentAmount || 0,
      pendingCount: reportData.pendingPayments || 0,
      pendingAmount: reportData.pendingPaymentAmount || 0,
      failedCount: reportData.failedPayments || 0,
      failedAmount: reportData.failedPaymentAmount || 0,
      refundedCount: reportData.refundedOrders || 0,
      refundedAmount: reportData.refundedAmount || 0,
      cancelledCount: reportData.cancelledOrders || 0,
      cancelledAmount: reportData.cancelledAmount || 0,
      newUserCount: reportData.newUsers || 0,
      contactRequestCount: reportData.contactRequests || 0,
      bestSellingProducts: reportData.bestSellingProducts || [],
      lowStockCount: reportData.lowStockProducts || 0,
      outOfStockCount: reportData.outOfStockProducts || 0,
      year: cairoTime.getFullYear(),
    },
  });
}

module.exports = { NOTIFICATION_TYPES, sendRegistrationVerification, sendPasswordReset, sendPasswordChange, sendPurchaseConfirmation, sendOrderStatus, sendDailyReport };
    context: {
      rtl: user.locale && user.locale.startsWith('ar'),
      year: new Date().getFullYear(),
      userName: user.name || '',
      message: 'Your password has been successfully changed.',
    },
  });
}

/**
 * Send purchase confirmation email
 */
async function sendPurchaseConfirmation(order) {
  const items = order.items.map(item => ({
    name: item.productName,
    quantity: item.quantity,
    price: `${item.price} ${item.currency || 'EGP'}`,
    subtotal: `${item.subtotal} ${item.currency || 'EGP'}`,
  }));
  
  const discountText = order.discount > 0 ? `- ${order.discount} ${order.currency || 'EGP'}` : '';
  const taxesText = order.taxes > 0 ? `+ ${order.taxes} ${order.currency || 'EGP'}` : '';
  
  await sendEmailWithTemplate({
    to: order.buyerEmail,
    subject: 'Purchase Confirmation - Business Discovery',
    templateName: 'purchase_confirmation',
    context: {
      rtl: order.locale && order.locale.startsWith('ar'),
      items,
      totalAmount: `${order.totalAmount} ${order.currency || 'EGP'}`,
      currency: order.currency || 'EGP',
      discount: discountText,
      taxes: taxesText,
      orderReference: order.referenceNumber || order._id,
      purchaseDate: order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString(),
      paymentStatus: order.paymentStatus || 'pending',
      orderStatus: order.status || 'pending',
      trackingLink: order.trackingUrl || null,
      year: new Date().getFullYear(),
    },
  });
}

module.exports = { NOTIFICATION_TYPES, sendRegistrationVerification, sendPasswordReset, sendPasswordChange, sendPurchaseConfirmation };
}

module.exports = { NOTIFICATION_TYPES, sendRegistrationVerification, sendPasswordReset };