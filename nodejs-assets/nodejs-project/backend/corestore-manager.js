const Corestore = require('corestore');
const Hypercore = require('hypercore');
const crypto = require('hypercore-crypto');
const b4a = require('b4a');
const path = require('path');

/**
 * CorestoreManager - Manages append-only logs for each chat
 * Each chat gets its own Hypercore for storing messages
 */
class CorestoreManager {
  constructor(storagePath = './storage') {
    this.storagePath = path.resolve(storagePath); // Use path.resolve for absolute paths
    this.store = null;
    this.cores = new Map(); // Map<chatId, Hypercore>
    this.keyPairs = new Map(); // Map<chatId, {publicKey, secretKey}>
    this.ready = false;
  }

  /**
   * Initialize the corestore
   */
  async initialize() {
    try {
      this.store = new Corestore(this.storagePath);
      await this.store.ready();
      this.ready = true;
      console.log('[Corestore] Initialized at:', this.storagePath);
      return true;
    } catch (error) {
      console.error('[Corestore] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Get or create a Hypercore for a specific chat
   * @param {string} chatId - Unique identifier for the chat
   * @param {Buffer} [key] - Optional discovery key to join existing chat
   * @returns {Promise<Hypercore>}
   */
  async getChatCore(chatId, key = null) {
    if (!this.ready) {
      throw new Error('Corestore not initialized');
    }

    // Check if we already have this core
    if (this.cores.has(chatId)) {
      return this.cores.get(chatId);
    }

    let core;

    if (key) {
      // Join existing chat using the provided key
      core = this.store.get({key});
    } else {
      // Create a new chat core
      core = this.store.get({name: chatId});
    }

    await core.ready();

    // Store the core
    this.cores.set(chatId, core);

    console.log(`[Corestore] Chat core ready for ${chatId}`);
    console.log(
      `[Corestore] Discovery Key: ${b4a.toString(core.discoveryKey, 'hex')}`,
    );
    console.log(`[Corestore] Public Key: ${b4a.toString(core.key, 'hex')}`);
    console.log(`[Corestore] Writable: ${core.writable}`);
    console.log(`[Corestore] Length: ${core.length}`);

    return core;
  }

  /**
   * Append a message to a chat's Hypercore
   * @param {string} chatId - Chat identifier
   * @param {Object} message - Message object
   * @returns {Promise<number>} - Sequence number of the appended message
   */
  async appendMessage(chatId, message) {
    const core = await this.getChatCore(chatId);

    if (!core.writable) {
      throw new Error('This core is read-only');
    }

    const messageData = {
      ...message,
      timestamp: Date.now(),
      seq: core.length,
    };

    const encoded = b4a.from(JSON.stringify(messageData));
    await core.append(encoded);

    console.log(`[Corestore] Message appended to ${chatId}:`, messageData.seq);
    return messageData.seq;
  }

  /**
   * Get a message by sequence number
   * @param {string} chatId - Chat identifier
   * @param {number} seq - Sequence number
   * @returns {Promise<Object>} - Message object
   */
  async getMessage(chatId, seq) {
    const core = await this.getChatCore(chatId);

    if (seq >= core.length) {
      return null;
    }

    const block = await core.get(seq);
    return JSON.parse(b4a.toString(block));
  }

  /**
   * Get all messages from a chat
   * @param {string} chatId - Chat identifier
   * @param {Object} options - Options for reading messages
   * @returns {Promise<Array>} - Array of messages
   */
  async getAllMessages(chatId, options = {}) {
    const core = await this.getChatCore(chatId);
    const {start = 0, end = core.length} = options;

    const messages = [];

    for (let i = start; i < Math.min(end, core.length); i++) {
      const block = await core.get(i);
      messages.push(JSON.parse(b4a.toString(block)));
    }

    return messages;
  }

  /**
   * Stream messages from a chat in real-time
   * @param {string} chatId - Chat identifier
   * @param {Function} onMessage - Callback for each message
   * @returns {Promise<ReadableStream>}
   */
  async streamMessages(chatId, onMessage) {
    const core = await this.getChatCore(chatId);

    // Start from current length and watch for new appends
    let currentSeq = core.length;

    const stream = core.createReadStream({
      live: true,
      start: currentSeq,
    });

    stream.on('data', (data) => {
      const message = JSON.parse(b4a.toString(data));
      onMessage(message);
    });

    return stream;
  }

  /**
   * Get core info for sharing
   * @param {string} chatId - Chat identifier
   * @returns {Promise<Object>} - Core info including keys
   */
  async getCoreInfo(chatId) {
    const core = await this.getChatCore(chatId);

    return {
      chatId,
      discoveryKey: b4a.toString(core.discoveryKey, 'hex'),
      publicKey: b4a.toString(core.key, 'hex'),
      writable: core.writable,
      length: core.length,
    };
  }

  /**
   * Replicate a core (for syncing with peers)
   * @param {string} chatId - Chat identifier
   * @param {Stream} stream - Replication stream
   */
  async replicateCore(chatId, stream) {
    const core = await this.getChatCore(chatId);
    return core.replicate(stream);
  }

  /**
   * Close a specific chat core
   * @param {string} chatId - Chat identifier
   */
  async closeCore(chatId) {
    const core = this.cores.get(chatId);
    if (core) {
      await core.close();
      this.cores.delete(chatId);
      console.log(`[Corestore] Closed core for ${chatId}`);
    }
  }

  /**
   * Close all cores and the corestore
   */
  async close() {
    for (const [chatId, core] of this.cores.entries()) {
      await core.close();
    }

    if (this.store) {
      await this.store.close();
    }

    this.cores.clear();
    this.ready = false;
    console.log('[Corestore] Closed all cores');
  }

  /**
   * Generate a new key pair for creating a chat with custom keys
   * Uses hypercore-crypto to generate cryptographically secure keys
   * @returns {Object} - {publicKey: Buffer, secretKey: Buffer}
   */
  generateKeyPair() {
    const keyPair = crypto.keyPair();
    console.log('[Corestore] Generated new key pair');
    console.log(
      `[Corestore] Public Key: ${b4a.toString(keyPair.publicKey, 'hex')}`,
    );
    return keyPair;
  }

  /**
   * Create a discovery key (topic hash) from a chat name or identifier
   * Uses hypercore-crypto for consistent hashing
   * @param {string} chatName - Name or identifier for the chat
   * @returns {Buffer} - Discovery key (32-byte hash)
   */
  createDiscoveryKey(chatName) {
    const nameBuffer = b4a.from(chatName);
    const discoveryKey = crypto.discoveryKey(nameBuffer);
    console.log(
      `[Corestore] Discovery key for "${chatName}": ${b4a.toString(discoveryKey, 'hex')}`,
    );
    return discoveryKey;
  }

  /**
   * Verify a signature using hypercore-crypto
   * @param {Buffer} message - Message that was signed
   * @param {Buffer} signature - Signature to verify
   * @param {Buffer} publicKey - Public key of the signer
   * @returns {boolean} - True if signature is valid
   */
  verifySignature(message, signature, publicKey) {
    return crypto.verify(message, signature, publicKey);
  }

  /**
   * Sign a message using a secret key
   * @param {Buffer} message - Message to sign
   * @param {Buffer} secretKey - Secret key for signing
   * @returns {Buffer} - Signature
   */
  signMessage(message, secretKey) {
    return crypto.sign(message, secretKey);
  }

  /**
   * Create a standalone Hypercore (not managed by Corestore)
   * Useful for temporary cores or special use cases
   * @param {string} storagePath - Path for the Hypercore storage
   * @param {Object} options - Hypercore options (key, keyPair, etc.)
   * @returns {Promise<Hypercore>}
   */
  async createStandaloneCore(storagePath, options = {}) {
    const corePath = path.join(this.storagePath, storagePath);
    const core = new Hypercore(corePath, options.key, options);
    await core.ready();

    console.log(`[Corestore] Standalone core created at: ${corePath}`);
    console.log(
      `[Corestore] Discovery Key: ${b4a.toString(core.discoveryKey, 'hex')}`,
    );
    console.log(`[Corestore] Writable: ${core.writable}`);

    return core;
  }

  /**
   * Get storage path for a specific chat
   * @param {string} chatId - Chat identifier
   * @returns {string} - Absolute path to chat storage
   */
  getChatStoragePath(chatId) {
    return path.join(this.storagePath, 'chats', chatId);
  }

  /**
   * Create a chat with a pre-generated key pair
   * @param {string} chatId - Unique identifier for the chat
   * @param {Object} keyPair - Key pair object {publicKey, secretKey}
   * @returns {Promise<Hypercore>}
   */
  async createChatWithKeyPair(chatId, keyPair) {
    if (!this.ready) {
      throw new Error('Corestore not initialized');
    }

    if (this.cores.has(chatId)) {
      throw new Error(`Chat ${chatId} already exists`);
    }

    // Store the key pair for later reference
    this.keyPairs.set(chatId, keyPair);

    // Create core with the specific key pair
    const core = this.store.get({
      key: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    });

    await core.ready();
    this.cores.set(chatId, core);

    console.log(`[Corestore] Created chat ${chatId} with custom key pair`);
    console.log(
      `[Corestore] Discovery Key: ${b4a.toString(core.discoveryKey, 'hex')}`,
    );
    console.log(`[Corestore] Public Key: ${b4a.toString(core.key, 'hex')}`);

    return core;
  }

  /**
   * Get the key pair for a chat (if it was created with a custom key pair)
   * @param {string} chatId - Chat identifier
   * @returns {Object|null} - Key pair or null if not found
   */
  getKeyPair(chatId) {
    return this.keyPairs.get(chatId) || null;
  }

  /**
   * Validate a public key format
   * @param {string|Buffer} key - Public key to validate
   * @returns {boolean} - True if valid
   */
  validatePublicKey(key) {
    try {
      const keyBuffer = typeof key === 'string' ? b4a.from(key, 'hex') : key;
      return keyBuffer.length === 32; // Hypercore public keys are 32 bytes
    } catch (_error) {
      return false;
    }
  }

  /**
   * Convert a hex string to a Buffer (utility for key handling)
   * @param {string} hexString - Hex encoded string
   * @returns {Buffer}
   */
  hexToBuffer(hexString) {
    return b4a.from(hexString, 'hex');
  }

  /**
   * Convert a Buffer to hex string (utility for key sharing)
   * @param {Buffer} buffer - Buffer to convert
   * @returns {string}
   */
  bufferToHex(buffer) {
    return b4a.toString(buffer, 'hex');
  }
}

module.exports = CorestoreManager;

module.exports = CorestoreManager;
