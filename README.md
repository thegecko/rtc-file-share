# WebRTC File Share

A React-based Single Page Application (SPA) for peer-to-peer file sharing between browser sessions using WebRTC.

![WebRTC File Share Home](https://github.com/user-attachments/assets/b6579083-3131-4c2f-b67e-8158369254bc)

## Features

- 🔒 **Secure Peer-to-Peer Transfer**: Files are transferred directly between browsers using WebRTC data channels
- 🚀 **No Server Required**: Once connected, file transfer happens directly between peers
- 📊 **Real-time Progress**: Track upload/download progress in real-time
- 💻 **Modern UI**: Clean, responsive interface with visual feedback
- 🔄 **Simple Connection**: Easy copy-paste connection establishment

## How It Works

The application uses WebRTC to establish a direct peer-to-peer connection between two browsers:

1. One browser creates a connection as the **Sender** and generates an "offer"
2. The offer is manually copied and pasted to the **Receiver**
3. The receiver generates an "answer" which is copied back to the sender
4. Once connected, files can be transferred directly between the browsers
5. Files are sent in 16KB chunks with progress tracking

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/thegecko/rtc-file-share.git
cd rtc-file-share

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173/`

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

## Usage Guide

### Step-by-Step Instructions

1. **Open Two Browser Windows/Tabs**
   - Open the application in two separate browser windows or tabs
   - These can be on the same computer or different computers

2. **Create Connection (Sender)**
   - In the first browser, click "Create Connection (Sender)"
   - Wait 2-3 seconds for the offer to be generated
   - Click "Copy Offer" to copy the connection offer to clipboard

3. **Join Connection (Receiver)**
   - In the second browser, click "Join Connection (Receiver)"
   - Paste the offer from the sender into the text area
   - Click "Generate Answer"
   - Wait 2-3 seconds, then click "Copy Answer"

4. **Complete Connection**
   - Go back to the sender browser
   - Paste the answer into "Step 2: Paste answer from receiver"
   - Click "Connect"
   - Wait for the status to change to "connected"

5. **Transfer Files**
   - Once connected, the sender can select and send files
   - The receiver will automatically download received files
   - Progress is shown in real-time for both sender and receiver

![Sender View](https://github.com/user-attachments/assets/48976ffb-644e-4a68-957d-52776bbf0c1a)

## Technical Details

### Technologies Used

- **React 19**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **WebRTC**: Peer-to-peer communication
- **RTCDataChannel**: File transfer protocol

### WebRTC Configuration

The application uses Google's public STUN servers for NAT traversal:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

### File Transfer Protocol

- Files are split into 16KB chunks for efficient transfer
- Metadata (filename, size) is sent before the file data
- Progress is tracked and displayed in real-time
- Received files are automatically assembled and offered for download

## Browser Compatibility

This application works in modern browsers that support WebRTC:
- Chrome/Edge (recommended)
- Firefox
- Safari (14+)
- Opera

## Security & Privacy

- All file transfers happen directly between browsers (peer-to-peer)
- No data is sent to or stored on any server
- Connection details (offer/answer) are manually exchanged
- Files are not encrypted by default (WebRTC uses DTLS for transport security)

## Limitations

- Requires manual exchange of connection details (offer/answer)
- Both browsers must be online simultaneously
- File transfer speed depends on network conditions
- May require port forwarding or TURN servers for some network configurations

## Development

### Project Structure

```
rtc-file-share/
├── src/
│   ├── App.tsx           # Main application component
│   ├── App.css           # Application styles
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Rob Moran
