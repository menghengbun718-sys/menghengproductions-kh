export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const event = String(body.event || 'unknown').slice(0, 80);
  const product = String(body.product || 'unknown product').slice(0, 200);
  const price = String(body.price || 'Not specified').slice(0, 80);

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8699783220:AAHBByYqDpHbSLn16X22FJqdqwZe4vhXJb8';
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8651941543';

  if (!BOT_TOKEN || BOT_TOKEN === 'BOT TOKEN') {
    return res.status(500).json({ ok: false, error: 'Telegram bot token is missing' });
  }

  if (!CHAT_ID) {
    return res.status(500).json({ ok: false, error: 'Telegram chat ID is missing' });
  }

  const message = [
    'MengHeng Productions',
    `Event: ${event}`,
    `Product: ${product}`,
    `Price: ${price}`,
    `Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh' })} ICT`,
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return res.status(502).json({ ok: false, error: data.description || 'Telegram send failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unexpected error' });
  }
}
