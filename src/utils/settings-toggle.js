/**
 * Settings drawer toggle — works from any page.
 * @module utils/settings-toggle
 */

/** Toggle the settings drawer open/closed. */
export function toggleSettings() {
  let drawer = document.querySelector('settings-drawer');
  if (!drawer) {
    // Create one if it doesn't exist yet
    drawer = document.createElement('settings-drawer');
    document.body.appendChild(drawer);
  }
  // @ts-ignore — Hybrids property
  drawer.open = !drawer.open;
}
