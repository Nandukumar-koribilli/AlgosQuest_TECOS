# Compressed & Encrypted Data Transfer Protocol

A lightweight protocol to securely transfer large data files with high compression and end-to-end encryption.

![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)

## Features

- 🔐 **End-to-End Encryption** - AES-256-GCM encryption, keys never leave your browser
- 📦 **High Compression** - Gzip/Brotli compression with up to 90% size reduction
- ⚡ **Large File Support** - Chunked uploads with resume capability
- 🔒 **Password Protection** - Optional password for additional security
- ⏰ **Expiration Dates** - Set transfer expiration and download limits
- 📊 **Transfer Tracking** - SQLite database for transfer history
- 🎨 **Modern UI** - Beautiful React interface with dark theme

## Tech Stack

**Frontend:**

- React 19 with Vite
- React Router for navigation
- Socket.io for real-time progress
- Lucide React for icons

**Backend:**

- Node.js with Express
- SQLite with better-sqlite3
- Built-in crypto module for AES-256-GCM
- zlib for Gzip/Brotli compression

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd hack-mail
```

2. Install server dependencies:

```bash
cd server
npm install
```

3. Install client dependencies:

```bash
cd ../client
npm install
```

### Running the Application

1. Start the backend server:

```bash
cd server
npm start
```

Server will run on http://localhost:3001

2. Start the frontend (in a new terminal):

```bash
cd client
npm run dev
```

Client will run on http://localhost:5173

## API Endpoints

### Upload

- `POST /api/upload` - Upload a file with compression and encryption
- `POST /api/upload/chunk` - Chunked upload for large files

### Download

- `GET /api/download/:id/info` - Get transfer metadata
- `POST /api/download/:id` - Download and decrypt file
- `GET /api/download/:id/stream` - Stream encrypted file

### Transfers

- `GET /api/transfers` - List all transfers
- `GET /api/transfers/:id` - Get transfer details
- `DELETE /api/transfers/:id` - Delete a transfer
- `GET /api/transfers/stats/overview` - Get statistics

## How It Works

### Encryption Flow

1. **Upload**: Client generates random AES-256 key → Encrypts file → Uploads encrypted data
2. **Share**: Download link contains key in URL fragment (`#key=...`)
3. **Download**: Client extracts key from URL → Downloads encrypted file → Decrypts locally

### Compression

Files are compressed using Gzip (default) or Brotli (for text content) before encryption, significantly reducing transfer size.

## Security

- **AES-256-GCM**: Military-grade encryption with authentication
- **Client-side Encryption**: Keys never leave your browser
- **URL Fragment**: Decryption key stored in URL fragment (not sent to server)
- **Password Protection**: Optional bcrypt-hashed password protection
- **HTTPS Ready**: Deploy behind HTTPS for production



