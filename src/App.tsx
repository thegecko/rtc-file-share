import { useState, useRef, useEffect } from 'react'
import './App.css'

interface FileTransfer {
  name: string;
  size: number;
  received: number;
  progress: number;
}

function App() {
  const [isInitiator, setIsInitiator] = useState<boolean | null>(null)
  const [localOffer, setLocalOffer] = useState<string>('')
  const [remoteOffer, setRemoteOffer] = useState<string>('')
  const [localAnswer, setLocalAnswer] = useState<string>('')
  const [remoteAnswer, setRemoteAnswer] = useState<string>('')
  const [connectionStatus, setConnectionStatus] = useState<string>('Not connected')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileTransfer, setFileTransfer] = useState<FileTransfer | null>(null)
  const [receivedFile, setReceivedFile] = useState<{ name: string; blob: Blob } | null>(null)

  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const dataChannel = useRef<RTCDataChannel | null>(null)
  const fileReader = useRef<FileReader | null>(null)
  const receivedBuffer = useRef<ArrayBuffer[]>([])

  const CHUNK_SIZE = 16384 // 16KB chunks

  useEffect(() => {
    return () => {
      if (peerConnection.current) {
        peerConnection.current.close()
      }
    }
  }, [])

  const createPeerConnection = () => {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    }

    const pc = new RTCPeerConnection(configuration)

    pc.onicecandidate = () => {
      // Update offer/answer whenever we have a new candidate or when gathering is complete
      if (isInitiator) {
        const offer = pc.localDescription
        if (offer) {
          setLocalOffer(JSON.stringify(offer))
        }
      } else {
        const answer = pc.localDescription
        if (answer) {
          setLocalAnswer(JSON.stringify(answer))
        }
      }
    }

    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState)
      // Also update when gathering state changes
      if (pc.iceGatheringState === 'complete') {
        if (isInitiator) {
          const offer = pc.localDescription
          if (offer) {
            setLocalOffer(JSON.stringify(offer))
          }
        } else {
          const answer = pc.localDescription
          if (answer) {
            setLocalAnswer(JSON.stringify(answer))
          }
        }
      }
    }

    pc.onconnectionstatechange = () => {
      setConnectionStatus(pc.connectionState)
    }

    pc.ondatachannel = (event) => {
      const channel = event.channel
      setupDataChannel(channel)
    }

    return pc
  }

  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannel.current = channel

    channel.onopen = () => {
      console.log('Data channel opened')
    }

    channel.onclose = () => {
      console.log('Data channel closed')
    }

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data)
        
        if (message.type === 'file-meta') {
          receivedBuffer.current = []
          setFileTransfer({
            name: message.name,
            size: message.size,
            received: 0,
            progress: 0
          })
        } else if (message.type === 'file-end') {
          const blob = new Blob(receivedBuffer.current)
          setReceivedFile({ name: message.name, blob })
          setFileTransfer(null)
          receivedBuffer.current = []
        }
      } else {
        receivedBuffer.current.push(event.data)
        setFileTransfer(prev => {
          if (!prev) return null
          const received = prev.received + event.data.byteLength
          return {
            ...prev,
            received,
            progress: (received / prev.size) * 100
          }
        })
      }
    }
  }

  const startAsInitiator = async () => {
    setIsInitiator(true)
    const pc = createPeerConnection()
    peerConnection.current = pc

    const channel = pc.createDataChannel('fileTransfer')
    setupDataChannel(channel)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // Set a timeout to show the offer even if ICE gathering is slow
    setTimeout(() => {
      const currentOffer = pc.localDescription
      if (currentOffer) {
        setLocalOffer(JSON.stringify(currentOffer))
      }
    }, 2000) // Show offer after 2 seconds regardless of ICE gathering state
  }

  const startAsReceiver = () => {
    setIsInitiator(false)
    const pc = createPeerConnection()
    peerConnection.current = pc
  }

  const handleRemoteOfferSubmit = async () => {
    if (!peerConnection.current || !remoteOffer) return

    try {
      const offer = JSON.parse(remoteOffer)
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer))
      
      const answer = await peerConnection.current.createAnswer()
      await peerConnection.current.setLocalDescription(answer)

      // Set a timeout to show the answer even if ICE gathering is slow
      setTimeout(() => {
        const currentAnswer = peerConnection.current?.localDescription
        if (currentAnswer) {
          setLocalAnswer(JSON.stringify(currentAnswer))
        }
      }, 2000) // Show answer after 2 seconds regardless of ICE gathering state
    } catch (error) {
      console.error('Error processing offer:', error)
    }
  }

  const handleRemoteAnswerSubmit = async () => {
    if (!peerConnection.current || !remoteAnswer) return

    try {
      const answer = JSON.parse(remoteAnswer)
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer))
    } catch (error) {
      console.error('Error processing answer:', error)
    }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const sendFile = () => {
    if (!selectedFile || !dataChannel.current || dataChannel.current.readyState !== 'open') {
      alert('Please select a file and ensure the connection is established')
      return
    }

    const file = selectedFile
    const channel = dataChannel.current

    // Send file metadata
    channel.send(JSON.stringify({
      type: 'file-meta',
      name: file.name,
      size: file.size
    }))

    setFileTransfer({
      name: file.name,
      size: file.size,
      received: 0,
      progress: 0
    })

    // Send file in chunks
    const reader = new FileReader()
    fileReader.current = reader
    let offset = 0

    const readSlice = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE)
      reader.readAsArrayBuffer(slice)
    }

    reader.onload = (e) => {
      if (e.target?.result) {
        channel.send(e.target.result as ArrayBuffer)
        offset += (e.target.result as ArrayBuffer).byteLength

        setFileTransfer(prev => {
          if (!prev) return null
          return {
            ...prev,
            received: offset,
            progress: (offset / file.size) * 100
          }
        })

        if (offset < file.size) {
          readSlice()
        } else {
          channel.send(JSON.stringify({
            type: 'file-end',
            name: file.name
          }))
          setFileTransfer(null)
          setSelectedFile(null)
        }
      }
    }

    readSlice()
  }

  const downloadReceivedFile = () => {
    if (!receivedFile) return

    const url = URL.createObjectURL(receivedFile.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = receivedFile.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setReceivedFile(null)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => alert('Copied to clipboard!'))
      .catch(() => alert('Failed to copy'))
  }

  if (isInitiator === null) {
    return (
      <div className="container">
        <div className="card">
          <h1>WebRTC File Share</h1>
          <p className="subtitle">Send files directly between browsers using WebRTC</p>
          <div className="button-group">
            <button className="button button-primary" onClick={startAsInitiator}>
              Create Connection (Sender)
            </button>
            <button className="button button-secondary" onClick={startAsReceiver}>
              Join Connection (Receiver)
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <h1>WebRTC File Share</h1>
        <div className="status">
          Status: <span className={`status-${connectionStatus.toLowerCase().replace(' ', '-')}`}>
            {connectionStatus}
          </span>
        </div>

        {isInitiator && (
          <div className="section">
            <h2>Step 1: Share this offer</h2>
            {localOffer ? (
              <div className="code-block-container">
                <textarea
                  className="code-block"
                  value={localOffer}
                  readOnly
                  rows={4}
                />
                <button className="button button-small" onClick={() => copyToClipboard(localOffer)}>
                  Copy Offer
                </button>
              </div>
            ) : (
              <p>Generating offer...</p>
            )}

            <h2>Step 2: Paste answer from receiver</h2>
            <textarea
              className="input-field"
              placeholder="Paste answer here..."
              value={remoteAnswer}
              onChange={(e) => setRemoteAnswer(e.target.value)}
              rows={4}
            />
            <button 
              className="button button-primary" 
              onClick={handleRemoteAnswerSubmit}
              disabled={!remoteAnswer}
            >
              Connect
            </button>
          </div>
        )}

        {!isInitiator && (
          <div className="section">
            <h2>Step 1: Paste offer from sender</h2>
            <textarea
              className="input-field"
              placeholder="Paste offer here..."
              value={remoteOffer}
              onChange={(e) => setRemoteOffer(e.target.value)}
              rows={4}
            />
            <button 
              className="button button-primary" 
              onClick={handleRemoteOfferSubmit}
              disabled={!remoteOffer}
            >
              Generate Answer
            </button>

            <h2>Step 2: Share this answer</h2>
            {localAnswer ? (
              <div className="code-block-container">
                <textarea
                  className="code-block"
                  value={localAnswer}
                  readOnly
                  rows={4}
                />
                <button className="button button-small" onClick={() => copyToClipboard(localAnswer)}>
                  Copy Answer
                </button>
              </div>
            ) : (
              <p>Answer will appear after processing offer...</p>
            )}
          </div>
        )}

        {connectionStatus === 'connected' && (
          <div className="section">
            <h2>File Transfer</h2>
            {isInitiator && (
              <div className="file-upload">
                <input
                  type="file"
                  onChange={handleFileSelect}
                  id="file-input"
                  className="file-input"
                />
                <label htmlFor="file-input" className="file-label">
                  {selectedFile ? selectedFile.name : 'Choose a file'}
                </label>
                {selectedFile && (
                  <button className="button button-primary" onClick={sendFile}>
                    Send File
                  </button>
                )}
              </div>
            )}

            {fileTransfer && (
              <div className="progress-container">
                <p>Transferring: {fileTransfer.name}</p>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${fileTransfer.progress}%` }}
                  />
                </div>
                <p className="progress-text">
                  {Math.round(fileTransfer.progress)}% 
                  ({Math.round(fileTransfer.received / 1024)} KB / {Math.round(fileTransfer.size / 1024)} KB)
                </p>
              </div>
            )}

            {receivedFile && (
              <div className="received-file">
                <p>Received: {receivedFile.name}</p>
                <button className="button button-success" onClick={downloadReceivedFile}>
                  Download File
                </button>
              </div>
            )}
          </div>
        )}

        <button 
          className="button button-secondary button-reset" 
          onClick={() => window.location.reload()}
        >
          Start Over
        </button>
      </div>
    </div>
  )
}

export default App
