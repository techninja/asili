/**
 * Beta app view — individual selector + trait grid + upload.
 * Single-page app: switch individual context, scores update in place.
 * @module pages/beta
 */

import { html, define, router } from 'hybrids';
// @ts-ignore
import '#molecules/upload-zone/upload-zone.js';
// @ts-ignore
import '#molecules/individual-setup/individual-setup.js';
// @ts-ignore
import '#organisms/trait-grid/trait-grid.js';
// @ts-ignore
import '#organisms/scoring-screen/scoring-screen.js';
// @ts-ignore
import '#organisms/settings-drawer/settings-drawer.js';
// @ts-ignore
import '#molecules/floating-bar/floating-bar.js';
import {
  individualSelector,
  appSubHeader,
  appContent,
  uploadContent,
  uploadPanel,
} from './beta-render.js';
import { handleSwitch, closeOrToggleUpload, cancelSetup } from './beta-actions.js';
import { appHeader } from '#molecules/app-header/app-header.js';
import { appFooter } from '#molecules/app-footer/app-footer.js';
import { toggleSettings } from '#utils/settings-toggle.js';
import { exitViewerMode } from '#utils/peer-state.js';
import TraitDetailView from '#pages/trait-detail/trait-detail-view.js';
import { connectInit } from './beta-init.js';

export default define({
  tag: 'beta-view',
  [router.connect]: { url: '/beta', stack: [TraitDetailView] },
  individuals: { value: [], connect: () => {} },
  activeId: '',
  resultCount: 0,
  _switchEpoch: 0,
  parseStatus: { value: '', connect: () => {} },
  parsedCount: { value: 0, connect: () => {} },
  parsedFormat: { value: '', connect: () => {} },
  parsedFilename: { value: '', connect: () => {} },
  parseError: { value: '', connect: () => {} },
  scoringStatus: { value: '', connect: () => {} },
  scoringTrait: { value: '', connect: () => {} },
  scoringCurrent: { value: 0, connect: () => {} },
  scoringTotal: { value: 0, connect: () => {} },
  scoringChrDone: { value: 0, connect: () => {} },
  scoringChrTotal: { value: 0, connect: () => {} },
  scoringIndividualCount: { value: 0, connect: () => {} },
  scoringCurrentId: { value: '', connect: () => {} },
  _scoringRate: { value: 0, connect: () => {} },
  _scoringEta: { value: 0, connect: () => {} },
  scoringTick: {
    value: 0,
    connect: (host) => {
      const iv = setInterval(() => {
        if (host.scoringStatus === 'scoring') host.scoringTick++;
      }, 2000);
      return () => clearInterval(iv);
    },
  },
  scoringScreen: {
    value: false,
    connect: (host) => {
      const onFsChange = () => {
        if (!document.fullscreenElement && host.scoringScreen) {
          host.scoringScreen = false;
        }
      };
      document.addEventListener('fullscreenchange', onFsChange);
      return () => document.removeEventListener('fullscreenchange', onFsChange);
    },
  },
  showUpload: { value: false, connect: () => {} },
  closingUpload: false,
  activeTab: {
    value: 'traits',
    observe(host, val) {
      sessionStorage.setItem('asili-source-tab', val);
    },
    connect(host) {
      const saved = sessionStorage.getItem('asili-source-tab');
      if (saved && ['traits', 'table', 'report'].includes(saved)) host.activeTab = saved;
    },
  },
  _variants: { value: [], connect: () => {} },
  _manifest: { value: '', connect: () => {} },
  _remoteViewing: false,
  _reconnect: false,
  _init: { value: false, connect: connectInit },
  render: {
    value: (host) => {
      const list = Array.isArray(host.individuals) ? host.individuals : [];
      const hasData = list.length > 0;
      const showPanel = !host._remoteViewing && hasData && (host.showUpload || host.parseStatus);
      return html`
        <div class="app-layout">
          <div class="app-layout__sticky-top">
            ${appHeader({
              badge: host._remoteViewing ? 'viewing' : 'beta',
              onSettings: host._remoteViewing
                ? null
                : (h) => {
                    h.showUpload = false;
                    toggleSettings();
                  },
              center: hasData ? individualSelector(host, list, handleSwitch) : html``,
              trailing: host._remoteViewing
                ? html`<button
                    class="app-header__link"
                    onclick="${disconnectViewer}"
                    title="Disconnect"
                  >
                    <app-icon name="x"></app-icon>
                  </button>`
                : hasData
                  ? html`<button
                      class="app-header__link ${showPanel ? 'app-header__link--active' : ''}"
                      onclick="${closeOrToggleUpload}"
                      title="Add individual"
                    >
                      <app-icon name="user-plus"></app-icon>
                    </button>`
                  : html``,
            })}
            ${showPanel || host.closingUpload ? uploadPanel(host, cancelSetup) : html``}
            ${hasData ? appSubHeader(host) : html``}
          </div>
          <main class="app-layout__content">
            ${host._reconnect
              ? reconnectContent(host)
              : hasData
                ? appContent(host)
                : uploadContent(host, cancelSetup)}
          </main>
          ${appFooter()}
          ${host._remoteViewing
            ? html``
            : html`
                <scoring-screen
                  visible="${host.scoringScreen}"
                  traitName="${host.scoringTrait}"
                  done="${host.scoringCurrent}"
                  total="${host.scoringTotal}"
                  chrDone="${host.scoringChrDone}"
                  chrTotal="${host.scoringChrTotal}"
                  rate="${host._scoringRate}"
                  eta="${host._scoringEta}"
                ></scoring-screen>
                <floating-bar onfocus-mode="${openScoringScreen}"></floating-bar>
              `}
        </div>
      `;
    },
    shadow: false,
  },
});

/** @param {object} host */
function openScoringScreen(host) {
  host.scoringScreen = true;
  document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Disconnect from remote source and return to local state. */
function disconnectViewer(host) {
  exitViewerMode();
  host._remoteViewing = false;
  host._reconnect = false;
  host.individuals = [];
  host.activeId = '';
  host.resultCount = 0;
}

/** Reconnect prompt shown after a page refresh killed the connection. */
function reconnectContent(host) {
  return html`
    <div class="beta-view__reconnect">
      <p>📡 Connection lost</p>
      <p class="beta-view__reconnect-hint">
        The page was refreshed and the peer connection closed. Scan the QR code on the source device
        again to reconnect.
      </p>
      <button class="btn" onclick="${disconnectViewer}">Back to My Data</button>
    </div>
  `;
}
