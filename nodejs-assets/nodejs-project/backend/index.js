/**
 * P2P Nexus Chat - Backend Module Exports
 *
 * This module provides the complete P2P chat backend using Hyperswarm and Hypercore.
 */

const P2PManager = require('./p2p-manager');
const CorestoreManager = require('./corestore-manager');
const SwarmManager = require('./swarm-manager');

module.exports = {
  P2PManager,
  CorestoreManager,
  SwarmManager,
};
