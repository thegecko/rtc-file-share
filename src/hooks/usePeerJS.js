import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { downloadFile, generatePeerId } from '../utils/fileUtils';

export function usePeerJS() {
    const [peerId, setPeerId] = useState(null);
    const [peer, setPeer] = useState(null);
    const [connections, setConnections] = useState([]);
    const [status, setStatus] = useState('disconnected');
    const [receivedFiles, setReceivedFiles] = useState([]);

    const peerRef = useRef(null);
    const connectionsRef = useRef(new Map());

    // Initialize peer on mount
    useEffect(() => {
        const id = generatePeerId();

        const newPeer = new Peer(id, {
            debug: 2,
        });

        newPeer.on('open', (id) => {
            console.log('Peer opened with ID:', id);
            setPeerId(id);
            setStatus('disconnected');
            peerRef.current = newPeer;
            setPeer(newPeer);
        });

        newPeer.on('connection', (conn) => {
            console.log('Incoming connection from:', conn.peer);
            handleConnection(conn);
        });

        newPeer.on('error', (err) => {
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
    const handleConnection = useCallback((conn) => {
        conn.on('open', () => {
            console.log('Connection opened with:', conn.peer);
            connectionsRef.current.set(conn.peer, conn);
            updateConnectionsList();
            setStatus('connected');
        });

        conn.on('data', (data) => {
            console.log('Received data:', data);

            // Check if it's a file (Blob)
            if (data instanceof Blob) {
                // Extract filename from metadata if available
                const filename = data.name || `file-${Date.now()}`;

                // Auto-download the file
                downloadFile(data, filename);

                // Add to received files list
                setReceivedFiles(prev => [...prev, {
                    name: filename,
                    size: data.size,
                    timestamp: new Date(),
                }]);
            } else if (data.type === 'file-metadata') {
                // Handle file metadata separately if needed
                console.log('File metadata:', data);
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

        conn.on('error', (err) => {
            console.error('Connection error:', err);
        });
    }, []);

    // Update connections list in state
    const updateConnectionsList = () => {
        const connList = Array.from(connectionsRef.current.keys());
        setConnections(connList);
    };

    // Connect to a remote peer
    const connectToPeer = useCallback((remotePeerId) => {
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
    const sendFile = useCallback((file) => {
        if (connectionsRef.current.size === 0) {
            console.error('No peers connected');
            return false;
        }

        // Create a new Blob with filename metadata
        const fileBlob = new Blob([file], { type: file.type });
        fileBlob.name = file.name;

        connectionsRef.current.forEach((conn) => {
            console.log('Sending file to:', conn.peer);

            // Send file metadata first
            conn.send({
                type: 'file-metadata',
                name: file.name,
                size: file.size,
                mimeType: file.type,
            });

            // Then send the actual file
            conn.send(fileBlob);
        });

        return true;
    }, []);

    // Send file to a specific peer
    const sendFileToPeer = useCallback((file, remotePeerId) => {
        const conn = connectionsRef.current.get(remotePeerId);

        if (!conn) {
            console.error('Not connected to peer:', remotePeerId);
            return false;
        }

        const fileBlob = new Blob([file], { type: file.type });
        fileBlob.name = file.name;

        // Send file metadata
        conn.send({
            type: 'file-metadata',
            name: file.name,
            size: file.size,
            mimeType: file.type,
        });

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
