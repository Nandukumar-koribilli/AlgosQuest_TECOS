import { Link } from 'react-router-dom';
import { CircleAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: '4rem', textAlign: 'center' }}>
      <div className="card animate-fade-in" style={{ maxWidth: 460, margin: '0 auto' }}>
        <CircleAlert size={40} style={{ color: 'var(--warning)' }} />
        <h2 style={{ marginTop: '1rem' }}>Page not found</h2>
        <p style={{ marginTop: '.5rem' }}>
          The page you're looking for doesn't exist or has moved.
        </p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
