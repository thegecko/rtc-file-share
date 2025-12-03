import { useWebRTC } from './hooks/useWebRTC';
import ConnectionPanel from './components/ConnectionPanel';
import FileTransfer from './components/FileTransfer';

function App(): JSX.Element {
    const {
        peerId,
        connections,
        status,
        receivedFiles,
        connectToPeer,
        sendFile,
    } = useWebRTC();

    return (
        <div>
            <header>
                <h1>🚀 WebRTC File Share</h1>
                <div className="subtitle">
                    Peer-to-peer file sharing directly in your browser
                </div>
            </header>

            <div className="grid">
                <ConnectionPanel
                    peerId={peerId}
                    connections={connections}
                    status={status}
                    onConnect={connectToPeer}
                />

                <FileTransfer
                    connections={connections}
                    receivedFiles={receivedFiles}
                    onSendFile={sendFile}
                />
            </div>

            <footer style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                marginTop: '2rem'
            }}>
                <p>Built with React, Vite, and WebRTC • Custom Signaling Server</p>
                <p style={{ marginTop: '0.5rem' }}>
                    Share your Peer ID with others to establish a connection
                </p>
            </footer>
        </div>
    );
}

export default App;
