import { io } from 'socket.io-client';
import { API_URL } from './api';

// Progress events are fire-and-forget: anything emitted before the socket is
// ready is lost for good. These helpers let a caller make sure the connection
// (and the room membership) is established *before* starting the request whose
// progress it wants to watch, rather than racing it.
const CONNECT_TIMEOUT = 4000;

export function createSocket() {
  return io(API_URL, { transports: ['websocket', 'polling'] });
}

/**
 * Resolve with the socket id once connected, or null if the connection does
 * not come up in time. Progress reporting is cosmetic, so a failure here must
 * never block the transfer itself.
 */
export function waitForSocketId(socket) {
  if (socket.connected) return Promise.resolve(socket.id);

  return new Promise((resolve) => {
    const done = (id) => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      resolve(id);
    };
    const onConnect = () => done(socket.id);
    const onError = () => done(null);
    const timer = setTimeout(() => done(null), CONNECT_TIMEOUT);

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

/**
 * Join a transfer room and wait for the server to confirm, so no event can be
 * emitted into the room before we are in it.
 */
export async function joinTransfer(socket, transferId) {
  const id = await waitForSocketId(socket);
  if (!id) return false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), CONNECT_TIMEOUT);
    socket.emit('join-transfer', transferId, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}
