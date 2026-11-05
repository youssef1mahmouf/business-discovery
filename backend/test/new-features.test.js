const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const ExcelJS = require('exceljs');
const { createApp } = require('../src/app');
const { signToken } = require('../src/services/auth');
const { decodeFile, extractRows, normalizeRows } = require('../src/services/product-import');
const questionnaire = require('../../frontend/assets/data/assessment-questions.json');

function getPath(target, path) {
  return path.split('.').reduce((value, key) => value && value[key], target);
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let current = target;
  for (const key of keys.slice(0, -1)) current = current[key] || (current[key] = {});
  current[keys[keys.length - 1]] = value;
}

function matches(document, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition) => matches(document, condition));
    const value = getPath(document, key);
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((item) => String(value) === String(item));
    }
    if (expected && typeof expected === 'object' && '$ne' in expected) return value !== expected.$ne;
    if (expected && typeof expected === 'object' && '$regex' in expected) {
      return new RegExp(expected.$regex, expected.$options || '').test(String(value || ''));
    }
    return String(value) === String(expected);
  });
}

function collection(documents = []) {
  return {
    documents,
    find(query = {}) {
      let items = documents.filter((document) => matches(document, query));
      const cursor = {
        skip(count) { items = items.slice(count); return cursor; },
        limit(count) { items = items.slice(0, count); return cursor; },
        sort(spec) {
          const [key, direction] = Object.entries(spec)[0];
          items = items.slice().sort((left, right) =>
            String(left[key] || '').localeCompare(String(right[key] || '')) * direction);
          return cursor;
        },
        async toArray() { return items.slice(); }
      };
      return cursor;
    },
    async findOne(query) { return documents.find((document) => matches(document, query)) || null; },
    async countDocuments(query) { return documents.filter((document) => matches(document, query)).length; },
    async insertOne(document) {
      document._id = document._id || new ObjectId();
      documents.push(document);
      return { insertedId: document._id };
    },
    async insertMany(items) {
      items.forEach((item) => { item._id = item._id || new ObjectId(); documents.push(item); });
      return { insertedCount: items.length };
    },
    async updateOne(query, update, options = {}) {
      let document = documents.find((item) => matches(item, query));
      if (!document && options.upsert) {
        document = {};
        for (const [key, value] of Object.entries(query)) {
          if (!key.startsWith('$')) setPath(document, key, value);
        }
        documents.push(document);
      }
      if (!document) return { matchedCount: 0 };
      for (const [key, value] of Object.entries(update.$set || {})) setPath(document, key, value);
      for (const key of Object.keys(update.$unset || {})) {
        const parts = key.split('.');
        const parent = parts.slice(0, -1).reduce((value, part) => value && value[part], document);
        if (parent) delete parent[parts[parts.length - 1]];
      }
      return { matchedCount: 1 };
    },
    aggregate(pipeline) {
      let items = documents.slice();
      for (const stage of pipeline) {
        if (stage.$match) items = items.filter((item) => matches(item, stage.$match));
        if (stage.$group) {
          const sums = {};
          for (const [key, expression] of Object.entries(stage.$group)) {
            if (key === '_id') continue;
            sums[key] = items.reduce((total, item) => {
              const value = typeof expression.$sum === 'string'
                ? getPath(item, expression.$sum.slice(1))
                : expression.$sum;
              return total + (Number(value) || 0);
            }, 0);
          }
          items = items.length ? [{ _id: null, ...sums }] : [];
        }
      }
      return { toArray: async () => items };
    }
  };
}

