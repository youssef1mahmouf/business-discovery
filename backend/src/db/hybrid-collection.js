const { ObjectId } = require('mongodb');
const { EJSON } = require('bson');

function clone(value) {
  if (value === undefined) return undefined;
  return EJSON.parse(EJSON.stringify(value, null, 0, { relaxed: false }), { relaxed: true });
}

function idKey(value) {
  if (value && typeof value.toHexString === 'function') return 'oid:' + value.toHexString();
  return typeof value + ':' + String(value);
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (left == null || right == null) return left === right;
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (typeof left.equals === 'function' && typeof right.equals === 'function') {
    try { return left.equals(right); } catch {}
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
}

function getPath(target, path) {
  return path.split('.').reduce((value, key) => value == null ? undefined : value[key], target);
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let current = target;
  for (const key of keys.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = clone(value);
}

function unsetPath(target, path) {
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce((value, key) => value && value[key], target);
  if (parent && typeof parent === 'object') delete parent[keys[keys.length - 1]];
}

function valuesMatch(value, expected) {
  return Array.isArray(value) && !Array.isArray(expected)
    ? value.some((item) => deepEqual(item, expected))
    : deepEqual(value, expected);
}

function matchesCondition(value, expected, exists) {
  if (!expected || typeof expected !== 'object' || expected instanceof Date ||
      expected instanceof ObjectId || Array.isArray(expected) ||
      !Object.keys(expected).some((key) => key.startsWith('$'))) {
    if (expected === null) return value === null || !exists;
    return valuesMatch(value, expected);
  }
  for (const [operator, operand] of Object.entries(expected)) {
    if (operator === '$options') continue;
    if (operator === '$exists' && exists !== Boolean(operand)) return false;
    if (operator === '$ne' && valuesMatch(value, operand)) return false;
    if (operator === '$in' && (!Array.isArray(operand) ||
        !operand.some((item) => valuesMatch(value, item)))) return false;
    if (operator === '$nin' && Array.isArray(operand) &&
        operand.some((item) => valuesMatch(value, item))) return false;
    if (operator === '$all' && (!Array.isArray(value) || !Array.isArray(operand) ||
        !operand.every((item) => value.some((entry) => deepEqual(entry, item))))) return false;
    if (operator === '$size' && (!Array.isArray(value) || value.length !== operand)) return false;
    if (operator === '$regex') {
      const regex = operand instanceof RegExp
        ? operand
        : new RegExp(String(operand), String(expected.$options || ''));
      const values = Array.isArray(value) ? value : [value];
      if (!values.some((item) => typeof item === 'string' && regex.test(item))) return false;
    }
    if (operator === '$elemMatch' && (!Array.isArray(value) ||
        !value.some((item) => matches(item, operand)))) return false;
    if (operator === '$gt' && !(value > operand)) return false;
    if (operator === '$gte' && !(value >= operand)) return false;
    if (operator === '$lt' && !(value < operand)) return false;
    if (operator === '$lte' && !(value <= operand)) return false;
    if (operator === '$eq' && !valuesMatch(value, operand)) return false;
    if (!['$options', '$exists', '$ne', '$in', '$nin', '$all', '$size', '$regex',
      '$elemMatch', '$gt', '$gte', '$lt', '$lte', '$eq'].includes(operator)) {
      const error = new Error('Unsupported offline query operator: ' + operator);
      error.code = 'fallback_unsupported_query';
      throw error;
    }
  }
  return true;
}

function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return Array.isArray(expected) && expected.some((part) => matches(document, part));
    if (key === '$and') return Array.isArray(expected) && expected.every((part) => matches(document, part));
    if (key === '$nor') return Array.isArray(expected) && !expected.some((part) => matches(document, part));
    if (key.startsWith('$')) {
      const error = new Error('Unsupported offline query operator: ' + key);
      error.code = 'fallback_unsupported_query';
      throw error;
    }
    const value = getPath(document, key);
    return matchesCondition(value, expected, value !== undefined);
  });
}

function projectDocument(document, projection) {
  if (!projection || !Object.keys(projection).length) return clone(document);
  const entries = Object.entries(projection);
  const includes = entries.filter(([key, value]) => key !== '_id' && value === 1).map(([key]) => key);
  if (includes.length) {
    const result = {};
    for (const key of includes) {
      const value = getPath(document, key);
      if (value !== undefined) setPath(result, key, value);
    }
    if (projection._id !== 0 && document._id !== undefined) result._id = clone(document._id);
    return result;
  }
  const result = clone(document);
  for (const [key, include] of entries) if (include === 0) unsetPath(result, key);
  return result;
}

