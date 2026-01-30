import { useCallback, useState } from 'react';
import { RPCEvent, useNodeJS } from './use-nodejs';

export interface P2PMessage {
  text: string;
  author: string;
  authorId: string;
  timestamp: number;
  seq: number;
}

export interface P2PChatInfo {
  chatId: string;
  discoveryKey: string;
  publicKey: string;
  writable: boolean;
  length: number;
  metadata?: Record<string, any>;
}

export interface P2PPeer {
  remotePublicKey: string;
  type: string;
  topics: number;
}

export interface P2PStats {
  totalChats: number;
  totalPeers: number;
  totalMessages: number;
}

/**
 * High-level hook for P2P chat functionality
 */
export function useP2P() {
  const rpc = useNodeJS();
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  /**
   * Initialize the P2P system
   */
  const initialize = useCallback(async () => {
    try {
      console.log('[P2P] Initializing...');
      const result = await rpc.call('p2p.initialize');
      setIsInitialized(true);
      setInitError(null);
      console.log('[P2P] Initialized successfully', result);
      return result;
    } catch (error) {
      console.error('[P2P] Initialization failed:', error);
      setInitError(error as Error);
      throw error;
    }
  }, [rpc]);

  /**
   * Create a new chat
   */
  const createChat = useCallback(async (
    chatId: string,
    metadata?: Record<string, any>
  ): Promise<P2PChatInfo> => {
    const result = await rpc.call<{ chatInfo: P2PChatInfo }>('p2p.createChat', {
      chatId,
      metadata,
    });
    return result.chatInfo;
  }, [rpc]);

  /**
   * Join an existing chat using a discovery key
   */
  const joinChat = useCallback(async (
    chatId: string,
    discoveryKey: string,
    metadata?: Record<string, any>
  ): Promise<P2PChatInfo> => {
    const result = await rpc.call<{ chatInfo: P2PChatInfo }>('p2p.joinChat', {
      chatId,
      discoveryKey,
      metadata,
    });
    return result.chatInfo;
  }, [rpc]);

  /**
   * Send a message to a chat
   */
  const sendMessage = useCallback(async (
    chatId: string,
    text: string,
    author: string,
    authorId: string
  ): Promise<P2PMessage> => {
    const result = await rpc.call<{ message: P2PMessage }>('p2p.sendMessage', {
      chatId,
      text,
      author,
      authorId,
    });
    return result.message;
  }, [rpc]);

  /**
   * Get messages from a chat
   */
  const getMessages = useCallback(async (
    chatId: string,
    options?: { start?: number; end?: number }
  ): Promise<P2PMessage[]> => {
    const result = await rpc.call<{ messages: P2PMessage[] }>('p2p.getMessages', {
      chatId,
      options,
    });
    return result.messages;
  }, [rpc]);

  /**
   * Watch for new messages in a chat
   */
  const watchMessages = useCallback(async (
    chatId: string,
    onMessage: (message: P2PMessage) => void
  ) => {
    // Subscribe to RPC events for this chat
    const unsubscribe = rpc.on('message.received', (event: RPCEvent) => {
      if (event.data.chatId === chatId) {
        onMessage(event.data.message);
      }
    });

    // Start watching on the Node.js side
    try {
      const result = await rpc.call<{ watcherId: number }>('p2p.watchMessages', {
        chatId,
      });
      console.log('[P2P] Watching messages for chat:', chatId, result.watcherId);

      // Return cleanup function
      return () => {
        unsubscribe();
        rpc.call('p2p.unwatchMessages', {
          chatId,
          watcherId: result.watcherId,
        }).catch(console.error);
      };
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }, [rpc]);

  /**
   * Get chat information
   */
  const getChatInfo = useCallback(async (chatId: string): Promise<P2PChatInfo> => {
    const result = await rpc.call<{ info: P2PChatInfo }>('p2p.getChatInfo', {
      chatId,
    });
    return result.info;
  }, [rpc]);

  /**
   * Get connected peers for a chat
   */
  const getPeers = useCallback(async (chatId: string): Promise<P2PPeer[]> => {
    const result = await rpc.call<{ peers: P2PPeer[] }>('p2p.getPeers', {
      chatId,
    });
    return result.peers;
  }, [rpc]);

  /**
   * Get P2P system statistics
   */
  const getStats = useCallback(async (): Promise<P2PStats> => {
    const result = await rpc.call<{ stats: P2PStats }>('p2p.getStats');
    return result.stats;
  }, [rpc]);

  /**
   * Leave a chat
   */
  const leaveChat = useCallback(async (chatId: string): Promise<boolean> => {
    const result = await rpc.call<{ success: boolean }>('p2p.leaveChat', {
      chatId,
    });
    return result.success;
  }, [rpc]);

  /**
   * Shutdown the P2P system
   */
  const shutdown = useCallback(async (): Promise<void> => {
    await rpc.call('p2p.shutdown');
    setIsInitialized(false);
  }, [rpc]);

  /**
   * Subscribe to message sent events
   */
  const onMessageSent = useCallback((
    callback: (data: { chatId: string; message: P2PMessage }) => void
  ) => {
    return rpc.on('message.sent', (event: RPCEvent) => {
      callback(event.data);
    });
  }, [rpc]);

  /**
   * Subscribe to all message received events (across all chats)
   */
  const onMessageReceived = useCallback((
    callback: (data: { chatId: string; message: P2PMessage }) => void
  ) => {
    return rpc.on('message.received', (event: RPCEvent) => {
      callback(event.data);
    });
  }, [rpc]);

  return {
    // State
    isReady: rpc.isReady,
    isInitialized,
    initError,
    lastEvent: rpc.lastEvent,

    // Methods
    initialize,
    createChat,
    joinChat,
    sendMessage,
    getMessages,
    watchMessages,
    getChatInfo,
    getPeers,
    getStats,
    leaveChat,
    shutdown,

    // Event subscriptions
    onMessageSent,
    onMessageReceived,

    // Raw RPC access
    rpc,
  };
}
