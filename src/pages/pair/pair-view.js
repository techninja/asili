/**
 * Pair view — viewer lands here after scanning QR code.
 * Decodes offer from URL, generates answer code, waits for connection.
 * @module pages/pair
 */

import { html, define, router } from 'hybrids';
import '#molecules/share-viewer/share-viewer.js';
import { appHeader } from '#molecules/app-header/app-header.js';

export default define({
  tag: 'pair-view',
  [router.connect]: { url: '/pair/:offer' },
  offer: '',
  render: {
    value: ({ offer }) => html`
      <div class="app-layout">
        ${appHeader({ badge: 'pair' })}
        <main class="app-layout__content pair-view">
          ${offer
            ? html`<share-viewer offer="${offer}"></share-viewer>`
            : html`<p class="pair-view__error">
                No connection offer found. Scan the QR code again.
              </p>`}
        </main>
      </div>
    `,
    shadow: false,
  },
});