function compareValues(left, right) {
  if (deepEqual(left, right)) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function sortDocuments(documents, specification) {
  const fields = Object.entries(specification || {});
  if (!fields.length) return documents;
  return documents.sort((left, right) => {
    for (const [field, direction] of fields) {
      const comparison = compareValues(getPath(left, field), getPath(right, field));
      if (comparison) return comparison * (direction < 0 ? -1 : 1);
    }
    return 0;
  });
}

function applyUpdate(document, update, inserting = false) {
  const result = clone(document);
  const operators = Object.keys(update || {}).filter((key) => key.startsWith('$'));
  if (!operators.length) {
    const replacement = clone(update || {});
    if (result._id !== undefined) replacement._id = result._id;
    return replacement;
  }
  for (const [operator, fields] of Object.entries(update)) {
    if (!fields || typeof fields !== 'object') continue;
    if (operator === '$set' || (operator === '$setOnInsert' && inserting)) {
      for (const [path, value] of Object.entries(fields)) setPath(result, path, value);
    } else if (operator === '$unset') {
      for (const path of Object.keys(fields)) unsetPath(result, path);
    } else if (operator === '$inc') {
      for (const [path, amount] of Object.entries(fields)) {
        const current = getPath(result, path);
        setPath(result, path, (current === undefined ? 0 : Number(current)) + Number(amount));
      }
    } else if (operator === '$mul') {
      for (const [path, amount] of Object.entries(fields)) {
        const current = getPath(result, path);
        setPath(result, path, (current === undefined ? 0 : Number(current)) * Number(amount));
      }
    } else if (operator === '$min' || operator === '$max') {
      for (const [path, value] of Object.entries(fields)) {
        const current = getPath(result, path);
        if (current === undefined || (operator === '$min' ? value < current : value > current)) {
          setPath(result, path, value);
        }
      }
    } else if (operator === '$push' || operator === '$addToSet') {
      for (const [path, value] of Object.entries(fields)) {
        const current = getPath(result, path);
        const list = current === undefined ? [] : current;
        if (!Array.isArray(list)) throw new TypeError('Offline array update target is not an array.');
        const additions = value && typeof value === 'object' && Array.isArray(value.$each)
          ? value.$each
          : [value];
        const values = operator === '$addToSet'
          ? additions.filter((item) => !list.some((entry) => deepEqual(entry, item)))
          : additions;
        if (operator === '$push' && value && value.$position !== undefined) {
          list.splice(Number(value.$position), 0, ...values.map(clone));
        } else {
          list.push(...values.map(clone));
        }
        setPath(result, path, list);
      }
    } else if (operator === '$pull') {
      for (const [path, value] of Object.entries(fields)) {
        const current = getPath(result, path);
        if (!Array.isArray(current)) continue;
        const kept = current.filter((entry) =>
          value && typeof value === 'object' && Object.keys(value).some((key) => key.startsWith('$'))
            ? !matchesCondition(entry, value, entry !== undefined)
            : value && typeof value === 'object' && !Array.isArray(value)
              ? !matches(entry, value)
              : !deepEqual(entry, value));
        setPath(result, path, kept);
      }
    } else if (operator === '$currentDate') {
      for (const [path, value] of Object.entries(fields)) {
        setPath(result, path, value && value.$type === 'timestamp' ? Date.now() : new Date());
      }
    } else if (operator !== '$setOnInsert') {
      const error = new Error('Unsupported offline update operator: ' + operator);
      error.code = 'fallback_unsupported_update';
      throw error;
    }
  }
  return result;
}

function baseDocument(query) {
  const result = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (key === '$and' && Array.isArray(value)) {
      Object.assign(result, baseDocument(Object.assign({}, ...value)));
    } else if (!key.startsWith('$') && (!value || typeof value !== 'object' ||
        value instanceof Date || value instanceof ObjectId || Array.isArray(value) ||
        !Object.keys(value).some((operator) => operator.startsWith('$')))) {
      setPath(result, key, value);
    }
  }
  return result;
}

function duplicateError(collection, keyPattern) {
  const error = new Error('Duplicate key for offline JSON collection ' + collection + '.');
  error.name = 'MongoServerError';
  error.code = 11000;
  error.keyPattern = keyPattern;
  return error;
}

function assertUnique(collection, documents, candidate, allowSameId = false) {
  if (candidate._id === undefined) throw new TypeError('Offline records require a stable _id.');
  const sameIdExists = documents.some((document) => deepEqual(document._id, candidate._id));
  if (sameIdExists && !allowSameId) {
    throw duplicateError(collection, { _id: 1 });
  }
  const indexes = collection === 'users'
    ? [{ email: 1 }, { username: 1, sparse: true }]
    : collection === 'friend_requests'
      ? [{ from: 1, to: 1, type: 1 }]
      : [];
  for (const index of indexes) {
    const fields = Object.keys(index).filter((key) => key !== 'sparse');
    const values = fields.map((field) => getPath(candidate, field));
    if (index.sparse && values.every((value) => value === undefined)) continue;
    if (documents.some((document) => !(allowSameId && deepEqual(document._id, candidate._id)) &&
        fields.every((field) => deepEqual(getPath(document, field), getPath(candidate, field))))) {
      throw duplicateError(collection, Object.fromEntries(fields.map((field) => [field, 1])));
    }
  }
}

