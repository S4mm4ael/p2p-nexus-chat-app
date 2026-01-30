const rn_bridge = require('rn-bridge');
const P2PManager = require('./backend/p2p-manager');
const path = require('path');

// Initialize P2P Manager
const storagePath = path.join(process.cwd(), 'p2p-storage');
const p2pManager = new P2PManager(storagePath);
let p2pInitialized = false;

// Node.js runtime is ready
console.log('[Node.js] Runtime initialized');
console.log('[Node.js] Storage path:', storagePath);

// Listen for messages from React Native
rn_bridge.channel.on('message', async (msg) => {
  console.log('[Node.js] Received message:', msg);

  // Process the message and send response back
  try {
    const response = await processMessage(msg);
    rn_bridge.channel.send(response);
  } catch (error) {
    rn_bridge.channel.send({
      type: 'error',
      requestType: msg.type,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Process messages from React Native
async function processMessage(msg) {
  switch (msg.type) {
    case 'ping':
      return {type: 'pong', timestamp: Date.now()};

    case 'initialize':
      return {
        type: 'initialized',
        nodeVersion: process.version,
        p2pReady: p2pInitialized,
      };

    case 'p2p-init':
      // Initialize P2P system
      if (!p2pInitialized) {
        const result = await p2pManager.initialize();
        p2pInitialized = true;
        return {type: 'p2p-initialized', ...result};
      }
      return {type: 'p2p-initialized', message: 'Already initialized'};

    case 'p2p-create-chat':
      // Create a new chat
      const chatInfo = await p2pManager.createChat(
        msg.chatId,
        msg.metadata || {},
      );
      return {type: 'chat-created', chatInfo};

    case 'p2p-join-chat':
      // Join an existing chat
      const joinedChat = await p2pManager.joinChat(
        msg.chatId,
        msg.discoveryKey,
        msg.metadata || {},
      );
      return {type: 'chat-joined', chatInfo: joinedChat};

    case 'p2p-send-message':
      // Send a message to a chat
      const sentMessage = await p2pManager.sendMessage(msg.chatId, {
        text: msg.text,
        author: msg.author,
        authorId: msg.authorId,
      });
      return {type: 'message-sent', message: sentMessage};

    case 'p2p-get-messages':
      // Get messages from a chat
      const messages = await p2pManager.getMessages(
        msg.chatId,
        msg.options || {},
      );
      return {type: 'messages', chatId: msg.chatId, messages};

    case 'p2p-get-chat-info':
      // Get chat information
      const info = await p2pManager.getChatInfo(msg.chatId);
      return {type: 'chat-info', info};

    case 'p2p-get-peers':
      // Get connected peers for a chat
      const peers = p2pManager.getConnectedPeers(msg.chatId);
      return {type: 'peers', chatId: msg.chatId, peers};

    case 'p2p-get-stats':
      // Get system stats
      const stats = p2pManager.getStats();
      return {type: 'stats', stats};

    case 'p2p-leave-chat':
      // Leave a chat
      const left = await p2pManager.leaveChat(msg.chatId);
      return {type: 'chat-left', chatId: msg.chatId, success: left};

    case 'p2p-shutdown':
      // Shutdown P2P system
      await p2pManager.shutdown();
      p2pInitialized = false;
      return {type: 'p2p-shutdown', success: true};

    default:
      return {type: 'unknown', message: 'Unknown command type'};
  }
}

// Send initialization message to React Native
rn_bridge.channel.send({
  type: 'node-ready',
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
});

console.log('[Node.js] Ready to receive messages');

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
