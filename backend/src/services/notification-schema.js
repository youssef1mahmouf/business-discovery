const { ObjectId } = require('mongodb');

/**
 * Notification schema for tracking email delivery
 * Stores notification events, delivery attempts, and preferences
 */
function NotificationSchema(db) {
  const collection = db.collection('notifications');

  // Ensure indexes for reliable lookups
  collection.createIndex({ userEmail: 1, type: 1, read: 1 });
  collection.createIndex({ orderId: 1, type: 1 });
  collection.createIndex({ createdAt: -1 });
  collection.createIndex({ 'preferences.userId': 1, 'preferences.notificationType': 1 });

  // Find pending notifications
  this.getPending = async function(filter = {}) {
    return collection.find({
      ...filter,
      delivered: false,
      retryCount: { $lt: 5 }
    }).toArray();
  };

  // Mark notification as delivered
  this.markDelivered = async function(notificationId) {
    return collection.updateOne(
      { _id: notificationId },
      { $set: { delivered: true, deliveredAt: new Date() } }
    );
  };

  // Record delivery attempt
  this.recordAttempt = async function(notificationId, success, error = null) {
    return collection.updateOne(
      { _id: notificationId },
      {
        $inc: { retryCount: 1 },
        $set: { lastAttempt: new Date(), lastError: error },
        $push: { attemptHistory: { at: new Date(), success } }
      }
    );
  };

  // Get user notification preferences
  this.getPreferences = async function(userId) {
    const record = await collection.findOne(
      { 'preferences.userId': userId },
      { projection: { preferences: 1 } }
    );
    return record && record.preferences ? record.preferences : {};
  };

  // Update user notification preferences
  this.updatePreferences = async function(userId, preferences) {
    return collection.updateOne(
      { _id: userId },
      { $set: { preferences } },
      { upsert: true }
    );
  };
}

module.exports = NotificationSchema;