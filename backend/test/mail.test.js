const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrevoClient, createSmtpClient } = require('../src/services/mail');

test('Brevo client sends a transactional email using the configured sender', async () => {
  let request;
  const client = createBrevoClient({
    apiKey: 'test-secret',
    fromEmail: 'noreply@example.com',
    fromName: 'Business Discovery',
  }, async (url, options) => {
    request = { url, options };
    return { ok: true, status: 201 };
  });

  const result = await client.send({
    to: 'user@example.com',
    subject: 'Your recovery code',
    text: 'Code: 123456',
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['api-key'], 'test-secret');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), {
    sender: { name: 'Business Discovery', email: 'noreply@example.com' },
    to: [{ email: 'user@example.com' }],
    subject: 'Your recovery code',
    textContent: 'Code: 123456',
  });
});

test('Brevo client reports provider errors without exposing credentials', async () => {
  const client = createBrevoClient({
    apiKey: 'test-secret',
    fromEmail: 'noreply@example.com',
  }, async () => ({ ok: false, status: 401 }));

  await assert.rejects(client.send({
    to: 'user@example.com',
    subject: 'Recovery',
    text: 'Code',
  }), (error) => {
    assert.match(error.message, /status 401/);
    assert.doesNotMatch(error.message, /test-secret/);
    assert.equal(error.status, 401);
    return true;
  });
});

test('Brevo client surfaces missing API key and sender configuration', async () => {
  const missingKeyClient = createBrevoClient({ fromEmail: 'noreply@example.com' });
  await assert.rejects(missingKeyClient.send({}), /BREVO_API_KEY is not configured/);

  const missingSenderClient = createBrevoClient({ apiKey: 'test-secret' });
  await assert.rejects(missingSenderClient.send({}), /BREVO_FROM_EMAIL is not configured/);
});

test('SMTP remains the default provider when no email provider is selected', async () => {
  const client = createSmtpClient({});
  assert.throws(() => client.send({}), /SMTP_HOST is not configured/);
});
