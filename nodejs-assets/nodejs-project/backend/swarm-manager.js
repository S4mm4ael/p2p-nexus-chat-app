const Hyperswarm = require('hyperswarm');
const crypto = require('hypercore-crypto');
const b4a = require('b4a');

/**
 * SwarmManager - Manages P2P connections and peer discovery via Hyperswarm
 * Uses topic hashes to discover peers for specific chats
 */
class SwarmManager {
  constructor(corestoreManager) {
    this.swarm = null;
    this.corestoreManager = corestoreManager;
    this.topics = new Map(); // Map<topicHex, { chatId, connections }>
    this.peers = new Map(); // Map<peerKey, PeerInfo>
    this.ready = false;
  }

  /**
   * Initialize the swarm
   */
  async initialize() {
    try {
      this.swarm = new Hyperswarm();

      // Set up event listeners
      this.setupEventListeners();

      await this.swarm.listen();
      this.ready = true;

      console.log('[Swarm] Initialized and listening');
      console.log('[Swarm] Listening on:', this.swarm.address());

      return true;
    } catch (error) {
      console.error('[Swarm] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Set up swarm event listeners
   */
  setupEventListeners() {
    this.swarm.on('connection', (conn, info) => {
      this.handleConnection(conn, info);
    });

    this.swarm.on('error', (error) => {
      console.error('[Swarm] Error:', error);
    });
  }

  /**
   * Handle new peer connection
   * @param {Stream} conn - Connection stream
   * @param {Object} info - Connection info
   */
  handleConnection(conn, info) {
    const peerKey = b4a.toString(info.publicKey, 'hex');

    console.log('[Swarm] New connection');
    console.log('[Swarm] Peer:', peerKey);
    console.log('[Swarm] Client:', info.client);
    console.log(
      '[Swarm] Topics:',
      info.topics?.map((t) => b4a.toString(t, 'hex')),
    );

    // Store peer info
    this.peers.set(peerKey, {
      publicKey: info.publicKey,
      conn,
      client: info.client,
      connectedAt: Date.now(),
    });

    // Set up connection event handlers
    conn.on('error', (error) => {
      console.error(`[Swarm] Connection error with ${peerKey}:`, error);
    });

    conn.on('close', () => {
      console.log(`[Swarm] Connection closed with ${peerKey}`);
      this.peers.delete(peerKey);
    });

    // Find which chat this connection is for
    if (info.topics && info.topics.length > 0) {
      for (const topic of info.topics) {
        const topicHex = b4a.toString(topic, 'hex');
        const topicInfo = this.topics.get(topicHex);

        if (topicInfo) {
          console.log(
            `[Swarm] Peer ${peerKey} joined chat: ${topicInfo.chatId}`,
          );
          topicInfo.connections.add(peerKey);

          // Replicate the core with this peer
          this.replicateCoreWithPeer(topicInfo.chatId, conn);
        }
      }
    }
  }

  /**
   * Replicate a chat's core with a peer
   * @param {string} chatId - Chat identifier
   * @param {Stream} conn - Connection stream
   */
  async replicateCoreWithPeer(chatId, conn) {
    try {
      const core = await this.corestoreManager.getChatCore(chatId);
      const replicationStream = core.replicate(conn);

      console.log(`[Swarm] Started replication for chat ${chatId}`);

      replicationStream.on('error', (error) => {
        console.error(`[Swarm] Replication error for ${chatId}:`, error);
      });

      replicationStream.on('end', () => {
        console.log(`[Swarm] Replication ended for ${chatId}`);
      });
    } catch (error) {
      console.error(`[Swarm] Failed to replicate core for ${chatId}:`, error);
    }
  }

  /**
   * Join a chat topic for peer discovery
   * @param {string} chatId - Chat identifier
   * @param {string} [topicString] - Optional topic string (defaults to chatId)
   * @returns {Promise<Object>} - Topic info
   */
  async joinTopic(chatId, topicString = null) {
    if (!this.ready) {
      throw new Error('Swarm not initialized');
    }

    // Generate topic hash from string
    const topicStr = topicString || chatId;
    const topic = crypto.hash(b4a.from(topicStr));
    const topicHex = b4a.toString(topic, 'hex');

    // Check if already joined
    if (this.topics.has(topicHex)) {
      console.log(`[Swarm] Already joined topic for ${chatId}`);
      return this.topics.get(topicHex);
    }

    // Join the topic for discovery
    const discovery = this.swarm.join(topic, {
      server: true, // Accept connections
      client: true, // Make connections
    });

    await discovery.flushed(); // Wait for DHT announcement

    const topicInfo = {
      chatId,
      topic,
      topicHex,
      topicString: topicStr,
      discovery,
      connections: new Set(),
      joinedAt: Date.now(),
    };

    this.topics.set(topicHex, topicInfo);

    console.log(`[Swarm] Joined topic for chat: ${chatId}`);
    console.log(`[Swarm] Topic hash: ${topicHex}`);
    console.log(`[Swarm] Announced on DHT`);

    return topicInfo;
  }

  /**
   * Leave a chat topic
   * @param {string} chatId - Chat identifier
   */
  async leaveTopic(chatId) {
    // Find topic by chatId
    for (const [topicHex, topicInfo] of this.topics.entries()) {
      if (topicInfo.chatId === chatId) {
        await topicInfo.discovery.destroy();
        this.topics.delete(topicHex);
        console.log(`[Swarm] Left topic for chat: ${chatId}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get connected peers for a chat
   * @param {string} chatId - Chat identifier
   * @returns {Array} - Array of peer info
   */
  getConnectedPeers(chatId) {
    const peers = [];

    for (const [topicHex, topicInfo] of this.topics.entries()) {
      if (topicInfo.chatId === chatId) {
        for (const peerKey of topicInfo.connections) {
          const peer = this.peers.get(peerKey);
          if (peer) {
            peers.push({
              publicKey: peerKey,
              connectedAt: peer.connectedAt,
              client: peer.client,
            });
          }
        }
      }
    }

    return peers;
  }

  /**
   * Get swarm stats
   * @returns {Object} - Swarm statistics
   */
  getStats() {
    return {
      ready: this.ready,
      topics: this.topics.size,
      peers: this.peers.size,
      connections: this.swarm?.connections?.size || 0,
      address: this.ready ? this.swarm.address() : null,
    };
  }

  /**
   * Broadcast a message to all peers in a chat
   * @param {string} chatId - Chat identifier
   * @param {Object} message - Message to broadcast
   */
  async broadcastMessage(chatId, message) {
    const peers = this.getConnectedPeers(chatId);

    const messageData = {
      type: 'chat-message',
      chatId,
      message,
      timestamp: Date.now(),
    };

    const encoded = b4a.from(JSON.stringify(messageData));

    for (const peer of peers) {
      const peerInfo = this.peers.get(peer.publicKey);
      if (peerInfo && peerInfo.conn) {
        try {
          peerInfo.conn.write(encoded);
          console.log(`[Swarm] Broadcast message to peer: ${peer.publicKey}`);
        } catch (error) {
          console.error(
            `[Swarm] Failed to broadcast to ${peer.publicKey}:`,
            error,
          );
        }
      }
    }
  }

  /**
   * Close the swarm and all connections
   */
  async close() {
    if (this.swarm) {
      // Leave all topics
      for (const topicInfo of this.topics.values()) {
        await topicInfo.discovery.destroy();
      }

      // Close swarm
      await this.swarm.destroy();

      this.topics.clear();
      this.peers.clear();
      this.ready = false;

      console.log('[Swarm] Closed all connections');
    }
  }
}

module.exports = SwarmManager;
