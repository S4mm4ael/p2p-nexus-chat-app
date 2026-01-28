import nodejs from 'nodejs-mobile-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface NodeMessage {
  type: string;
  [key: string]: any;
}

export interface NodeJSBridge {
  sendMessage: (message: NodeMessage) => void;
  isReady: boolean;
  lastMessage: NodeMessage | null;
}

export function useNodeJS(): NodeJSBridge {
  const [isReady, setIsReady] = useState(false);
  const [lastMessage, setLastMessage] = useState<NodeMessage | null>(null);
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    // Start Node.js runtime
    console.log('[React Native] Starting Node.js runtime...');
    nodejs.start('main.js');

    // Set up message listener
    listenerRef.current = nodejs.channel.addListener(
      'message',
      (msg: any) => {
        console.log('[React Native] Received from Node.js:', msg);
        setLastMessage(msg);

        // Check if Node.js is ready
        if (msg.type === 'node-ready') {
          setIsReady(true);
          console.log('[React Native] Node.js runtime is ready!');
        }
      }
    );

    // Cleanup
    return () => {
      if (listenerRef.current) {
        listenerRef.current.remove();
      }
    };
  }, []);

  const sendMessage = useCallback((message: NodeMessage) => {
    if (!isReady) {
      console.warn('[React Native] Node.js runtime not ready yet');
      return;
    }
    
    console.log('[React Native] Sending to Node.js:', message);
    nodejs.channel.send(message);
  }, [isReady]);

  return {
    sendMessage,
    isReady,
    lastMessage,
  };
}
