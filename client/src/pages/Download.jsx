import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import {
  Download as DownloadIcon,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Shield,
  Clock,
  DownloadCloud,
  ArrowRight,
  Eye,
  EyeOff,
  Home
} from 'lucide-react';
import { api } from '../lib/api';
import { createSocket, joinTransfer } from '../lib/socket';
import { getFileIcon } from '../lib/fileIcon';
import { useToast } from '../lib/toastContext';
import './Download.css';

const STAGE_LABEL = {
  reading: 'Reading encrypted payload…',
  decrypting: 'Decrypting (AES-256-GCM)…',
  decompressing: 'Decompressing…',
  complete: 'Complete',
  '': 'Preparing…'
};

export default function Download() {
  const { id } = useParams();
  const location = useLocation();
  const toast = useToast();

  const [transferInfo, setTransferInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState(null);
  const [inlineError, setInlineError] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState('');
  const [downloadComplete, setDownloadComplete] = useState(false);

  const socketRef = useRef(null);

  const params = useMemo(() => {
    const hash = location.hash.startsWith('#')
      ? location.hash.substring(1)
      : location.hash;
    const search = new URLSearchParams(hash);
    return { key: search.get('key'), tag: search.get('tag') };
  }, [location.hash]);

  const fetchTransferInfo = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    try {
      const response = await api.get(`/download/${id}/info`);
      setTransferInfo(response.data);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        (err.response?.status === 404
          ? 'Transfer not found. It may have been deleted or the link is invalid.'
          : 'Failed to load transfer information.');
      setFatalError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTransferInfo();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [fetchTransferInfo]);

  const handleDownload = async () => {
    if (!params.key || !params.tag) {
      setInlineError('Invalid download link. Missing decryption key.');
      return;
    }
    if (transferInfo?.hasPassword && !password) {
      setInlineError('Please enter the password to decrypt this file.');
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);
    setDownloadStage('');
    setInlineError(null);

    const socket = createSocket();
    socketRef.current = socket;
    socket.on('download-progress', (data) => {
      if (data.transferId !== id) return;
      setDownloadProgress(data.progress || 0);
      setDownloadStage(data.stage || '');
    });

    // Wait until the server confirms we are in the room, otherwise the first
    // stages can be emitted before the join lands and are lost.
    await joinTransfer(socket, id);

    try {
      const response = await api.post(
        `/download/${id}`,
        {
          password: password || undefined,
          decryptionKey: params.key,
          authTag: params.tag
        },
        {
          responseType: 'blob',
          onDownloadProgress: (progressEvent) => {
            if (!progressEvent.total) return;
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setDownloadProgress((p) => Math.min(100, Math.max(p, percent)));
          }
        }
      );

      const contentType =
        response.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = transferInfo.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoking synchronously cancels the save in Firefox/Safari, which read
      // the blob after the click handler returns.
      setTimeout(() => window.URL.revokeObjectURL(url), 10_000);

      setDownloadComplete(true);
      setDownloadProgress(100);
      setDownloadStage('complete');
      toast.success('File decrypted and saved');
    } catch (err) {
      console.error('Download error:', err);
      let message = 'Download failed. Please try again.';
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          message = parsed.error || parsed.message || message;
        } else {
          message =
            err.response?.data?.error ||
            err.response?.data?.message ||
            message;
        }
      } catch {
        /* ignore parse errors */
      }
      if (err.response?.status === 401) {
        message = message.includes('password') ? message : 'Invalid password. Please try again.';
      }
      setInlineError(message);
      toast.error(message);
    } finally {
      setDownloading(false);
      socket.disconnect();
      socketRef.current = null;
    }
  };

  if (loading) {
    return (
      <div className="download-page">
        <div className="container">
          <div className="loading-state">
            <Loader2 className="animate-spin" size={40} />
            <p>Loading transfer…</p>
          </div>
        </div>
      </div>
    );
  }

  if (fatalError) {
    return (
      <div className="download-page">
        <div className="container">
          <div className="error-state card animate-fade-in">
            <AlertCircle size={40} />
            <h2>Transfer unavailable</h2>
            <p>{fatalError}</p>
            <Link to="/" className="btn btn-primary mt-lg">
              <Home size={16} /> Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const FileIcon = getFileIcon(transferInfo.filename, transferInfo.mimeType);
  const stageLabel = STAGE_LABEL[downloadStage] || 'Processing…';

  return (
    <div className="download-page">
      <div className="container">
        <div className="download-card card animate-fade-in-up">
          {downloadComplete ? (
            <div className="download-success">
              <div className="success-icon">
                <CheckCircle2 size={40} />
              </div>
              <h2>Download complete</h2>
              <p>Your file was decrypted locally and saved to your device.</p>
              <div className="download-success-actions">
                <button className="btn btn-secondary" onClick={() => setDownloadComplete(false)}>
                  Download again
                </button>
                <Link to="/" className="btn btn-primary">
                  Send a file <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="download-header">
                <div className="file-icon-large">
                  <FileIcon size={30} />
                </div>
                <div className="file-details">
                  <h2 className="file-name" title={transferInfo.filename}>{transferInfo.filename}</h2>
                  <div className="file-meta">
                    <span className="meta-item">
                      <DownloadCloud size={12} />
                      {transferInfo.originalSize}
                    </span>
                    <span className="meta-item">
                      <Clock size={12} />
                      {new Date(transferInfo.createdAt).toLocaleDateString()}
                    </span>
                    {transferInfo.hasPassword && (
                      <span className="meta-item protected">
                        <Lock size={12} />
                        Password
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="download-info">
                <InfoRow label="Original size" value={transferInfo.originalSize} />
                <InfoRow label="Encrypted size" value={transferInfo.compressedSize} />
                <InfoRow
                  label="Space saved"
                  value={`${transferInfo.spaceSaved} · ${transferInfo.spaceSavedPercent}`}
                  success
                />
                <InfoRow label="Algorithm" value={transferInfo.algorithm?.toUpperCase() || 'GZIP'} />
                <InfoRow
                  label="Downloads"
                  value={`${transferInfo.downloadCount} / ${transferInfo.maxDownloads || '∞'}`}
                />
                {transferInfo.expiresAt && (
                  <InfoRow
                    label="Expires"
                    value={new Date(transferInfo.expiresAt).toLocaleString()}
                  />
                )}
              </div>

              <div className="security-badge">
                <Shield size={14} />
                <span>End-to-end encrypted with AES-256-GCM</span>
              </div>

              {transferInfo.hasPassword && (
                <div className="password-section">
                  <label>Password</label>
                  <div className="input-with-toggle">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter the password to decrypt"
                      onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
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
              )}

              {inlineError && (
                <div className="error-message">
                  <AlertCircle size={16} />
                  <span>{inlineError}</span>
                </div>
              )}

              {downloading ? (
                <div className="download-progress">
                  <div className="progress-header">
                    <Loader2 className="animate-spin" size={16} />
                    <span>{stageLabel}</span>
                    <span className="progress-percent">{downloadProgress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${downloadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-primary download-btn"
                  onClick={handleDownload}
                  disabled={!params.key || !params.tag}
                  type="button"
                >
                  <DownloadIcon size={16} />
                  <span>Decrypt &amp; Download</span>
                </button>
              )}

              {(!params.key || !params.tag) && (
                <div className="link-warning">
                  This link is missing its decryption key. Ask the sender to share the full URL,
                  including the part after <span className="mono">#key=</span>.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, success }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className={`info-value ${success ? 'success' : ''}`}>{value}</span>
    </div>
  );
}