async function setup(t, initial = {}, options = {}) {
  const secret = 'test-secret-with-more-than-32-characters';
  const users = collection(initial.users || []);
  const collections = {
    users,
    projects: collection(initial.projects || []),
    project_members: collection(initial.project_members || []),
    project_assessments: collection(initial.project_assessments || []),
    tasks: collection(initial.tasks || []),
    notifications: collection(),
    ai_conversations: collection(initial.ai_conversations || []),
    products: collection(),
    orders: collection(),
    app_settings: collection()
  };
  const server = createApp({
    config: {
      frontendOrigin: '*',
      tokenSecret: secret,
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'test-model',
      ollamaTimeoutMs: 2000
    },
    fetch: options.fetch,
    db: { get: (name) => collections[name] || collection() }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = (user) => signToken({ sub: String(user._id), email: user.email }, secret);
  const request = (token, url, options = {}) => fetch(baseUrl + url, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  return { collections, users, request, tokenFor };
}

test('registration saves a unique username and CV profile without granting admin access', async (t) => {
  const app = await setup(t);
  const invalid = await app.request(null, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'person@example.com', password: 'secure-password', username: 'no spaces' })
  });
  assert.equal(invalid.status, 400);
  assert.equal(app.users.documents.length, 0);

  const response = await app.request(null, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'person@example.com',
      password: 'secure-password',
      username: 'youssef_24',
      role: 'main_super_admin',
      profile: {
        displayName: 'Youssef Mahmouf',
        username: 'youssef_24',
        headline: 'Business founder',
        location: 'Cairo',
        bio: 'Building a new business',
        skills: ['Planning'],
        experience: [{ role: 'Founder', organization: 'Startup', period: '2026', details: 'Early stage' }],
        education: [{ qualification: 'Business', institution: 'College', period: '2025' }]
      }
    })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  const user = app.users.documents[0];
  assert.equal(user.username, 'youssef_24');
  assert.equal(user.profile.displayName, 'Youssef Mahmouf');
  assert.equal(user.profile.experience[0].role, 'Founder');
  assert.equal(user.role, 'regular_user');
  const profile = await app.request(result.token, '/api/profile');
  assert.equal((await profile.json()).profile.username, 'youssef_24');
  const login = await app.request(null, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'YOUSSEF_24', password: 'secure-password' })
  });
  assert.equal(login.status, 200);
});

test('regular users and main super admins can create projects with their own membership', async (t) => {
  const owner = { _id: new ObjectId(), email: 'owner@example.com', role: 'regular_user' };
  const admin = { _id: new ObjectId(), email: 'admin@example.com', role: 'main_super_admin' };
  const app = await setup(t, { users: [owner, admin] });
  const projectBody = {
    name: 'Local Learning Market',
    description: 'Connecting local tutors to students',
    projectType: 'marketplace',
    industry: 'Education',
    stage: 'validation',
    targetMarket: 'Students in Cairo',
    problem: 'Finding trusted tutors is difficult'
  };
  const response = await app.request(app.tokenFor(owner), '/api/projects', {
    method: 'POST',
    body: JSON.stringify(projectBody)
  });
  assert.equal(response.status, 201);
  const adminResponse = await app.request(app.tokenFor(admin), '/api/projects', {
    method: 'POST',
    body: JSON.stringify({ ...projectBody, name: 'Admin project' })
  });
  assert.equal(adminResponse.status, 201);
  const project = app.collections.projects.documents[0];
  assert.equal(project.projectType, 'marketplace');
  assert.equal(project.industry, 'Education');
  assert.equal(project.stage, 'validation');
  assert.equal(project.targetMarket, 'Students in Cairo');
  assert.equal(project.problem, 'Finding trusted tutors is difficult');
  assert.deepEqual(app.collections.project_members.documents.map((member) => [member.email, member.role]), [
    [owner.email, 'owner'],
    [admin.email, 'owner']
  ]);
});

