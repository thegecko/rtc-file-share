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

    // Initialize peer on mount
    useEffect(() => {
        const id = generatePeerId();

        const newPeer = new Peer(id, {
            debug: 2,
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
            handleConnection(conn);
        });

        newPeer.on('error', (err: Error) => {
            console.error('Peer error:', err);
            setStatus('error');
        });

        return () => {
            // Cleanup
            connectionsRef.current.forEach(conn => conn.close());
            newPeer.destroy();
        };
    }, []);

    // Handle incoming and outgoing connections
    const handleConnection = useCallback((conn: DataConnection) => {
        conn.on('open', () => {
            console.log('Connection opened with:', conn.peer);
            connectionsRef.current.set(conn.peer, conn);
            updateConnectionsList();
            setStatus('connected');
        });

        conn.on('data', (data: unknown) => {
            console.log('Received data:', data);

            // Check if it's a file (Blob)
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
            } else if (typeof data === 'object' && data !== null && 'type' in data) {
                const metadata = data as FileMetadata;
                if (metadata.type === 'file-metadata') {
                    // Handle file metadata separately if needed
                    console.log('File metadata:', metadata);
                }
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

        setStatus('connecting');
        const conn = peerRef.current.connect(remotePeerId, {
            reliable: true,
        });

        handleConnection(conn);
    }, [handleConnection]);

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
