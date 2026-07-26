import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Shield,
  Zap,
  Lock,
  CheckCircle2,
  Copy,
  ExternalLink,
  AlertCircle,
  Loader2,
  X,
  Eye,
  EyeOff,
  Sparkles,
  Timer,
  DownloadCloud,
  KeyRound,
  Cpu
} from 'lucide-react';
import { api, formatBytes, buildShareUrl } from '../lib/api';
import { createSocket, waitForSocketId } from '../lib/socket';
import { vault } from '../lib/vault';
import { getFileIcon } from '../lib/fileIcon';
import { useToast } from '../lib/toastContext';
import './Home.css';

const STAGE_LABEL = {
  uploading: 'Uploading to server…',
  compressing: 'Compressing…',
  encrypting: 'Encrypting (AES-256-GCM)…',
  complete: 'Done',
  '': 'Preparing…'
};

const EXPIRY_OPTIONS = [
  { value: '1', label: '1 hour' },
  { value: '6', label: '6 hours' },
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
  { value: '', label: 'Never' }
];

const COMPRESSION_OPTIONS = [
  { value: '1', label: 'Fast · Level 1' },
  { value: '3', label: 'Quick · Level 3' },
  { value: '6', label: 'Balanced · Level 6' },
  { value: '9', label: 'Maximum · Level 9' }
];

