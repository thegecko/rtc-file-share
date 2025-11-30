import React, { useState } from 'react';
import { ConnectionStatus } from '../hooks/usePeerJS';

interface ConnectionPanelProps {
    peerId: string | null;
    connections: string[];
    status: ConnectionStatus;
    onConnect: (peerId: string) => void;
}

export default function ConnectionPanel({
    peerId,
    connections,
    status,
    onConnect
}: ConnectionPanelProps): JSX.Element {
    const [remotePeerId, setRemotePeerId] = useState<string>('');

    const handleConnect = (): void => {
        if (remotePeerId.trim()) {
            onConnect(remotePeerId.trim());
            setRemotePeerId('');
        }
    };

    const getStatusText = (): string => {
        if (status === 'disconnected') return 'Disconnected';
        if (status === 'connecting') return 'Connecting...';
        if (status === 'connected') return `Connected (${connections.length})`;
        return 'Unknown';
    };

    const getStatusClass = (): string => {
        return `status ${status}`;
    };

    return (
        <div className="panel">
            <h2>Connection</h2>

            {/* Peer ID Display */}
            <div className="peer-id-display">
                <div className="peer-id-label">Your Peer ID</div>
                <div className="peer-id-value">{peerId || 'Generating...'}</div>
            </div>

            {/* Status */}
            <div className={getStatusClass()}>
                <div className="status-dot"></div>
                {getStatusText()}
            </div>

            {/* Connect to Peer */}
            <div className="form-group">
                <label>Connect to Peer</label>
                <div className="input-group">
                    <input
                        type="text"
                        value={remotePeerId}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemotePeerId(e.target.value)}
                        placeholder="Enter remote peer ID"
                        onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleConnect()}
                        disabled={!peerId}
                    />
                    <button
                        className="btn-primary"
                        onClick={handleConnect}
                        disabled={!remotePeerId.trim() || !peerId}
                    >
                        Connect
                    </button>
                </div>
            </div>

            {/* Active Connections */}
            {connections.length > 0 && (
                <div>
                    <h3>Active Connections</h3>
                    <div className="connection-list">
                        {connections.map((connPeerId: string) => (
                            <div key={connPeerId} className="connection-item">
                                <span className="connection-peer">{connPeerId}</span>
                                <span className="status connected">
                                    <div className="status-dot"></div>
                                    Connected
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
