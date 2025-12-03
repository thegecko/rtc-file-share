import { useState, useEffect, useRef, useCallback } from 'react';
import { downloadFile } from '../utils/fileUtils';

// Signaling server URL
const SIGNAL_SERVER_URL = import.meta.env.VITE_SIGNAL_SERVER_URL || 'ws://localhost:9000';

// File metadata type
interface FileMetadata {
    type: 'file-metadata';
    name: string;
    size: number;
    mimeType: string;
}

// Received file type
export interface ReceivedFile {
    name: string;
    size: number;
    timestamp: Date;
}

// Connection status type
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Hook return type
export interface UseWebRTCReturn {
    peerId: string | null;
    peer: null; // Keep for API compatibility but not used
    connections: string[];
    status: ConnectionStatus;
    receivedFiles: ReceivedFile[];
    connectToPeer: (remotePeerId: string) => void;
    sendFile: (file: File) => boolean;
    sendFileToPeer: (file: File, remotePeerId: string) => boolean;
}

// WebRTC configuration
const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

interface PeerConnection {
    connection: RTCPeerConnection;
    dataChannel: RTCDataChannel | null;
    pendingIceCandidates: RTCIceCandidate[];
}

export function useWebRTC(): UseWebRTCReturn {
    const [peerId, setPeerId] = useState<string | null>(null);
    const [connections, setConnections] = useState<string[]>([]);
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map());
    const isInitialized = useRef(false);
    const fileMetadataRef = useRef<Map<string, FileMetadata>>(new Map());

    // Update connections list in state
    const updateConnectionsList = useCallback(() => {
        const connList = Array.from(peerConnectionsRef.current.keys()).filter(peerId => {
            const pc = peerConnectionsRef.current.get(peerId);
            return pc?.dataChannel?.readyState === 'open';
        });
        setConnections(connList);

        if (connList.length > 0) {
            setStatus('connected');
        } else if (wsRef.current?.readyState === WebSocket.OPEN) {
            setStatus('disconnected');
        }
    }, []);

    // Create RTCPeerConnection
    const createPeerConnection = useCallback((remotePeerId: string, isInitiator: boolean): PeerConnection => {
        console.log(`Creating peer connection with ${remotePeerId}, isInitiator: ${isInitiator}`);

        const pc = new RTCPeerConnection(RTC_CONFIG);
        const peerConn: PeerConnection = {
            connection: pc,
            dataChannel: null,
            pendingIceCandidates: []
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Generated ICE candidate for ${remotePeerId}:`, event.candidate.candidate);
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'ice-candidate',
                        targetPeerId: remotePeerId,
                        candidate: event.candidate
                    }));
                }
            } else {
                console.log(`ICE gathering complete for ${remotePeerId}`);
            }
        };

        // Handle ICE gathering state changes
        pc.onicegatheringstatechange = () => {
            console.log(`ICE gathering state with ${remotePeerId}: ${pc.iceGatheringState}`);
        };

        // Handle ICE connection state changes
        pc.oniceconnectionstatechange = () => {
            console.log(`ICE connection state with ${remotePeerId}: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                console.log(`✅ ICE connection established with ${remotePeerId}`);
            } else if (pc.iceConnectionState === 'failed') {
                console.error(`❌ ICE connection failed with ${remotePeerId}`);
                setStatus('error');
            } else if (pc.iceConnectionState === 'disconnected') {
                console.warn(`⚠️ ICE connection disconnected with ${remotePeerId}`);
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${remotePeerId}: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                updateConnectionsList();
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                peerConnectionsRef.current.delete(remotePeerId);
                updateConnectionsList();
            }
        };

        // Set up data channel handlers
        const setupDataChannel = (channel: RTCDataChannel) => {
            peerConn.dataChannel = channel;

            channel.onopen = () => {
                console.log(`Data channel opened with ${remotePeerId}`);
                updateConnectionsList();
            };

            channel.onclose = () => {
                console.log(`Data channel closed with ${remotePeerId}`);
                updateConnectionsList();
            };

            channel.onerror = (error) => {
                console.error(`Data channel error with ${remotePeerId}:`, error);
                setStatus('error');
            };

            channel.onmessage = (event) => {
                console.log(`Received data from ${remotePeerId}`);
                handleIncomingData(event.data, remotePeerId);
            };
        };

        if (isInitiator) {
            // Create data channel if we're the initiator
            const dataChannel = pc.createDataChannel('fileTransfer', {
                ordered: true
            });
            setupDataChannel(dataChannel);
        } else {
            // Listen for data channel if we're not the initiator
            pc.ondatachannel = (event) => {
                console.log(`Received data channel from ${remotePeerId}`);
                setupDataChannel(event.channel);
            };
        }

        peerConnectionsRef.current.set(remotePeerId, peerConn);
        return peerConn;
    }, [updateConnectionsList]);

    // Handle incoming data
    const handleIncomingData = useCallback((data: any, fromPeerId: string) => {
        console.log('Received data type:', typeof data);
        console.log('Is Blob:', data instanceof Blob);
        console.log('Is ArrayBuffer:', data instanceof ArrayBuffer);

        // Check if it's file metadata
        if (typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'file-metadata') {
                    console.log('Received file metadata:', parsed);
                    fileMetadataRef.current.set(fromPeerId, parsed as FileMetadata);
                    return;
                }
            } catch (e) {
                // Not JSON, ignore
            }
        }

        // Check if it's a file (Blob or ArrayBuffer)
        if (data instanceof Blob) {
            const metadata = fileMetadataRef.current.get(fromPeerId);
            const filename = metadata?.name || `file-${Date.now()}`;

            // Auto-download the file
            downloadFile(data, filename);

            // Add to received files list
            setReceivedFiles(prev => [...prev, {
                name: filename,
                size: data.size,
                timestamp: new Date(),
            }]);

            // Clear metadata
            fileMetadataRef.current.delete(fromPeerId);
        } else if (data instanceof ArrayBuffer) {
            const blob = new Blob([data]);
            const metadata = fileMetadataRef.current.get(fromPeerId);
            const filename = metadata?.name || `file-${Date.now()}`;

            downloadFile(blob, filename);

            setReceivedFiles(prev => [...prev, {
                name: filename,
                size: blob.size,
                timestamp: new Date(),
            }]);

            fileMetadataRef.current.delete(fromPeerId);
        } else {
            console.warn('Received unknown data type:', data);
        }
    }, []);

    // Handle signaling messages
    const handleSignalingMessage = useCallback(async (message: any) => {
        console.log('Received signaling message:', message.type);

        switch (message.type) {
            case 'peer-id':
                console.log('Received peer ID:', message.peerId);
                setPeerId(message.peerId);
                setStatus('disconnected');
                break;

            case 'offer':
                {
                    const { fromPeerId, offer } = message;
                    console.log(`Received offer from ${fromPeerId}`);

                    // Check if we already have a connection
                    if (peerConnectionsRef.current.has(fromPeerId)) {
                        console.log(`Already have connection with ${fromPeerId}`);
                        return;
                    }

                    const peerConn = createPeerConnection(fromPeerId, false);

                    try {
                        await peerConn.connection.setRemoteDescription(new RTCSessionDescription(offer));

                        // Add pending ICE candidates
                        for (const candidate of peerConn.pendingIceCandidates) {
                            await peerConn.connection.addIceCandidate(candidate);
                        }
                        peerConn.pendingIceCandidates = [];

                        const answer = await peerConn.connection.createAnswer();
                        await peerConn.connection.setLocalDescription(answer);

                        if (wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(JSON.stringify({
                                type: 'answer',
                                targetPeerId: fromPeerId,
                                answer: answer
                            }));
                        }
                    } catch (error) {
                        console.error('Error handling offer:', error);
                        setStatus('error');
                    }
                }
                break;

            case 'answer':
                {
                    const { fromPeerId, answer } = message;
                    console.log(`Received answer from ${fromPeerId}`);

                    const peerConn = peerConnectionsRef.current.get(fromPeerId);
                    if (peerConn) {
                        try {
                            await peerConn.connection.setRemoteDescription(new RTCSessionDescription(answer));

                            // Add pending ICE candidates
                            for (const candidate of peerConn.pendingIceCandidates) {
                                await peerConn.connection.addIceCandidate(candidate);
                            }
                            peerConn.pendingIceCandidates = [];
                        } catch (error) {
                            console.error('Error handling answer:', error);
                            setStatus('error');
                        }
                    }
                }
                break;

            case 'ice-candidate':
                {
                    const { fromPeerId, candidate } = message;
                    console.log(`Received ICE candidate from ${fromPeerId}`);

                    const peerConn = peerConnectionsRef.current.get(fromPeerId);
                    if (peerConn) {
                        try {
                            if (peerConn.connection.remoteDescription) {
                                await peerConn.connection.addIceCandidate(new RTCIceCandidate(candidate));
                            } else {
                                // Queue the candidate if remote description is not set yet
                                peerConn.pendingIceCandidates.push(new RTCIceCandidate(candidate));
                            }
                        } catch (error) {
                            console.error('Error adding ICE candidate:', error);
                        }
                    }
                }
                break;

            case 'peer-disconnected':
                {
                    const { peerId: disconnectedPeerId } = message;
                    console.log(`Peer ${disconnectedPeerId} disconnected`);

                    const peerConn = peerConnectionsRef.current.get(disconnectedPeerId);
                    if (peerConn) {
                        peerConn.connection.close();
                        peerConnectionsRef.current.delete(disconnectedPeerId);
                        updateConnectionsList();
                    }
                }
                break;

            case 'error':
                console.error('Signaling server error:', message.message);
                setStatus('error');
                break;
        }
    }, [createPeerConnection, updateConnectionsList]);

    // Initialize WebSocket connection to signaling server
    useEffect(() => {
        if (isInitialized.current) {
            return;
        }
        isInitialized.current = true;

        console.log('Connecting to signaling server:', SIGNAL_SERVER_URL);
        const ws = new WebSocket(SIGNAL_SERVER_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('Connected to signaling server');
            setStatus('disconnected');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleSignalingMessage(message);
            } catch (error) {
                console.error('Error parsing signaling message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setStatus('error');
        };

        ws.onclose = () => {
            console.log('Disconnected from signaling server');
            setStatus('error');
        };

        return () => {
            if (isInitialized.current) {
                console.log('Cleaning up WebRTC connections');
                peerConnectionsRef.current.forEach((peerConn) => {
                    peerConn.dataChannel?.close();
                    peerConn.connection.close();
                });
                peerConnectionsRef.current.clear();
                ws.close();
                isInitialized.current = false;
            }
        };
    }, [handleSignalingMessage]);

    // Connect to a remote peer
    const connectToPeer = useCallback(async (remotePeerId: string): Promise<void> => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }

        if (peerConnectionsRef.current.has(remotePeerId)) {
            console.log('Already connected to:', remotePeerId);
            return;
        }

        if (remotePeerId === peerId) {
            console.error('Cannot connect to yourself');
            return;
        }

        console.log(`Initiating connection to ${remotePeerId}`);
        setStatus('connecting');

        const peerConn = createPeerConnection(remotePeerId, true);

        try {
            const offer = await peerConn.connection.createOffer();
            await peerConn.connection.setLocalDescription(offer);

            wsRef.current.send(JSON.stringify({
                type: 'offer',
                targetPeerId: remotePeerId,
                offer: offer
            }));
        } catch (error) {
            console.error('Error creating offer:', error);
            setStatus('error');
        }
    }, [peerId, createPeerConnection]);

    // Send a file to all connected peers
    const sendFile = useCallback((file: File): boolean => {
        const openConnections = Array.from(peerConnectionsRef.current.entries()).filter(
            ([_, pc]) => pc.dataChannel?.readyState === 'open'
        );

        if (openConnections.length === 0) {
            console.error('No peers connected');
            return false;
        }

        openConnections.forEach(([remotePeerId, peerConn]) => {
            console.log('Sending file to:', remotePeerId);

            // Send file metadata first
            const metadata: FileMetadata = {
                type: 'file-metadata',
                name: file.name,
                size: file.size,
                mimeType: file.type,
            };
            peerConn.dataChannel!.send(JSON.stringify(metadata));

            // Then send the actual file
            file.arrayBuffer().then(buffer => {
                peerConn.dataChannel!.send(buffer);
            });
        });

        return true;
    }, []);

    // Send file to a specific peer
    const sendFileToPeer = useCallback((file: File, remotePeerId: string): boolean => {
        const peerConn = peerConnectionsRef.current.get(remotePeerId);

        if (!peerConn || peerConn.dataChannel?.readyState !== 'open') {
            console.error('Not connected to peer:', remotePeerId);
            return false;
        }

        // Send file metadata
        const metadata: FileMetadata = {
            type: 'file-metadata',
            name: file.name,
            size: file.size,
            mimeType: file.type,
        };
        peerConn.dataChannel.send(JSON.stringify(metadata));

        // Send the file
        file.arrayBuffer().then(buffer => {
            peerConn.dataChannel!.send(buffer);
        });

        return true;
    }, []);

    return {
        peerId,
        peer: null, // Keep for API compatibility
        connections,
        status,
        receivedFiles,
        connectToPeer,
        sendFile,
        sendFileToPeer,
    };
}