test('Ollama status and project chat use assessment answers and stay private to project members', async (t) => {
  const owner = { _id: new ObjectId(), email: 'owner@example.com', role: 'regular_user' };
  const outsider = { _id: new ObjectId(), email: 'outsider@example.com', role: 'regular_user' };
  const projectId = new ObjectId();
  const answers = Object.fromEntries(questionnaire.questions.map((question) => [question.id, 4]));
  const ollamaRequests = [];
  const app = await setup(t, {
    users: [owner, outsider],
    projects: [{ _id: projectId, name: 'Local Learning Market', projectType: 'marketplace', industry: 'Education' }],
    project_members: [{ projectId: String(projectId), email: owner.email, role: 'owner' }],
    project_assessments: [{
      projectId: String(projectId),
      answers,
      score: 75,
      readiness: 'متقدم',
      categories: [],
      createdAt: new Date().toISOString()
    }]
  }, {
    fetch: async (url, options = {}) => {
      if (String(url).endsWith('/api/tags')) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: 'test-model:latest' }] }) };
      }
      ollamaRequests.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({ message: { content: 'ابدأ بمقابلة العملاء المحتملين.' } }) };
    }
  });
  const ownerToken = app.tokenFor(owner);
  const outsiderToken = app.tokenFor(outsider);
  const statusResponse = await app.request(ownerToken, '/api/ai/status');
  const status = await statusResponse.json();
  assert.equal(status.reachable, true);
  assert.equal(status.modelAvailable, true);

  const denied = await app.request(outsiderToken, `/api/ai/projects/${projectId}/chat`);
  assert.equal(denied.status, 403);
  const response = await app.request(ownerToken, `/api/ai/projects/${projectId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message: 'كيف أختبر الطلب على المشروع؟' })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).messages[1].content, 'ابدأ بمقابلة العملاء المحتملين.');
  assert.match(ollamaRequests[0].messages[1].content, new RegExp(questionnaire.questions[99].text));
  assert.equal(app.collections.ai_conversations.documents[0].userEmail, owner.email);

  const history = await app.request(ownerToken, `/api/ai/projects/${projectId}/chat`);
  assert.deepEqual((await history.json()).messages.map((message) => message.role), ['user', 'assistant']);
});

test('administrator user search includes usernames and never returns profile documents', async (t) => {
  const admin = { _id: new ObjectId(), email: 'admin@example.com', role: 'main_super_admin' };
  const user = {
    _id: new ObjectId(),
    email: 'person@example.com',
    username: 'youssef_24',
    displayName: 'Youssef Mahmouf',
    role: 'regular_user',
    profile: { bio: 'private bio' },
    passwordHash: 'secret'
  };
  const app = await setup(t, { users: [admin, user] });
  const response = await app.request(app.tokenFor(admin), '/api/admin/users?q=youssef');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.total, 1);
  assert.equal(result.users[0].username, 'youssef_24');
  assert.equal(result.users[0].displayName, 'Youssef Mahmouf');
  assert.equal('profile' in result.users[0], false);
  assert.equal('passwordHash' in result.users[0], false);
});

test('missing frontend paths return a real 404 page instead of the homepage', async (t) => {
  const app = await setup(t);
  const response = await app.request(null, '/a-page-that-does-not-exist.html');
  assert.equal(response.status, 404);
  assert.match(await response.text(), /الصفحة غير موجودة/);
});

test('CV stays private until a revocable share token is enabled', async (t) => {
  const user = { _id: new ObjectId(), email: 'person@example.com', role: 'regular_user' };
  const app = await setup(t, { users: [user] });
  const token = app.tokenFor(user);
  const saved = await app.request(token, '/api/profile', {
    method: 'PUT',
    body: JSON.stringify({
      displayName: 'Test Person',
      headline: 'Designer',
      bio: 'Professional summary',
      location: 'Cairo',
      website: 'https://example.com',
      skills: ['Design'],
      experience: [],
      education: []
    })
  });
  assert.equal(saved.status, 200);
  assert.equal(user.profile.displayName, 'Test Person');

  const beforeShare = await app.request(null, '/api/public/profiles/invalid-token');
  assert.equal(beforeShare.status, 404);
  const created = await app.request(token, '/api/profile/share', { method: 'POST' });
  const { shareUrl } = await created.json();
  const shareToken = new URL(shareUrl, 'http://local').searchParams.get('share');
  assert.ok(shareToken);
  assert.notEqual(user.profileShareTokenHash, shareToken);
  const shared = await app.request(null, '/api/public/profiles/' + encodeURIComponent(shareToken));
  assert.equal(shared.status, 200);
  assert.equal((await shared.json()).profile.displayName, 'Test Person');

  const revoked = await app.request(token, '/api/profile/share', { method: 'DELETE' });
  assert.equal(revoked.status, 200);
  assert.equal((await app.request(null, '/api/public/profiles/' + encodeURIComponent(shareToken))).status, 404);
});

test('100-question assessment requires a project manager and persists equal category scores', async (t) => {
  const owner = { _id: new ObjectId(), email: 'owner@example.com', role: 'regular_user' };
  const projectId = new ObjectId();
  const app = await setup(t, {
    users: [owner],
    projects: [{ _id: projectId, name: 'Test project' }],
    project_members: [{ projectId: String(projectId), email: owner.email, role: 'owner' }]
  });
  assert.equal(questionnaire.questions.length, 100);
  const answers = Object.fromEntries(questionnaire.questions.map((question) => [question.id, 3]));
  const response = await app.request(app.tokenFor(owner), `/api/projects/${projectId}/assessments`, {
    method: 'POST',
    body: JSON.stringify({ projectType: 'saas', answers })
  });
  assert.equal(response.status, 201);
  const { assessment } = await response.json();
  assert.equal(assessment.score, 50);
  assert.equal(assessment.categories.length, 5);
  assert.ok(assessment.categories.every((category) => category.score === 50));
  assert.equal(app.collections.project_assessments.documents.length, 1);

  const invalid = await app.request(app.tokenFor(owner), `/api/projects/${projectId}/assessments`, {
    method: 'POST',
    body: JSON.stringify({ projectType: 'saas', answers: { q001: 3 } })
  });
  assert.equal(invalid.status, 400);
});

test('project task completion waits for a manager approval', async (t) => {
  const owner = { _id: new ObjectId(), email: 'owner@example.com', role: 'regular_user' };
  const assignee = { _id: new ObjectId(), email: 'member@example.com', role: 'regular_user' };
  const projectId = new ObjectId();
  const task = {
    _id: new ObjectId(),
    title: 'Review the draft',
    owner: owner.email,
    assignee: assignee.email,
    projectId: String(projectId),
    status: 'open'
  };
  const app = await setup(t, {
    users: [owner, assignee],
    projects: [{ _id: projectId, name: 'Project' }],
    project_members: [
      { projectId: String(projectId), email: owner.email, role: 'owner' },
      { projectId: String(projectId), email: assignee.email, role: 'participant' }
    ],
    tasks: [task]
  });
  const requested = await app.request(app.tokenFor(assignee), `/api/tasks/${task._id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'done' })
  });
  assert.equal(requested.status, 200);
  assert.equal(task.status, 'pending_approval');
  assert.equal((await requested.json()).approvalRequested, true);

  const approved = await app.request(app.tokenFor(owner), `/api/tasks/${task._id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'done' })
  });
  assert.equal(approved.status, 200);
  assert.equal(task.status, 'done');
  assert.equal(app.collections.notifications.documents.length, 1);
});

test('product import previews are not saved before explicit confirmation', async (t) => {
  const seller = { _id: new ObjectId(), email: 'seller@example.com', role: 'regular_user' };
  const app = await setup(t, { users: [seller] });
  const contentBase64 = Buffer.from('name,price_egp,description\nBook,12.50,Sample').toString('base64');
  assert.deepEqual(normalizeRows(await extractRows(decodeFile('products.csv', contentBase64)))[0].priceMinor, 1250);
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Products').addRows([
    ['name', 'price_egp', 'description'],
    ['Workbook', 9.5, 'Excel sample']
  ]);
  const workbookBase64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
  const workbookRows = await extractRows(decodeFile('products.xlsx', workbookBase64));
  assert.equal(normalizeRows(workbookRows)[0].priceMinor, 950);
  const preview = await app.request(app.tokenFor(seller), '/api/products/import-preview', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'products.csv',
      contentBase64
    })
  });
  const previewBody = await preview.json();
  assert.equal(preview.status, 200, JSON.stringify(previewBody));
  assert.equal(app.collections.products.documents.length, 0);
  assert.equal(previewBody.saved, false);

  const committed = await app.request(app.tokenFor(seller), '/api/products/import-commit', {
    method: 'POST',
    body: JSON.stringify({ products: [{ name: 'Book', description: 'Sample', priceMinor: 1250 }] })
  });
  assert.equal(committed.status, 201);
  assert.equal(app.collections.products.documents.length, 1);
  assert.equal(app.collections.products.documents[0].active, false);
});

test('InstaPay orders remain pending until seller verifies a transfer reference', async (t) => {
  const admin = { _id: new ObjectId(), email: 'admin@example.com', role: 'main_super_admin' };
  const seller = {
    _id: new ObjectId(),
    email: 'seller@example.com',
    role: 'regular_user',
    profile: { displayName: 'Seller' },
    commerceSettings: { instapayAddress: 'seller@instapay', instructions: 'Transfer', acceptingOrders: true }
  };
  const buyer = { _id: new ObjectId(), email: 'buyer@example.com', role: 'regular_user' };
  const app = await setup(t, { users: [admin, seller, buyer] });

  const settings = await app.request(app.tokenFor(admin), '/api/admin/payment-settings', {
    method: 'PUT',
    body: JSON.stringify({ instapayEnabled: true, commissionBps: 500 })
  });
  assert.equal(settings.status, 200);
  const product = await app.request(app.tokenFor(seller), '/api/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'Book', description: 'Sample', priceMinor: 10000 })
  });
  const productId = (await product.json()).product._id;
  const created = await app.request(app.tokenFor(buyer), '/api/orders', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity: 2 })
  });
  assert.equal(created.status, 201);
  const order = (await created.json()).order;
  assert.equal(order.totalMinor, 20000);
  assert.equal(order.estimatedFeeMinor, 1000);
  assert.equal(order.status, 'awaiting_transfer');

  const reference = await app.request(app.tokenFor(buyer), `/api/orders/${order._id}/transfer-reference`, {
    method: 'POST',
    body: JSON.stringify({ reference: 'IPN-12345' })
  });
  assert.equal(reference.status, 200);
  assert.equal(app.collections.orders.documents[0].status, 'pending_verification');

  const verified = await app.request(app.tokenFor(seller), `/api/orders/${order._id}/verify`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'paid' })
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).verifiedManually, true);
  assert.equal(app.collections.orders.documents[0].status, 'paid');
  const summary = await app.request(app.tokenFor(seller), '/api/commerce/summary');
  assert.equal((await summary.json()).summary.grossMinor, 20000);
});
