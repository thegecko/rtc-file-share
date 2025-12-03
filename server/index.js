import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

const PORT = process.env.PORT || 9000;
const app = express();

// Enable CORS for all routes
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        peers: peers.size,
        timestamp: new Date().toISOString()
    });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store connected peers: peerId -> WebSocket
const peers = new Map();

// Generate unique peer ID
function generatePeerId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

wss.on('connection', (ws) => {
    const peerId = generatePeerId();
    peers.set(peerId, ws);

    console.log(`[${peerId}] Connected. Total peers: ${peers.size}`);

    // Send the peer their ID
    ws.send(JSON.stringify({
        type: 'peer-id',
        peerId: peerId
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log(`[${peerId}] Received:`, data.type);

            switch (data.type) {
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    // Forward signaling messages to target peer
                    const targetPeer = peers.get(data.targetPeerId);
                    if (targetPeer && targetPeer.readyState === ws.OPEN) {
                        targetPeer.send(JSON.stringify({
                            ...data,
                            fromPeerId: peerId
                        }));
                        console.log(`[${peerId}] Forwarded ${data.type} to ${data.targetPeerId}`);
                    } else {
                        console.log(`[${peerId}] Target peer ${data.targetPeerId} not found or not ready`);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `Peer ${data.targetPeerId} not available`
                        }));
                    }
                    break;

                case 'list-peers':
                    // Send list of available peers (excluding requesting peer)
                    const availablePeers = Array.from(peers.keys()).filter(id => id !== peerId);
                    ws.send(JSON.stringify({
                        type: 'peer-list',
                        peers: availablePeers
                    }));
                    console.log(`[${peerId}] Sent peer list: ${availablePeers.length} peers`);
                    break;

                case 'broadcast':
                    // Broadcast a message to all peers except sender
                    peers.forEach((peerWs, pId) => {
                        if (pId !== peerId && peerWs.readyState === ws.OPEN) {
                            peerWs.send(JSON.stringify({
                                type: 'broadcast',
                                fromPeerId: peerId,
                                data: data.data
                            }));
                        }
                    });
                    console.log(`[${peerId}] Broadcast to ${peers.size - 1} peers`);
                    break;

                default:
                    console.log(`[${peerId}] Unknown message type: ${data.type}`);
            }
        } catch (error) {
            console.error(`[${peerId}] Error processing message:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        peers.delete(peerId);
        console.log(`[${peerId}] Disconnected. Total peers: ${peers.size}`);

        // Notify other peers about disconnection
        peers.forEach((peerWs) => {
            if (peerWs.readyState === ws.OPEN) {
                peerWs.send(JSON.stringify({
                    type: 'peer-disconnected',
                    peerId: peerId
                }));
            }
        });
    });

    ws.on('error', (error) => {
        console.error(`[${peerId}] WebSocket error:`, error);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Signaling server running on port ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
});
