import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { downloadFile, generatePeerId } from '../utils/fileUtils';

// Custom type for file with name property
interface FileWithName extends Blob {
    name?: string;
}

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
export interface UsePeerJSReturn {
    peerId: string | null;
    peer: Peer | null;
    connections: string[];
    status: ConnectionStatus;
    receivedFiles: ReceivedFile[];
    connectToPeer: (remotePeerId: string) => void;
    sendFile: (file: File) => boolean;
    sendFileToPeer: (file: File, remotePeerId: string) => boolean;
}

export function usePeerJS(): UsePeerJSReturn {
    const [peerId, setPeerId] = useState<string | null>(null);
    const [peer, setPeer] = useState<Peer | null>(null);
    const [connections, setConnections] = useState<string[]>([]);
    const [status, setStatus] = useState<ConnectionStatus>('disconnected');
    const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);

    const peerRef = useRef<Peer | null>(null);
    const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
    const isInitialized = useRef(false);

    // Initialize peer on mount
    useEffect(() => {
        // Prevent double initialization in React StrictMode
        if (isInitialized.current) {
            return;
        }
        isInitialized.current = true;

        const id = generatePeerId();

        const newPeer = new Peer(id, {
            debug: 2,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        newPeer.on('open', (id: string) => {
            console.log('Peer opened with ID:', id);
            setPeerId(id);
            setStatus('disconnected');
            peerRef.current = newPeer;
            setPeer(newPeer);
        });

        newPeer.on('connection', (conn: DataConnection) => {
            console.log('Incoming connection from:', conn.peer);
            
            // Check if we already have a connection with this peer
            const existingConn = connectionsRef.current.get(conn.peer);
            if (existingConn) {
                // If both peers connect simultaneously, keep the connection from the peer with the smaller ID
                // This ensures both peers make the same decision
                if (id < conn.peer) {
                    console.log('Already connected to:', conn.peer, '- keeping our outgoing connection');
                    conn.close();
                    return;
                } else {
                    console.log('Already connected to:', conn.peer, '- replacing with incoming connection');
                    existingConn.close();
                    connectionsRef.current.delete(conn.peer);
                }
            }
            
            handleConnection(conn);
        });

        newPeer.on('error', (err: Error) => {
            console.error('Peer error:', err);
            setStatus('error');
        });

        return () => {
            // Only cleanup if we're actually unmounting (not just StrictMode re-running)
            if (isInitialized.current) {
                console.log('Cleaning up peer connection');
                connectionsRef.current.forEach(conn => conn.close());
                newPeer.destroy();
                isInitialized.current = false;
            }
        };
    }, []);

    // Handle incoming and outgoing connections
    const handleConnection = useCallback((conn: DataConnection) => {
        // Set up event handlers before the connection opens
        conn.on('open', () => {
            console.log('Connection opened with:', conn.peer);
            connectionsRef.current.set(conn.peer, conn);
            updateConnectionsList();
            setStatus('connected');
        });

        conn.on('data', (data: unknown) => {
            console.log('Received data:', data);
            console.log('Data type:', typeof data);
            console.log('Is Blob:', data instanceof Blob);
            console.log('Is ArrayBuffer:', data instanceof ArrayBuffer);
            console.log('Constructor:', data?.constructor?.name);

            // Check if it's file metadata first
            if (typeof data === 'object' && data !== null && 'type' in data) {
                const metadata = data as FileMetadata;
                if (metadata.type === 'file-metadata') {
                    // Handle file metadata separately if needed
                    console.log('File metadata:', metadata);
                    return;
                }
            }

            // Check if it's a file (Blob or ArrayBuffer)
            if (data instanceof Blob) {
                // Extract filename from metadata if available
                const fileBlob = data as FileWithName;
                const filename = fileBlob.name || `file-${Date.now()}`;

                // Auto-download the file
                downloadFile(data, filename);

                // Add to received files list
                setReceivedFiles(prev => [...prev, {
                    name: filename,
                    size: data.size,
                    timestamp: new Date(),
                }]);
            } else if (data instanceof ArrayBuffer) {
                // Handle ArrayBuffer (PeerJS might send files as ArrayBuffer)
                const blob = new Blob([data]);
                const filename = `file-${Date.now()}`;
                
                downloadFile(blob, filename);
                
                setReceivedFiles(prev => [...prev, {
                    name: filename,
                    size: blob.size,
                    timestamp: new Date(),
                }]);
            } else if (data?.constructor?.name === 'Uint8Array') {
                const blob = new Blob([data as BlobPart]);
                const filename = `file-${Date.now()}`;
                
                downloadFile(blob, filename);
                
                setReceivedFiles(prev => [...prev, {
                    name: filename,
                    size: blob.size,
                    timestamp: new Date(),
                }]);
            } else {
                console.warn('Received unknown data type:', data);
            }
        });

        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            connectionsRef.current.delete(conn.peer);
            updateConnectionsList();

            if (connectionsRef.current.size === 0) {
                setStatus('disconnected');
            }
        });

        conn.on('error', (err: Error) => {
            console.error('Connection error:', err);
            setStatus('error');
        });
    }, []);

    // Update connections list in state
    const updateConnectionsList = () => {
        const connList = Array.from(connectionsRef.current.keys());
        setConnections(connList);
    };

    // Connect to a remote peer
    const connectToPeer = useCallback((remotePeerId: string): void => {
        if (!peerRef.current) {
            console.error('Peer not initialized');
            return;
        }

        if (connectionsRef.current.has(remotePeerId)) {
            console.log('Already connected to:', remotePeerId);
            return;
        }

        // Prevent connecting to yourself
        if (remotePeerId === peerId) {
            console.error('Cannot connect to yourself');
            return;
        }

        setStatus('connecting');
        const conn = peerRef.current.connect(remotePeerId, {
            reliable: true,
        });

        handleConnection(conn);
    }, [handleConnection, peerId]);

    // Send a file to all connected peers
    const sendFile = useCallback((file: File): boolean => {
        if (connectionsRef.current.size === 0) {
            console.error('No peers connected');
            return false;
        }

        // Create a new Blob with filename metadata
        const fileBlob = new Blob([file], { type: file.type }) as FileWithName;
        fileBlob.name = file.name;

        connectionsRef.current.forEach((conn) => {
            console.log('Sending file to:', conn.peer);

            // Send file metadata first
            const metadata: FileMetadata = {
                type: 'file-metadata',
                name: file.name,
                size: file.size,
                mimeType: file.type,
            };
            conn.send(metadata);

            // Then send the actual file
            conn.send(fileBlob);
        });

        return true;
    }, []);

    // Send file to a specific peer
    const sendFileToPeer = useCallback((file: File, remotePeerId: string): boolean => {
        const conn = connectionsRef.current.get(remotePeerId);

        if (!conn) {
            console.error('Not connected to peer:', remotePeerId);
            return false;
        }

        const fileBlob = new Blob([file], { type: file.type }) as FileWithName;
        fileBlob.name = file.name;

        // Send file metadata
        const metadata: FileMetadata = {
            type: 'file-metadata',
            name: file.name,
            size: file.size,
            mimeType: file.type,
        };
        conn.send(metadata);

        // Send the file
        conn.send(fileBlob);
        return true;
    }, []);

    return {
        peerId,
        peer,
        connections,
        status,
        receivedFiles,
        connectToPeer,
        sendFile,
        sendFileToPeer,
    };
}
