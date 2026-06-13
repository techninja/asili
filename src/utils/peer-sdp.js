/**
 * Peer SDP — encode/decode WebRTC session descriptions for QR/URL transport.
 * Uses base64url encoding of the full SDP to avoid reconstruction issues.
 * @module utils/peer-sdp
 */

/**
 * Compress an RTCSessionDescription into a base64url string.
 * Encodes the full SDP to avoid browser-specific reconstruction issues.
 */
export function compress(desc) {
  const payload = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  return btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decompress a base64url string back into an RTCSessionDescription.
 */
export function decompress(encoded) {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const { type, sdp } = JSON.parse(atob(b64));
  return new RTCSessionDescription({ type, sdp });
}
