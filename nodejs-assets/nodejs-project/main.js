const rn_bridge = require('rn-bridge');
const P2PManager = require('./backend/p2p-manager');
const path = require('path');

// Initialize P2P Manager
const storagePath = path.join(process.cwd(), 'p2p-storage');
const p2pManager = new P2PManager(storagePath);
let p2pInitialized = false;

// RPC Bridge State
const messageWatchers = new Map(); // Map<chatId, Set<watcherId>>
let watcherIdCounter = 0;

// Node.js runtime is ready
console.log('[Node.js] RPC Bridge initialized');
console.log('[Node.js] Storage path:', storagePath);

/**
 * Send an RPC response back to React Native
 * @param {string} requestId - The request ID to match the response
 * @param {Object} data - Response data
 * @param {Error} error - Optional error object
 */
function sendRPCResponse(requestId, data = null, error = null) {
  const response = {
    type: 'rpc-response',
    requestId,
    timestamp: Date.now(),
  };

  if (error) {
    response.success = false;
    response.error = {
      message: error.message,
      stack: error.stack,
      code: error.code || 'UNKNOWN_ERROR',
    };
  } else {
    response.success = true;
    response.data = data;
  }

  rn_bridge.channel.send(response);
  console.log('[RPC] Response sent:', requestId);
}

/**
 * Send an RPC event to React Native (not tied to a specific request)
 * @param {string} eventType - Type of event
 * @param {Object} data - Event data
 */
function sendRPCEvent(eventType, data) {
  const event = {
    type: 'rpc-event',
    eventType,
    timestamp: Date.now(),
    data,
  };

  rn_bridge.channel.send(event);
  console.log('[RPC] Event sent:', eventType);
}

// Listen for messages from React Native
rn_bridge.channel.on('message', async (msg) => {
  console.log('[RPC] Received message:', msg);

  // All RPC calls should have a requestId for request-response matching
  const requestId = msg.requestId || `auto-${Date.now()}`;

  // Process the message and send response back
  try {
    const response = await processMessage(msg);
    sendRPCResponse(requestId, response);
  } catch (error) {
    console.error('[RPC] Error processing message:', error);
    sendRPCResponse(requestId, null, error);
  }
});

// Process messages from React Native
async function processMessage(msg) {
  const {method, params = {}} = msg;

  switch (method) {
    case 'ping':
      return {pong: true, timestamp: Date.now()};

    case 'getStatus':
      return {
        nodeVersion: process.version,
        p2pInitialized,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
      };

    case 'p2p.initialize':
      if (!p2pInitialized) {
        const result = await p2pManager.initialize();
        p2pInitialized = true;
        return {initialized: true, ...result};
      }
      return {initialized: true, message: 'Already initialized'};

    case 'p2p.createChat':
      const chatInfo = await p2pManager.createChat(
        params.chatId,
        params.metadata || {},
      );
      return {chatInfo};

    case 'p2p.joinChat':
      const joinedChat = await p2pManager.joinChat(
        params.chatId,
        params.discoveryKey,
        params.metadata || {},
      );
      return {chatInfo: joinedChat};

    case 'p2p.sendMessage':
      const sentMessage = await p2pManager.sendMessage(params.chatId, {
        text: params.text,
        author: params.author,
        authorId: params.authorId,
      });

      // Emit event for the sent message
      sendRPCEvent('message.sent', {
        chatId: params.chatId,
        message: sentMessage,
      });

      return {message: sentMessage};

    case 'p2p.getMessages':
      const messages = await p2pManager.getMessages(
        params.chatId,
        params.options || {},
      );
      return {chatId: params.chatId, messages};

    case 'p2p.watchMessages':
      // Subscribe to new messages in a chat
      const watcherId = ++watcherIdCounter;
      const {chatId} = params;

      if (!messageWatchers.has(chatId)) {
        messageWatchers.set(chatId, new Set());

        // Set up the watcher for this chat
        await p2pManager.watchMessages(chatId, (message) => {
          sendRPCEvent('message.received', {
            chatId,
            message,
            watcherId,
          });
        });
      }

      messageWatchers.get(chatId).add(watcherId);
      console.log(`[RPC] Watcher ${watcherId} added for chat ${chatId}`);

      return {watcherId, chatId};

    case 'p2p.unwatchMessages':
      const unwatchChatId = params.chatId;
      const unwatcherId = params.watcherId;

      if (messageWatchers.has(unwatchChatId)) {
        const watchers = messageWatchers.get(unwatchChatId);
        watchers.delete(unwatcherId);

        if (watchers.size === 0) {
          messageWatchers.delete(unwatchChatId);
          // Note: P2PManager doesn't have unwatch method yet
          console.log(`[RPC] All watchers removed for chat ${unwatchChatId}`);
        }
      }

      return {success: true, watcherId: unwatcherId};

    case 'p2p.getChatInfo':
      const info = await p2pManager.getChatInfo(params.chatId);
      return {info};

    case 'p2p.getPeers':
      const peers = p2pManager.getConnectedPeers(params.chatId);
      return {chatId: params.chatId, peers};

    case 'p2p.getStats':
      const stats = p2pManager.getStats();
      return {stats};

    case 'p2p.leaveChat':
      const left = await p2pManager.leaveChat(params.chatId);

      // Clean up watchers for this chat
      if (messageWatchers.has(params.chatId)) {
        messageWatchers.delete(params.chatId);
      }

      return {chatId: params.chatId, success: left};

    case 'p2p.shutdown':
      await p2pManager.shutdown();
      p2pInitialized = false;
      messageWatchers.clear();
      return {success: true};

    default:
      throw new Error(`Unknown RPC method: ${method}`);
  }
}

// Send initialization message to React Native
sendRPCEvent('node.ready', {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  p2pInitialized,
});

console.log('[RPC] Ready to receive RPC calls');

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('[Node.js] Received SIGTERM, shutting down...');
  if (p2pInitialized) {
    await p2pManager.shutdown();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Node.js] Received SIGINT, shutting down...');
  if (p2pInitialized) {
    await p2pManager.shutdown();
  }
  process.exit(0);
});