function aggregateDocuments(documents, pipeline) {
  let result = documents.map(clone);
  for (const stage of pipeline) {
    if (stage.$match) result = result.filter((document) => matches(document, stage.$match));
    else if (stage.$sort) result = sortDocuments(result, stage.$sort);
    else if (stage.$skip !== undefined) result = result.slice(Number(stage.$skip));
    else if (stage.$limit !== undefined) result = result.slice(0, Number(stage.$limit));
    else if (stage.$group) {
      const groups = new Map();
      for (const document of result) {
        const groupValue = typeof stage.$group._id === 'string' && stage.$group._id.startsWith('$')
          ? getPath(document, stage.$group._id.slice(1))
          : stage.$group._id;
        const key = EJSON.stringify(groupValue, null, 0, { relaxed: false });
        if (!groups.has(key)) {
          const group = { _id: clone(groupValue) };
          for (const [field, accumulator] of Object.entries(stage.$group)) {
            if (field !== '_id' && accumulator.$sum !== undefined) group[field] = 0;
          }
          groups.set(key, group);
        }
        const group = groups.get(key);
        for (const [field, accumulator] of Object.entries(stage.$group)) {
          if (field === '_id') continue;
          if (accumulator.$sum === undefined) {
            const error = new Error('Unsupported offline aggregation operator.');
            error.code = 'fallback_unsupported_aggregate';
            throw error;
          }
          const operand = accumulator.$sum;
          group[field] += typeof operand === 'string' && operand.startsWith('$')
            ? Number(getPath(document, operand.slice(1))) || 0
            : Number(operand) || 0;
        }
      }
      result = Array.from(groups.values());
    } else if (stage.$project) {
      result = result.map((document) => projectDocument(document, stage.$project));
    } else {
      const error = new Error('Unsupported offline aggregation stage.');
      error.code = 'fallback_unsupported_aggregate';
      throw error;
    }
  }
  return result;
}

function applyFindOptions(documents, options = {}) {
  let result = documents.map(clone);
  sortDocuments(result, options.sort);
  if (Number.isInteger(options.skip) && options.skip > 0) result = result.slice(options.skip);
  if (Number.isInteger(options.limit) && options.limit >= 0) result = result.slice(0, options.limit);
  if (options.projection) result = result.map((document) => projectDocument(document, options.projection));
  return result;
}

class HybridCursor {
  constructor(collection, query, options) {
    this.collection = collection;
    this.query = query;
    this.options = { ...options };
  }

  sort(specification) { this.options.sort = specification; return this; }
  skip(count) { this.options.skip = count; return this; }
  limit(count) { this.options.limit = count; return this; }
  project(projection) { this.options.projection = projection; return this; }
  toArray() { return this.collection.manager.find(this.collection.name, this.query, this.options); }
}

class HybridAggregateCursor {
  constructor(collection, pipeline, options) {
    this.collection = collection;
    this.pipeline = pipeline;
    this.options = options;
  }

  toArray() { return this.collection.manager.aggregate(this.collection.name, this.pipeline, this.options); }
}

class HybridCollection {
  constructor(manager, name) {
    this.manager = manager;
    this.name = name;
  }

  find(query = {}, options = {}) { return new HybridCursor(this, query, options); }
  findOne(query = {}, options = {}) { return this.manager.findOne(this.name, query, options); }
  countDocuments(query = {}, options = {}) { return this.manager.countDocuments(this.name, query, options); }
  aggregate(pipeline = [], options = {}) { return new HybridAggregateCursor(this, pipeline, options); }
  insertOne(document, options = {}) { return this.manager.insertOne(this.name, document, options); }
  insertMany(documents, options = {}) { return this.manager.insertMany(this.name, documents, options); }
  updateOne(query, update, options = {}) { return this.manager.updateOne(this.name, query, update, options); }
  updateMany(query, update, options = {}) { return this.manager.updateMany(this.name, query, update, options); }
  deleteOne(query, options = {}) { return this.manager.deleteOne(this.name, query, options); }
  deleteMany(query, options = {}) { return this.manager.deleteMany(this.name, query, options); }
}

module.exports = {
  HybridCollection,
  aggregateDocuments,
  applyFindOptions,
  applyUpdate,
  assertUnique,
  baseDocument,
  clone,
  deepEqual,
  idKey,
  matches,
  sortDocuments
};
