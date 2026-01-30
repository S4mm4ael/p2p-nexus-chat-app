import { P2PMessage, useP2P } from '@/hooks/use-p2p';
import React, { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export function P2PChatDemo() {
  const p2p = useP2P();
  const [chatId] = useState('demo-chat');
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [username] = useState(`User-${Math.random().toString(36).substr(2, 4)}`);

  useEffect(() => {
    if (!p2p.isReady || p2p.isInitialized) return;

    // Auto-initialize P2P when ready
    const init = async () => {
      try {
        await p2p.initialize();
      } catch (error) {
        console.error('Failed to initialize P2P:', error);
      }
    };

    init();
  }, [p2p]);

  // Subscribe to message received events
  useEffect(() => {
    const unsubscribe = p2p.onMessageReceived((data) => {
      console.log('New message received:', data);
      if (data.chatId === chatId) {
        setMessages(prev => [...prev, data.message]);
      }
    });

    return unsubscribe;
  }, [p2p, chatId]);

  const handleCreateChat = async () => {
    try {
      const info = await p2p.createChat(chatId, {
        name: 'Demo Chat',
        createdBy: username,
      });
      setChatInfo(info);
      Alert.alert('Success', `Chat created!\n\nShare this key:\n${info.discoveryKey}`);
      
      // Start watching for messages
      await p2p.watchMessages(chatId, (message) => {
        console.log('Received message via watcher:', message);
      });

      // Load existing messages
      const msgs = await p2p.getMessages(chatId);
      setMessages(msgs);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleJoinChat = async () => {
    Alert.prompt(
      'Join Chat',
      'Enter discovery key:',
      async (key) => {
        try {
          const info = await p2p.joinChat(chatId, key, {
            joinedBy: username,
          });
          setChatInfo(info);
          Alert.alert('Success', 'Joined chat!');

          // Start watching for messages
          await p2p.watchMessages(chatId, (message) => {
            console.log('Received message via watcher:', message);
          });

          // Load existing messages
          const msgs = await p2p.getMessages(chatId);
          setMessages(msgs);
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
      }
    );
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    try {
      await p2p.sendMessage(chatId, messageText, username, username);
      setMessageText('');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleGetStats = async () => {
    try {
      const stats = await p2p.getStats();
      const peers = await p2p.getPeers(chatId);
      Alert.alert(
        'Stats',
        `Chats: ${stats.totalChats}\nPeers: ${peers.length}\nMessages: ${stats.totalMessages}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>P2P Chat RPC Bridge Demo</Text>

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Node.js: {p2p.isReady ? '✅ Ready' : '⏳ Starting...'}
        </Text>
        <Text style={styles.statusText}>
          P2P: {p2p.isInitialized ? '✅ Initialized' : '⏳ Not initialized'}
        </Text>
      </View>

      {chatInfo && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoLabel}>Chat ID: {chatInfo.chatId}</Text>
          <Text style={styles.infoLabel}>Messages: {chatInfo.length}</Text>
          <Text style={styles.infoLabel}>Writable: {chatInfo.writable ? 'Yes' : 'No'}</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Button 
          title="Create Chat" 
          onPress={handleCreateChat}
          disabled={!p2p.isInitialized}
        />
        <Button 
          title="Join Chat" 
          onPress={handleJoinChat}
          disabled={!p2p.isInitialized}
        />
        <Button 
          title="Stats" 
          onPress={handleGetStats}
          disabled={!p2p.isInitialized}
        />
      </View>

      <ScrollView style={styles.messagesContainer}>
        {messages.map((msg, index) => (
          <View key={index} style={styles.message}>
            <Text style={styles.messageAuthor}>{msg.author}:</Text>
            <Text style={styles.messageText}>{msg.text}</Text>
            <Text style={styles.messageTime}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          editable={p2p.isInitialized && !!chatInfo}
        />
        <Button 
          title="Send" 
          onPress={handleSendMessage}
          disabled={!p2p.isInitialized || !chatInfo || !messageText.trim()}
        />
      </View>

      {p2p.lastEvent && (
        <View style={styles.eventContainer}>
          <Text style={styles.eventText}>
            Last Event: {p2p.lastEvent.eventType}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusContainer: {
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    marginVertical: 2,
  },
  infoContainer: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 12,
    marginVertical: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  messagesContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  message: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  messageAuthor: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  messageText: {
    fontSize: 14,
    marginVertical: 4,
  },
  messageTime: {
    fontSize: 10,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  eventContainer: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#e3f2fd',
    borderRadius: 4,
  },
  eventText: {
    fontSize: 10,
    color: '#1976d2',
  },
});
