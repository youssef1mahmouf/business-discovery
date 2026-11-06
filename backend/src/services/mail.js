const net = require('net');

function createBrevoClient(emailConfig, fetchImplementation = globalThis.fetch) {
  if (!emailConfig.apiKey) {
    return {
      send: async () => {
        throw new Error('BREVO_API_KEY is not configured. Email delivery is unavailable.');
      },
    };
  }
  if (!emailConfig.fromEmail) {
    return {
      send: async () => {
        throw new Error('BREVO_FROM_EMAIL is not configured. Email delivery is unavailable.');
      },
    };
  }
  if (typeof fetchImplementation !== 'function') {
    throw new Error('A Fetch API implementation is required for Brevo email delivery.');
  }

  async function send({ to, subject, text }) {
    const response = await fetchImplementation('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': emailConfig.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: emailConfig.fromName || 'Business Discovery',
          email: emailConfig.fromEmail,
        },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });

    if (!response.ok) {
      const error = new Error('Brevo email request failed with status ' + response.status + '.');
      error.status = response.status;
      throw error;
    }
    return { ok: true };
  }

  return { send };
}

/**
 * Minimal SMTP client using Node's built-in net module.
 * Supports plain SMTP without AUTH or TLS for local relays.
 */
function createSmtpClient(smtpConfig) {
  if (smtpConfig.provider === 'brevo') {
    return createBrevoClient(smtpConfig, smtpConfig.fetch);
  }

  const host = smtpConfig.host;
  const port = smtpConfig.port || 25;

  if (!host) {
    return {
      send: () => {
        throw new Error('SMTP_HOST is not configured. Email delivery is unavailable.');
      },
    };
  }

  function sendCommand(socket, cmd) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('SMTP command timeout'));
      }, 10000);
      socket.once('data', (chunk) => {
        clearTimeout(timeout);
        const response = chunk.toString('utf8');
        resolve(response);
      });
      socket.write(cmd + '\r\n');
    });
  }

  async function send({ to, subject, text }) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      let connected = false;

      socket.on('connect', () => { connected = true; });
      socket.on('error', (err) => {
        reject(new Error('SMTP connection failed: ' + err.message));
        socket.destroy();
      });

      (async () => {
        try {
          // Read greeting
          await new Promise((resolve) => {
            socket.once('data', (chunk) => resolve(chunk.toString('utf8')));
          });

          await sendCommand(socket, 'EHLO localhost');
          await sendCommand(socket, `MAIL FROM:<${smtpConfig.from || 'noreply@localhost'}>`);
          await sendCommand(socket, `RCPT TO:<${to}>`);
          await sendCommand(socket, 'DATA');
          const message =
            `From: ${smtpConfig.from || 'noreply@localhost'}\r\n` +
            `To: ${to}\r\n` +
            `Subject: ${subject}\r\n` +
            `Content-Type: text/plain; charset=utf-8\r\n` +
            `\r\n` +
            `${text}\r\n` +
            `.\r\n`;
          await sendCommand(socket, message);
          await sendCommand(socket, 'QUIT');
          socket.end();
          resolve({ ok: true });
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      })();
    });
  }

  return { send };
}

module.exports = { createSmtpClient, createBrevoClient };
