const axios = require('axios');

const FCM_URL = 'https://fcm.googleapis.com/fcm/send';

async function sendPush(fcmToken, title, body, data = {}) {
  if (!fcmToken) return { success: false, reason: 'No FCM token' };

  try {
    const response = await axios.post(FCM_URL, {
      to: fcmToken,
      notification: { title, body, sound: 'alert_sound', priority: 'high' },
      data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      priority: 'high',
    }, {
      headers: {
        Authorization: `key=${process.env.FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    return { success: true, messageId: response.data.message_id };
  } catch (err) {
    console.error('[Push] FCM error:', err.response?.data || err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = { sendPush };
