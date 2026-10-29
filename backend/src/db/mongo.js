const { MongoClient } = require('mongodb');

let client = null;
let db = null;
const collections = {};

async function connect(config) {
  client = new MongoClient(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    // Atlas requires TLS; mongodb+srv enables it. Never disable certificate validation.
  });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
  } catch (error) {
    console.error('MongoDB connection failed:', error && error.name ? error.name : 'Error');
    throw error;
  }
  db = client.db(config.dbName);
  const names = ['users','user_states','friend_requests','friendships','partner_invites','partnerships','app_settings','projects','project_members','participants','tasks','notifications','conversations','messages','ai_conversations'];
  for (const n of names) collections[n] = db.collection(n);
  await collections.users.createIndex({ email: 1 }, { unique: true });
  await collections.friend_requests.createIndex({ from: 1, to: 1, type: 1 }, { unique: true });
  return { client, db, collections };
}

function getDb() { return db; }
function get(name) { return collections[name]; }
async function close() { if (client) await client.close(); client = null; db = null; }

module.exports = { connect, getDb, get, close };
