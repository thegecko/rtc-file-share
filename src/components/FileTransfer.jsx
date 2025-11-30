import { useState } from 'react';
import { formatFileSize } from '../utils/fileUtils';

export default function FileTransfer({ connections, receivedFiles, onSendFile }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [sending, setSending] = useState(false);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        setSelectedFile(file);
    };

    const handleSendFile = async () => {
        if (!selectedFile) return;

        setSending(true);
        const success = onSendFile(selectedFile);

        setTimeout(() => {
            setSending(false);
            if (success) {
                setSelectedFile(null);
                // Reset file input
                document.querySelector('input[type="file"]').value = '';
            }
        }, 500);
    };

    return (
        <div className="panel">
            <h2>File Transfer</h2>

            {/* Send File Section */}
            <div className="form-group">
                <label>Send File</label>
                <input
                    type="file"
                    onChange={handleFileSelect}
                    disabled={connections.length === 0 || sending}
                />

                {selectedFile && (
                    <div style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Selected: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
                    </div>
                )}

                <button
                    className="btn-primary"
                    onClick={handleSendFile}
                    disabled={!selectedFile || connections.length === 0 || sending}
                    style={{ marginTop: '1rem', width: '100%' }}
                >
                    {sending ? 'Sending...' : `Send to ${connections.length} peer${connections.length !== 1 ? 's' : ''}`}
                </button>

                {connections.length === 0 && (
                    <p style={{ marginTop: '0.75rem', color: 'var(--accent-warning)', fontSize: '0.875rem' }}>
                        ⚠️ Connect to a peer first to send files
                    </p>
                )}
            </div>

            {/* Received Files Section */}
            {receivedFiles.length > 0 && (
                <div style={{ marginTop: '2rem' }}>
                    <h3>Received Files</h3>
                    <div className="file-list">
                        {receivedFiles.map((file, index) => (
                            <div key={index} className="file-item">
                                <div className="file-header">
                                    <span className="file-name">{file.name}</span>
                                    <span className="file-size">{formatFileSize(file.size)}</span>
                                </div>
                                <div className="file-status">
                                    ✓ Downloaded at {file.timestamp.toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