export default function Home() {
  const toast = useToast();

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadAlgorithm, setUploadAlgorithm] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState('24');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [compressionLevel, setCompressionLevel] = useState('6');

  const socketRef = useRef(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const onDrop = useCallback(
    (accepted, rejections) => {
      if (rejections?.length) {
        const first = rejections[0].errors?.[0];
        toast.error(first?.message || 'File was rejected');
        return;
      }
      if (accepted.length > 0) {
        setFile(accepted[0]);
        setError(null);
        setUploadResult(null);
      }
    },
    [toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 500 * 1024 * 1024
  });

  const FileIcon = useMemo(
    () => (file ? getFileIcon(file.name, file.type) : null),
    [file]
  );

  const handleUpload = async () => {
    if (!file || uploading) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStage('');
    setError(null);

    const socket = createSocket();
    socketRef.current = socket;

    socket.on('upload-progress', (data) => {
      setUploadProgress(data.progress || 0);
      setUploadStage(data.stage || '');
      if (data.algorithm) setUploadAlgorithm(data.algorithm);
    });

    // The transfer id only exists once the server has accepted the upload, so
    // we cannot join its room beforehand. Instead we hand the server our socket
    // id and let it address the progress events straight back to us.
    const socketId = await waitForSocketId(socket);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('compressionLevel', compressionLevel);
      if (socketId) formData.append('socketId', socketId);
      if (password) formData.append('password', password);
      if (expiresIn) formData.append('expiresIn', expiresIn);
      if (maxDownloads) formData.append('maxDownloads', maxDownloads);

      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          if (percent < 30) {
            setUploadProgress(percent);
            setUploadStage('uploading');
          }
        }
      });

      vault.save(response.data.transfer.id, {
        key: response.data.decryptionKey,
        tag: response.data.authTag,
        filename: response.data.transfer.filename
      });

      setUploadResult(response.data);
      setUploadProgress(100);
      setUploadStage('complete');
      toast.success('Upload complete — link ready to share');
    } catch (err) {
      console.error('Upload error:', err);
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Upload failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      socket.disconnect();
      socketRef.current = null;
    }
  };

  const shareUrl = uploadResult
    ? buildShareUrl(
        uploadResult.transfer.id,
        uploadResult.decryptionKey,
        uploadResult.authTag
      )
    : '';

  const copyToClipboard = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard error:', err);
      toast.error('Could not copy — please copy manually');
    }
  };

  const shareNative = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Secure download link',
          text: `Encrypted file: ${uploadResult.transfer.filename}`,
          url: shareUrl
        });
      } catch (err) {
        if (err.name !== 'AbortError') toast.error('Share cancelled');
      }
    } else {
      copyToClipboard();
    }
  };

  const resetUpload = () => {
    setFile(null);
    setUploadResult(null);
    setUploadProgress(0);
    setUploadStage('');
    setUploadAlgorithm(null);
    setError(null);
    setPassword('');
    setExpiresIn('24');
    setMaxDownloads('');
    setShowPassword(false);
  };

  const stageLabel =
    STAGE_LABEL[uploadStage] || 'Processing…';

  return (
    <div className="home">
      <div className="container">
        <section className="hero animate-fade-in">
          <div className="hero-badge">
            <Sparkles size={12} />
            <span>Zero-knowledge · Client-key delivery</span>
          </div>
          <h1 className="hero-title">
            Send files with{' '}
            <span className="text-gradient">military-grade encryption</span>
          </h1>
          <p className="hero-description">
            AES-256-GCM authenticated encryption, Gzip &amp; Brotli compression, one-click
            share links. Your decryption key lives only in the URL fragment — the server
            never sees it after upload.
          </p>

          <div className="hero-features">
            <div className="feature-tag"><Lock size={12} /><span>AES-256-GCM</span></div>
            <div className="feature-tag"><Zap size={12} /><span>Brotli / Gzip</span></div>
            <div className="feature-tag"><Timer size={12} /><span>Auto-expiry</span></div>
            <div className="feature-tag"><KeyRound size={12} /><span>URL-fragment key</span></div>
          </div>
        </section>

        {!uploadResult ? (
          <section className="upload-section">
            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? 'is-active' : ''} ${file ? 'has-file' : ''}`}
              aria-label="Upload file"
            >
              <input {...getInputProps()} />

              {file ? (
                <div className="file-preview">
                  <div className="file-icon">
                    <FileIcon size={28} />
                  </div>
                  <div className="file-info">
                    <span className="file-name" title={file.name}>{file.name}</span>
                    <span className="file-size">
                      {formatBytes(file.size)} · {file.type || 'application/octet-stream'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    disabled={uploading}
                    aria-label="Remove file"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="dropzone-content">
                  <div className="dropzone-icon animate-float">
                    <Upload size={30} />
                  </div>
                  <p className="dropzone-text">
                    {isDragActive ? 'Drop your file to begin' : 'Drag & drop a file here'}
                  </p>
                  <p className="dropzone-subtext">or click to browse · up to 500 MB</p>
                </div>
              )}
            </div>

            {file && (
              <div className="upload-options animate-fade-in">
                <div className="options-header">
                  <h3>Transfer options</h3>
                  <span className="options-hint">
                    All settings are optional. Sensible defaults work for most files.
                  </span>
                </div>

                <div className="options-grid">
                  <div className="option-group">
                    <label>
                      <Lock size={12} />
                      Password (optional)
                    </label>
                    <div className="input-with-toggle">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Add a password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="input-toggle"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="option-group">
                    <label><Timer size={12} /> Expires in</label>
                    <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
                      {EXPIRY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="option-group">
                    <label><DownloadCloud size={12} /> Max downloads</label>
                    <input
                      type="number"
                      value={maxDownloads}
                      onChange={(e) => setMaxDownloads(e.target.value)}
                      placeholder="Unlimited"
                      min="1"
                    />
                  </div>

                  <div className="option-group">
                    <label><Cpu size={12} /> Compression level</label>
                    <select
                      value={compressionLevel}
                      onChange={(e) => setCompressionLevel(e.target.value)}
                    >
                      {COMPRESSION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {uploading ? (
                  <div className="upload-progress">
                    <div className="progress-header">
                      <Loader2 className="animate-spin" size={18} />
                      <span>{stageLabel}</span>
                      {uploadAlgorithm && (
                        <span className="tag tag-accent">
                          {uploadAlgorithm.toUpperCase()}
                        </span>
                      )}
                      <span className="progress-percent">{uploadProgress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary upload-btn"
                    onClick={handleUpload}
                    type="button"
                  >
                    <Shield size={16} />
                    <span>Encrypt &amp; Share</span>
                  </button>
                )}

                {error && (
                  <div className="error-message">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="success-section animate-fade-in-up">
            <div className="success-card card">
              <div className="success-header">
                <div className="success-icon">
                  <CheckCircle2 size={30} />
                </div>
                <div>
                  <h2>Ready to share</h2>
                  <p>Your file is encrypted, compressed, and waiting.</p>
                </div>
              </div>

              <div className="transfer-stats-grid">
                <StatTile label="Original" value={uploadResult.transfer.originalSize} />
                <StatTile
                  label="Encrypted"
                  value={uploadResult.transfer.compressedSize}
                  accent
                />
                <StatTile
                  label="Saved"
                  value={uploadResult.transfer.spaceSavedPercent}
                  success
                />
                <StatTile
                  label="Algorithm"
                  value={(uploadResult.transfer.algorithm || 'gzip').toUpperCase()}
                />
              </div>

              <div className="download-link-section">
                <label>Secure download link</label>
                <div className="download-link-box">
                  <input type="text" value={shareUrl} readOnly onClick={(e) => e.target.select()} />
                  <button
                    className="btn btn-icon"
                    onClick={copyToClipboard}
                    title="Copy link"
                    aria-label="Copy link"
                  >
                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-icon"
                    title="Open in new tab"
                    aria-label="Open link"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
                <div className="link-hint">
                  The key sits after <span className="mono">#key=</span> in the URL — it stays
                  in the browser and never hits the server.
                </div>
              </div>

              <div className="transfer-details">
                <span className="detail">
                  <Lock size={13} />
                  {uploadResult.transfer.hasPassword ? 'Password protected' : 'No password'}
                </span>
                <span className="detail">
                  <Timer size={13} />
                  {uploadResult.transfer.expiresAt
                    ? `Expires ${new Date(uploadResult.transfer.expiresAt).toLocaleString()}`
                    : 'Never expires'}
                </span>
                <span className="detail">
                  <DownloadCloud size={13} />
                  {uploadResult.transfer.maxDownloads} downloads
                </span>
              </div>

              <div className="success-actions">
                {navigator.share && (
                  <button className="btn btn-secondary" onClick={shareNative}>
                    Share…
                  </button>
                )}
                <button className="btn btn-primary" onClick={resetUpload}>
                  Upload another
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="features-section">
          <div className="features-grid">
            <FeatureCard
              icon={Lock}
              title="AES-256-GCM"
              body="Authenticated encryption verifies both confidentiality and integrity. Tampering is detected on download."
            />
            <FeatureCard
              icon={Zap}
              title="Adaptive compression"
              body="Brotli for text-like payloads, Gzip for binaries. Level tunable from Fast to Maximum."
            />
            <FeatureCard
              icon={KeyRound}
              title="Key stays in the URL"
              body="The decryption key is delivered via the URL fragment — never sent to the server on subsequent requests."
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent, success }) {
  return (
    <div className={`stat-tile ${accent ? 'accent' : ''} ${success ? 'success' : ''}`}>
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{value}</span>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body }) {
  return (
    <div className="feature-card card card-hover">
      <div className="feature-icon">
        <Icon size={20} />
      </div>
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  );
}
