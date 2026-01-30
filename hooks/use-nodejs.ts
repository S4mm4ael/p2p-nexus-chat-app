import nodejs from 'nodejs-mobile-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RPCRequest {
  method: string;
  params?: Record<string, any>;
}

export interface RPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    stack?: string;
  };
}

export interface RPCEvent {
  eventType: string;
  timestamp: number;
  data: any;
}

type EventCallback = (event: RPCEvent) => void;
type RequestCallback = (response: RPCResponse) => void;

export interface NodeJSRPC {
  call: <T = any>(method: string, params?: Record<string, any>) => Promise<T>;
  isReady: boolean;
  on: (eventType: string, callback: EventCallback) => () => void;
  lastEvent: RPCEvent | null;
}

export function useNodeJS(): NodeJSRPC {
  const [isReady, setIsReady] = useState(false);
  const [lastEvent, setLastEvent] = useState<RPCEvent | null>(null);
  
  const listenerRef = useRef<any>(null);
  const requestIdCounter = useRef(0);
  const pendingRequestsRef = useRef<Map<string, RequestCallback>>(new Map());
  const eventListenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());

  /**
   * Handle RPC response from Node.js
   */
  const handleRPCResponse = useCallback((msg: any) => {
    const { requestId, success, data, error } = msg;
    
    const callback = pendingRequestsRef.current.get(requestId);
    if (callback) {
      callback({ success, data, error });
      pendingRequestsRef.current.delete(requestId);
    } else {
      console.warn('[RPC] Received response for unknown request:', requestId);
    }
  }, []);

  /**
   * Handle RPC event from Node.js
   */
  const handleRPCEvent = useCallback((msg: RPCEvent) => {
    const { eventType } = msg;
    
    setLastEvent(msg);

    // Special handling for node.ready event
    if (eventType === 'node.ready') {
      setIsReady(true);
      console.log('[RPC] Node.js runtime is ready!', msg.data);
    }

    // Call all registered listeners for this event type
    const listeners = eventListenersRef.current.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(msg);
        } catch (error) {
          console.error('[RPC] Error in event listener:', error);
        }
      });
    }

    // Also call wildcard listeners
    const wildcardListeners = eventListenersRef.current.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(callback => {
        try {
          callback(msg);
        } catch (error) {
          console.error('[RPC] Error in wildcard listener:', error);
        }
      });
    }
  }, []);

  useEffect(() => {
    // Start Node.js runtime
    console.log('[RPC] Starting Node.js runtime...');
    console.log('[RPC] Calling nodejs.start("main.js")...');
    
    try {
      nodejs.start('main.js');
      console.log('[RPC] nodejs.start() completed successfully');
    } catch (error) {
      console.error('[RPC] Error starting Node.js:', error);
    }

    // Capture refs for cleanup
    const pendingRequests = pendingRequestsRef.current;
    const eventListeners = eventListenersRef.current;

    // Set up message listener
    console.log('[RPC] Setting up message listener...');
    listenerRef.current = nodejs.channel.addListener(
      'message',
      (msg: any) => {
        console.log('[RPC] ✅ Received from Node.js:', JSON.stringify(msg, null, 2));

        if (msg.type === 'rpc-response') {
          console.log('[RPC] Handling RPC response');
          // Handle RPC response
          handleRPCResponse(msg);
        } else if (msg.type === 'rpc-event') {
          console.log('[RPC] Handling RPC event:', msg.eventType);
          // Handle RPC event
          handleRPCEvent(msg);
        } else if (msg.type === 'node-ready') {
          // COMPATIBILITY: Handle old format (from cached build)
          console.log('[RPC] Handling legacy node-ready event');
          handleRPCEvent({
            eventType: 'node.ready',
            timestamp: Date.now(),
            data: {
              nodeVersion: msg.nodeVersion,
              platform: msg.platform,
              arch: msg.arch,
            },
          });
        } else {
          console.warn('[RPC] Unknown message type:', msg.type);
        }
      }
    );
    
    console.log('[RPC] Message listener set up successfully');

    // Cleanup
    return () => {
      if (listenerRef.current) {
        listenerRef.current.remove();
      }
      pendingRequests.clear();
      eventListeners.clear();
    };
  }, [handleRPCResponse, handleRPCEvent]);

  /**
   * Make an RPC call to Node.js
   */
  const call = useCallback(<T = any>(
    method: string,
    params?: Record<string, any>
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!isReady) {
        reject(new Error('Node.js runtime not ready yet'));
        return;
      }

      const requestId = `rpc-${++requestIdCounter.current}-${Date.now()}`;

      // Store the callback for this request
      pendingRequestsRef.current.set(requestId, (response: RPCResponse<T>) => {
        if (response.success) {
          resolve(response.data as T);
        } else {
          const error = new Error(response.error?.message || 'RPC call failed');
          (error as any).code = response.error?.code;
          (error as any).remoteStack = response.error?.stack;
          reject(error);
        }
      });

      // Send the request
      const request = {
        requestId,
        method,
        params: params || {},
        timestamp: Date.now(),
      };

      console.log('[RPC] Calling method:', method, params);
      nodejs.channel.send(request);

      // Set timeout for the request
      setTimeout(() => {
        if (pendingRequestsRef.current.has(requestId)) {
          pendingRequestsRef.current.delete(requestId);
          reject(new Error(`RPC call timeout: ${method}`));
        }
      }, 30000); // 30 second timeout
    });
  }, [isReady]);

  /**
   * Subscribe to RPC events
   */
  const on = useCallback((eventType: string, callback: EventCallback) => {
    if (!eventListenersRef.current.has(eventType)) {
      eventListenersRef.current.set(eventType, new Set());
    }

    eventListenersRef.current.get(eventType)!.add(callback);
    console.log('[RPC] Event listener registered for:', eventType);

    // Return unsubscribe function
    return () => {
      const listeners = eventListenersRef.current.get(eventType);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          eventListenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  return {
    call,
    isReady,
    on,
    lastEvent,
  };
}
