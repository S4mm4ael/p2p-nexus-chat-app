const CorestoreManager = require('./corestore-manager');
const SwarmManager = require('./swarm-manager');

/**
 * P2PManager - Main orchestrator for P2P chat functionality
 * Combines Corestore and Swarm for complete P2P chat system
 */
class P2PManager {
  constructor(storagePath = './storage') {
    this.corestoreManager = new CorestoreManager(storagePath);
    this.swarmManager = null;
    this.initialized = false;
    this.chats = new Map(); // Map<chatId, ChatInfo>
  }

  /**
   * Initialize the P2P system
   */
  async initialize() {
    try {
      console.log('[P2P] Initializing P2P Manager...');

      // Initialize corestore first
      await this.corestoreManager.initialize();

      // Initialize swarm
      this.swarmManager = new SwarmManager(this.corestoreManager);
      await this.swarmManager.initialize();

      this.initialized = true;
      console.log('[P2P] P2P Manager initialized successfully');

      return {
        success: true,
        message: 'P2P system initialized',
        stats: this.getStats(),
      };
    } catch (error) {
      console.error('[P2P] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Create a new chat
   * @param {string} chatId - Unique chat identifier
   * @param {Object} metadata - Chat metadata (name, description, etc.)
   * @returns {Promise<Object>} - Chat info
   */
  async createChat(chatId, metadata = {}) {
    if (!this.initialized) {
      throw new Error('P2P Manager not initialized');
    }

    // Check if chat already exists
    if (this.chats.has(chatId)) {
      return this.chats.get(chatId);
    }

    try {
      console.log(`[P2P] Creating chat: ${chatId}`);

      // Create hypercore for this chat
      const core = await this.corestoreManager.getChatCore(chatId);

      // Join swarm topic for peer discovery
      const topicInfo = await this.swarmManager.joinTopic(chatId);

      // Store chat info
      const chatInfo = {
        chatId,
        metadata,
        core,
        topic: topicInfo,
        createdAt: Date.now(),
        messageCount: core.length,
      };

      this.chats.set(chatId, chatInfo);

      console.log(`[P2P] Chat created: ${chatId}`);

      return {
        chatId,
        discoveryKey: topicInfo.topicHex,
        publicKey: await this.corestoreManager.getCoreInfo(chatId),
        metadata,
        messageCount: core.length,
      };
    } catch (error) {
      console.error(`[P2P] Failed to create chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Join an existing chat using discovery key
   * @param {string} chatId - Local chat identifier
   * @param {string} discoveryKey - Hex-encoded discovery key
   * @param {Object} metadata - Chat metadata
   * @returns {Promise<Object>} - Chat info
   */
  async joinChat(chatId, discoveryKey, metadata = {}) {
    if (!this.initialized) {
      throw new Error('P2P Manager not initialized');
    }

    try {
      console.log(`[P2P] Joining chat: ${chatId} with key: ${discoveryKey}`);

      // Join swarm topic
      const topicInfo = await this.swarmManager.joinTopic(chatId, discoveryKey);

      // Get or create core (will sync with peers)
      const core = await this.corestoreManager.getChatCore(chatId);

      // Store chat info
      const chatInfo = {
        chatId,
        metadata,
        core,
        topic: topicInfo,
        joinedAt: Date.now(),
        messageCount: core.length,
      };

      this.chats.set(chatId, chatInfo);

      console.log(`[P2P] Joined chat: ${chatId}`);

      return {
        chatId,
        discoveryKey: topicInfo.topicHex,
        metadata,
        messageCount: core.length,
        peers: this.swarmManager.getConnectedPeers(chatId),
      };
    } catch (error) {
      console.error(`[P2P] Failed to join chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Send a message to a chat
   * @param {string} chatId - Chat identifier
   * @param {Object} message - Message object
   * @returns {Promise<Object>} - Sent message with sequence number
   */
  async sendMessage(chatId, message) {
    if (!this.initialized) {
      throw new Error('P2P Manager not initialized');
    }

    if (!this.chats.has(chatId)) {
      throw new Error(`Chat ${chatId} not found`);
    }

    try {
      // Append to hypercore
      const seq = await this.corestoreManager.appendMessage(chatId, message);

      const sentMessage = {
        ...message,
        seq,
        timestamp: Date.now(),
        chatId,
      };

      // Broadcast to connected peers (they'll also get it via replication)
      await this.swarmManager.broadcastMessage(chatId, sentMessage);

      console.log(`[P2P] Message sent to ${chatId}, seq: ${seq}`);

      return sentMessage;
    } catch (error) {
      console.error(`[P2P] Failed to send message to ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Get messages from a chat
   * @param {string} chatId - Chat identifier
   * @param {Object} options - Options (start, end, limit)
   * @returns {Promise<Array>} - Array of messages
   */
  async getMessages(chatId, options = {}) {
    if (!this.initialized) {
      throw new Error('P2P Manager not initialized');
    }

    try {
      const messages = await this.corestoreManager.getAllMessages(
        chatId,
        options,
      );
      console.log(`[P2P] Retrieved ${messages.length} messages from ${chatId}`);
      return messages;
    } catch (error) {
      console.error(`[P2P] Failed to get messages from ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Watch for new messages in a chat
   * @param {string} chatId - Chat identifier
   * @param {Function} callback - Callback for new messages
   * @returns {Promise<Stream>} - Message stream
   */
  async watchMessages(chatId, callback) {
    if (!this.initialized) {
      throw new Error('P2P Manager not initialized');
    }

    try {
      const stream = await this.corestoreManager.streamMessages(
        chatId,
        callback,
      );
      console.log(`[P2P] Started watching messages for ${chatId}`);
      return stream;
    } catch (error) {
      console.error(`[P2P] Failed to watch messages for ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Get connected peers for a chat
   * @param {string} chatId - Chat identifier
   * @returns {Array} - Array of peer info
   */
  getConnectedPeers(chatId) {
    return this.swarmManager.getConnectedPeers(chatId);
  }

  /**
   * Get chat information
   * @param {string} chatId - Chat identifier
   * @returns {Promise<Object>} - Chat information
   */
  async getChatInfo(chatId) {
    const chatInfo = this.chats.get(chatId);

    if (!chatInfo) {
      throw new Error(`Chat ${chatId} not found`);
    }

    const coreInfo = await this.corestoreManager.getCoreInfo(chatId);
    const peers = this.getConnectedPeers(chatId);

    return {
      chatId,
      metadata: chatInfo.metadata,
      messageCount: coreInfo.length,
      discoveryKey: coreInfo.discoveryKey,
      publicKey: coreInfo.publicKey,
      peers: peers.length,
      connectedPeers: peers,
      createdAt: chatInfo.createdAt || chatInfo.joinedAt,
    };
  }

  /**
   * Get system stats
   * @returns {Object} - System statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      chats: this.chats.size,
      swarm: this.swarmManager ? this.swarmManager.getStats() : null,
      corestore: {
        ready: this.corestoreManager.ready,
        cores: this.corestoreManager.cores.size,
      },
    };
  }

  /**
   * Leave a chat
   * @param {string} chatId - Chat identifier
   */
  async leaveChat(chatId) {
    if (!this.chats.has(chatId)) {
      return false;
    }

    try {
      // Leave swarm topic
      await this.swarmManager.leaveTopic(chatId);

      // Close core
      await this.corestoreManager.closeCore(chatId);

      // Remove from chats
      this.chats.delete(chatId);

      console.log(`[P2P] Left chat: ${chatId}`);
      return true;
    } catch (error) {
      console.error(`[P2P] Failed to leave chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Shutdown the P2P system
   */
  async shutdown() {
    console.log('[P2P] Shutting down...');

    try {
      // Close swarm first
      if (this.swarmManager) {
        await this.swarmManager.close();
      }

      // Close all cores
      await this.corestoreManager.close();

      this.chats.clear();
      this.initialized = false;

      console.log('[P2P] Shutdown complete');
    } catch (error) {
      console.error('[P2P] Shutdown error:', error);
      throw error;
    }
  }
}

module.exports = P2PManager;
