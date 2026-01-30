/**
 * Test script for P2P Backend
 * Run this to verify the backend functionality
 */

const P2PManager = require('./backend/p2p-manager');
const path = require('path');

async function runTests() {
  console.log('=== P2P Backend Test Suite ===\n');

  const testStorage = path.join(__dirname, 'test-storage');
  const p2p = new P2PManager(testStorage);

  try {
    // Test 1: Initialize
    console.log('Test 1: Initialize P2P System');
    const initResult = await p2p.initialize();
    console.log('✓ Initialized:', initResult);
    console.log('');

    // Test 2: Create Chat
    console.log('Test 2: Create Chat');
    const chatInfo = await p2p.createChat('test-chat-001', {
      name: 'Test Chat Room',
      description: 'A test chat for development',
    });
    console.log('✓ Chat created:', chatInfo);
    console.log('Discovery Key:', chatInfo.discoveryKey);
    console.log('');

    // Test 3: Send Messages
    console.log('Test 3: Send Messages');
    for (let i = 1; i <= 5; i++) {
      const message = await p2p.sendMessage('test-chat-001', {
        text: `Test message ${i}`,
        author: 'Test User',
        authorId: 'test-user-123',
      });
      console.log(`✓ Message ${i} sent, seq: ${message.seq}`);
    }
    console.log('');

    // Test 4: Get Messages
    console.log('Test 4: Get Messages');
    const messages = await p2p.getMessages('test-chat-001');
    console.log(`✓ Retrieved ${messages.length} messages`);
    messages.forEach((msg) => {
      console.log(`  [${msg.seq}] ${msg.author}: ${msg.text}`);
    });
    console.log('');

    // Test 5: Get Chat Info
    console.log('Test 5: Get Chat Info');
    const info = await p2p.getChatInfo('test-chat-001');
    console.log('✓ Chat Info:', info);
    console.log('');

    // Test 6: Get Stats
    console.log('Test 6: Get System Stats');
    const stats = p2p.getStats();
    console.log('✓ System Stats:', JSON.stringify(stats, null, 2));
    console.log('');

    // Test 7: Watch Messages (simulated)
    console.log('Test 7: Watch Messages (5 second test)');
    let watchCount = 0;
    const stream = await p2p.watchMessages('test-chat-001', (message) => {
      watchCount++;
      console.log(`✓ New message received: ${message.text}`);
    });

    // Send a message while watching
    setTimeout(async () => {
      await p2p.sendMessage('test-chat-001', {
        text: 'Live message while watching!',
        author: 'Test User',
        authorId: 'test-user-123',
      });
    }, 2000);

    // Wait 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));
    stream.destroy();
    console.log(`✓ Watched ${watchCount} new messages`);
    console.log('');

    // Test 8: Second Chat
    console.log('Test 8: Create Second Chat');
    const chat2 = await p2p.createChat('test-chat-002', {
      name: 'Second Test Chat',
    });
    console.log('✓ Second chat created:', chat2.chatId);
    console.log('');

    // Test 9: Leave Chat
    console.log('Test 9: Leave Chat');
    const left = await p2p.leaveChat('test-chat-002');
    console.log('✓ Left chat:', left);
    console.log('');

    // Test 10: Shutdown
    console.log('Test 10: Shutdown');
    await p2p.shutdown();
    console.log('✓ Shutdown complete');
    console.log('');

    console.log('=== All Tests Passed! ===');
    console.log(
      '\nNOTE: To test P2P connectivity, run this script on two different',
    );
    console.log(
      'machines or processes and use the discovery key to join the same chat.',
    );
    console.log('\nDiscovery Key from this test:', chatInfo.discoveryKey);
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    await p2p.shutdown();
    process.exit(1);
  }

  process.exit(0);
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = {runTests};
