import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  Trash2,
  Lock,
  Clock,
  BarChart3,
  AlertCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Search,
  Copy,
  CheckCircle2,
  FileText,
  Package,
  HardDriveDownload,
  Sparkles,
  KeyRound
} from 'lucide-react';
import { api } from '../lib/api';
import { vault } from '../lib/vault';
import { getFileIcon } from '../lib/fileIcon';
import { useToast } from '../lib/toastContext';
import './Transfers.css';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'exhausted', label: 'Exhausted' }
];

export default function Transfers() {
  const toast = useToast();
  const [transfers, setTransfers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [transfersRes, statsRes] = await Promise.all([
        api.get('/transfers', { params: { includeInactive: true, limit: 100 } }),
        api.get('/transfers/stats/overview')
      ]);
      setTransfers(transfersRes.data.transfers || []);
      setStats(statsRes.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load transfers. Is the server running?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transfer permanently?')) return;
    setDeleting(id);
    try {
      await api.delete(`/transfers/${id}`);
      vault.remove(id);
      setTransfers((prev) => prev.filter((t) => t.id !== id));
      toast.success('Transfer deleted');
    } catch (err) {
      console.error(err);
      toast.error('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const handleCopy = async (id) => {
    const url = vault.buildShareUrl(id);
    if (!url) {
      toast.error('No saved decryption key for this transfer — copy from your original share.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success('Share link copied');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transfers.filter((t) => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (!q) return true;
      return (
        t.filename.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [transfers, query, filter]);

  if (loading) {
    return (
      <div className="transfers-page">
        <div className="container">
          <div className="loading-state">
            <Loader2 className="animate-spin" size={40} />
            <p>Loading transfers…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="transfers-page">
      <div className="container">
        <div className="page-header animate-fade-in">
          <div>
            <h1>Transfer history</h1>
            <p>Manage everything you've encrypted and sent.</p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={refreshing}
            aria-label="Refresh"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
            />
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div className="error-banner animate-fade-in">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {stats && (
          <div className="stats-grid animate-fade-in">
            <StatCard
              icon={Package}
              label="Active"
              value={stats.activeTransfers}
              hint={`${stats.totalUploads} total`}
            />
            <StatCard
              icon={HardDriveDownload}
              label="Downloads"
              value={stats.totalDownloads}
              hint="Across all transfers"
            />
            <StatCard
              icon={BarChart3}
              label="Avg savings"
              value={stats.avgSavingsPercent}
              hint="Per file"
              accent
            />
            <StatCard
              icon={Sparkles}
              label="Space saved"
              value={stats.totalSaved}
              hint={`from ${stats.totalOriginalSize}`}
              success
            />
          </div>
        )}

        <div className="toolbar animate-fade-in">
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search by name or ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="filter-chips">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`filter-chip ${filter === f.value ? 'active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state card animate-fade-in">
            <FileText size={40} />
            <h3>{transfers.length === 0 ? 'No transfers yet' : 'Nothing matches your filters'}</h3>
            <p>
              {transfers.length === 0
                ? 'Upload your first file to see it appear here.'
                : 'Try clearing the search or changing the status filter.'}
            </p>
            {transfers.length === 0 && (
              <Link to="/" className="btn btn-primary">Upload a file</Link>
            )}
          </div>
        ) : (
          <div className="transfers-list animate-fade-in">
            {filtered.map((transfer) => (
              <TransferRow
                key={transfer.id}
                transfer={transfer}
                onDelete={handleDelete}
                onCopy={handleCopy}
                deleting={deleting === transfer.id}
                copied={copiedId === transfer.id}
                hasKey={!!vault.get(transfer.id)}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent, success }) {
  return (
    <div className={`stat-card card card-hover ${accent ? 'accent' : ''} ${success ? 'success' : ''}`}>
      <div className="stat-icon">
        <Icon size={18} />
      </div>
      <div className="stat-content">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
        {hint && <span className="stat-hint">{hint}</span>}
      </div>
    </div>
  );
}

function TransferRow({
  transfer,
  onDelete,
  onCopy,
  deleting,
  copied,
  hasKey,
  formatDate
}) {
  const FileIcon = getFileIcon(transfer.filename, transfer.mimeType);
  const shareUrl = hasKey ? vault.buildShareUrl(transfer.id) : null;

  return (
    <div className={`transfer-item card card-hover status-${transfer.status}`}>
      <div className="transfer-icon">
        {/* getFileIcon only picks from a fixed map of module-level lucide
            components, so this is a stable reference — not a component
            created during render. */}
        {/* eslint-disable-next-line react-hooks/static-components */}
        <FileIcon size={22} />
      </div>

      <div className="transfer-info">
        <div className="transfer-name" title={transfer.filename}>
          {transfer.filename}
          <span className={`status-badge status-${transfer.status}`}>
            {transfer.status}
          </span>
        </div>
        <div className="transfer-meta">
          <span>{transfer.originalSize}</span>
          <span className="separator">→</span>
          <span className="compressed">{transfer.compressedSize}</span>
          <span className="savings">({transfer.spaceSavedPercent} saved)</span>
          <span className="dot">·</span>
          <span className="algo">{(transfer.algorithm || 'gzip').toUpperCase()}</span>
        </div>
      </div>

      <div className="transfer-stats">
        <div className="stat-item">
          <Download size={13} />
          <span>{transfer.downloadCount} / {transfer.maxDownloads || '∞'}</span>
        </div>
        {transfer.hasPassword && (
          <div className="stat-item protected">
            <Lock size={13} />
            <span>Protected</span>
          </div>
        )}
        <div className="stat-item">
          <Clock size={13} />
          <span>{formatDate(transfer.createdAt)}</span>
        </div>
        {!hasKey && (
          <div className="stat-item warning" title="No decryption key saved locally">
            <KeyRound size={13} />
            <span>No key</span>
          </div>
        )}
      </div>

      <div className="transfer-actions">
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => onCopy(transfer.id)}
          title={hasKey ? 'Copy share link' : 'No key stored locally'}
          disabled={!hasKey}
          aria-label="Copy share link"
        >
          {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
        </button>
        {shareUrl && (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-icon"
            title="Open share link"
          >
            <ExternalLink size={16} />
          </a>
        )}
        <button
          type="button"
          className="btn btn-icon danger"
          onClick={() => onDelete(transfer.id)}
          disabled={deleting}
          title="Delete transfer"
        >
          {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
        </button>
      </div>
    </div>
  );
}
