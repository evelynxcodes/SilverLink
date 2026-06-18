const axios = require('axios');

async function sendSms(phone, message) {
  if (!phone) return { success: false, reason: 'No phone number' };

  try {
    const response = await axios.post(process.env.MAXIS_SMS_API_URL, {
      to: phone,
      message,
      sender: 'SILVERLINK',
      type: 'transactional',
    }, {
      headers: {
        'X-API-Key': process.env.MAXIS_SMS_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    return { success: true, messageId: response.data.messageId };
  } catch (err) {
    console.error('[SMS] Maxis SMS API error:', err.response?.data || err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = { sendSms };
