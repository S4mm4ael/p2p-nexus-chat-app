import { useNodeJS } from '@/hooks/use-nodejs';
import React, { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

export function NodeJSStatus() {
  const rpc = useNodeJS();
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<any>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log('[Status]', message);
  };

  useEffect(() => {
    addLog('Component mounted');
    addLog(`RPC isReady: ${rpc.isReady}`);
  }, [rpc.isReady]);

  useEffect(() => {
    if (rpc.isReady) {
      addLog('✅ Node.js is READY!');
    } else {
      addLog('⏳ Waiting for Node.js...');
    }
  }, [rpc.isReady]);

  useEffect(() => {
    if (rpc.lastEvent) {
      addLog(`Event received: ${rpc.lastEvent.eventType}`);
    }
  }, [rpc.lastEvent]);

  const handlePing = async () => {
    try {
      addLog('Sending ping...');
      const result = await rpc.call('ping');
      addLog(`Ping response: ${JSON.stringify(result)}`);
    } catch (error: any) {
      addLog(`Ping error: ${error.message}`);
    }
  };

  const handleGetStatus = async () => {
    try {
      addLog('Getting status...');
      const result = await rpc.call('getStatus');
      setStatus(result);
      addLog(`Status received: ${JSON.stringify(result)}`);
    } catch (error: any) {
      addLog(`Status error: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Node.js Runtime Status</Text>
      
      <View style={styles.statusBox}>
        <Text style={styles.statusLabel}>Is Ready:</Text>
        <Text style={[styles.statusValue, rpc.isReady ? styles.ready : styles.notReady]}>
          {rpc.isReady ? '✅ YES' : '❌ NO'}
        </Text>
      </View>

      {rpc.lastEvent && (
        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Last Event:</Text>
          <Text style={styles.statusValue}>{rpc.lastEvent.eventType}</Text>
        </View>
      )}

      {status && (
        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Node Version:</Text>
          <Text style={styles.statusValue}>{status.nodeVersion}</Text>
          
          <Text style={styles.statusLabel}>Platform:</Text>
          <Text style={styles.statusValue}>{status.platform}</Text>
          
          <Text style={styles.statusLabel}>P2P Initialized:</Text>
          <Text style={styles.statusValue}>{status.p2pInitialized ? 'Yes' : 'No'}</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <Button 
          title="Ping" 
          onPress={handlePing}
          disabled={!rpc.isReady}
        />
        <View style={styles.spacer} />
        <Button 
          title="Get Status" 
          onPress={handleGetStatus}
          disabled={!rpc.isReady}
        />
      </View>

      <Text style={styles.logsTitle}>Logs:</Text>
      <ScrollView style={styles.logsContainer}>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusBox: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
  },
  statusValue: {
    fontSize: 16,
    color: '#000',
    marginBottom: 10,
  },
  ready: {
    color: 'green',
    fontWeight: 'bold',
  },
  notReady: {
    color: 'red',
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  spacer: {
    width: 10,
  },
  logsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logsContainer: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 5,
    color: '#333',
  },
});
