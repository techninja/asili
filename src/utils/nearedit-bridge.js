/**
 * NearEdit frame capture bridge.
 * When loaded inside a NearEdit iframe, listens for commands and posts back frames.
 * @module utils/nearedit-bridge
 */

if (window.self !== window.top) {
  window.addEventListener('message', async (e) => {
    if (e.data?.type !== 'nearedit') return;
    const { id, command, args } = e.data;

    if (command === 'navigate') {
      window.location.hash = args.route || '';
    } else if (command === 'scroll') {
      const el = args.selector ? document.querySelector(args.selector) : null;
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      else window.scrollTo({ top: args.y || 0, behavior: 'instant' });
    } else if (command === 'exec') {
      try { new Function(args.code)(); } catch {}
    } else if (command === 'wait') {
      await new Promise((r) => setTimeout(r, args.ms || 100));
    }

    // Capture frame after command settles
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const bitmap = await createImageBitmap(document.documentElement);
      e.source.postMessage({ type: 'nearedit-frame', id, bitmap }, '*', [bitmap]);
    } catch {
      // Fallback: signal ready without bitmap (parent can retry)
      e.source.postMessage({ type: 'nearedit-frame', id, error: 'capture failed' }, '*');
    }
  });

  // Signal ready
  window.parent.postMessage({ type: 'nearedit-ready' }, '*');
}
