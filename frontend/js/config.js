/* DMS frontend runtime config. Must be loaded BEFORE all other DMS scripts.
 * - Default: API base is '' => relative '/api/...' (same origin that served the page).
 * - Live Server (ports 5500/5501): API base points to the Node backend on this host,
 *   using DEV_BACKEND_PORT. Change only this value for a different dev backend port.
 * - Optional override: set window.DMS_API_BASE before this script (e.g. 'https://host:port').
 * No IP address or production port is hard-coded here. */
(function () {
  var DEV_BACKEND_PORT = '3000';
  var LIVE_SERVER_PORTS = ['5500', '5501'];
  if (typeof window.DMS_API_BASE === 'string') return;
  var isLiveServer = LIVE_SERVER_PORTS.indexOf(String(location.port)) !== -1;
  window.DMS_API_BASE = isLiveServer
    ? location.protocol + '//' + location.hostname + ':' + DEV_BACKEND_PORT
    : '';
})();
