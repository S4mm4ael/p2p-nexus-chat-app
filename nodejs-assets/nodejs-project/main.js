const rn_bridge = require('rn-bridge');

// Node.js runtime is ready
console.log('[Node.js] Runtime initialized');

// Listen for messages from React Native
rn_bridge.channel.on('message', (msg) => {
  console.log('[Node.js] Received message:', msg);

  // Process the message and send response back
  try {
    const response = processMessage(msg);
    rn_bridge.channel.send(response);
  } catch (error) {
    rn_bridge.channel.send({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Process messages from React Native
function processMessage(msg) {
  switch (msg.type) {
    case 'ping':
      return {type: 'pong', timestamp: Date.now()};

    case 'initialize':
      return {type: 'initialized', nodeVersion: process.version};

    case 'p2p-command':
      // Handle P2P networking commands here
      return {type: 'p2p-response', data: 'P2P command processed'};

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
