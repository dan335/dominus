// A small DDP client for the soak test's bots: the messages a browser's
// Meteor client sends and the documents it keeps. Needs Node 22 or later for
// the global WebSocket, and nothing else.

const crypto = require('crypto');

const digest = (password) => crypto.createHash('sha256').update(password).digest('hex');

class DdpError extends Error {
  constructor(error) {
    super(error.reason || error.message || String(error.error));
    this.error = error.error;
    this.reason = error.reason;
    this.errorType = error.errorType;
  }
}

class Ddp {
  constructor(url, opts = {}) {
    this.url = url;
    this.timeoutMs = opts.timeoutMs || 60000;
    this.onEvent = opts.onEvent || (() => {});
    this.collections = {};  // name -> Map(id -> doc)
    this.calls = new Map(); // id -> {resolve, reject, timer}
    this.subs = new Map();  // id -> {name, params, resolve, reject, ready}
    this.nextId = 1;
    this.userId = null;
    this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('connect timed out')), this.timeoutMs);
      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (msg.msg == 'connected') {
          clearTimeout(timer);
          this.session = msg.session;
          resolve(this);
        } else if (msg.msg == 'failed') {
          clearTimeout(timer);
          reject(new Error('DDP version refused'));
        } else {
          this.handle(msg);
        }
      };
      ws.onopen = () => this.send({msg: 'connect', version: '1', support: ['1']});
      ws.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error('websocket error: ' + (event.message || event.error || 'unknown')));
      };
      ws.onclose = () => {
        this.closed = true;
        const error = new Error('connection closed');
        for (const call of this.calls.values()) {
          clearTimeout(call.timer);
          call.reject(error);
        }
        this.calls.clear();
        for (const sub of this.subs.values()) {
          if (!sub.ready) sub.reject(error);
        }
        this.onEvent({type: 'closed'});
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState == 1) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    if (this.ws) this.ws.close();
  }

  handle(msg) {
    switch (msg.msg) {
      case 'ping':
        this.send(msg.id ? {msg: 'pong', id: msg.id} : {msg: 'pong'});
        break;
      case 'result': {
        const call = this.calls.get(msg.id);
        if (!call) break;
        this.calls.delete(msg.id);
        clearTimeout(call.timer);
        if (msg.error) call.reject(new DdpError(msg.error));
        else call.resolve(msg.result);
        break;
      }
      case 'ready':
        for (const id of msg.subs) {
          const sub = this.subs.get(id);
          if (sub && !sub.ready) {
            sub.ready = true;
            sub.resolve(id);
          }
        }
        break;
      case 'nosub': {
        const sub = this.subs.get(msg.id);
        if (!sub) break;
        this.subs.delete(msg.id);
        if (!sub.ready) sub.reject(new DdpError(msg.error || {error: 'nosub'}));
        else if (msg.error) this.onEvent({type: 'nosub', name: sub.name, error: msg.error});
        break;
      }
      case 'added': {
        const docs = this.collection(msg.collection);
        docs.set(msg.id, Object.assign({_id: msg.id}, docs.get(msg.id), msg.fields));
        break;
      }
      case 'changed': {
        const docs = this.collection(msg.collection);
        const doc = Object.assign({_id: msg.id}, docs.get(msg.id), msg.fields);
        for (const field of msg.cleared || []) delete doc[field];
        docs.set(msg.id, doc);
        break;
      }
      case 'removed':
        this.collection(msg.collection).delete(msg.id);
        break;
      case 'error':
        this.onEvent({type: 'error', reason: msg.reason});
        break;
    }
  }

  collection(name) {
    if (!this.collections[name]) this.collections[name] = new Map();
    return this.collections[name];
  }

  find(name, test = () => true) {
    return [...this.collection(name).values()].filter(test);
  }

  findOne(name, test = () => true) {
    return this.find(name, test)[0];
  }

  call(method, ...params) {
    if (this.closed) return Promise.reject(new Error('connection closed'));
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.calls.delete(id);
        reject(Object.assign(new Error(method + ' timed out'), {error: 'timeout'}));
      }, this.timeoutMs);
      this.calls.set(id, {resolve, reject, timer});
      this.send({msg: 'method', method, params, id});
    });
  }

  // resolves with the subscription's id once it is ready
  subscribe(name, ...params) {
    const id = String(this.nextId++);
    const ready = new Promise((resolve, reject) => {
      this.subs.set(id, {name, params, resolve, reject, ready: false});
    });
    this.send({msg: 'sub', id, name, params});
    return ready;
  }

  unsubscribe(id) {
    if (!this.subs.has(id)) return;
    this.subs.delete(id);
    this.send({msg: 'unsub', id});
  }

  subscriptionId(name, ...params) {
    const key = JSON.stringify(params);
    for (const [id, sub] of this.subs) {
      if (sub.name == name && JSON.stringify(sub.params) == key) return id;
    }
    return null;
  }

  async createUser(username, email, password) {
    const result = await this.call('createUser', {username, email, password: {digest: digest(password), algorithm: 'sha-256'}});
    this.userId = result.id;
    return result;
  }

  async login(username, password) {
    const result = await this.call('login', {user: {username}, password: {digest: digest(password), algorithm: 'sha-256'}});
    this.userId = result.id;
    return result;
  }
}

module.exports = {Ddp, DdpError};
