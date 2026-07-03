// vinline — email OAuth (Gmail via GIS, Outlook via MSAL)
import { GOOGLE_CLIENT_ID, MICROSOFT_CLIENT_ID, msalConfig } from './config.js';
import { setModalLoading, setModalError, resetEmailModal, setOpenHintScanning, showInboxScanning, showInboxEmpty, scanInbox, scanOutlookInbox } from './inbox.js';
import { closeModal, openModal, openHint, settings, collapsed, expanded, isExpanded } from './ui.js';
// EMAIL STATE
let emailConnected = false;
let emailProvider = null;
let emailAddress = '';
let gmailToken = null;
let outlookToken = null;
let _msalInstance = null;
// ─── EMAIL AUTH ───────────────────────────────────────────────────────────────

function connectGmail() {
  if (!window.google?.accounts?.oauth2) {
    setModalError('Google sign-in is still loading. Please try again in a moment.');
    return;
  }
  setModalLoading('Opening Google sign-in…');
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    callback: async (response) => {
      if (response.error) {
        setModalError(response.error === 'access_denied' ? 'Access denied. Please try again.' : 'Sign-in failed: ' + response.error);
        return;
      }
      gmailToken = response.access_token;
      setModalLoading('Fetching account info…');
      try {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: 'Bearer ' + response.access_token }
        });
        const user = await userRes.json();
        setEmailConnected('Gmail', user.email || 'gmail account');
      } catch (e) {
        setEmailConnected('Gmail', 'gmail account');
      }
    },
    // Fires when the Google popup is blocked or dismissed without completing —
    // without this the modal stayed stuck in its loading state forever.
    error_callback: (err) => {
      if (err && err.type === 'popup_closed') resetEmailModal();
      else setModalError('Sign-in could not start' + (err?.type ? ' (' + err.type + ')' : '') + '. Check popup blockers and try again.');
    }
  });
  client.requestAccessToken();
}

async function connectOutlook() {
  if (!window.msal) {
    setModalError('Microsoft sign-in is still loading. Please try again in a moment.');
    return;
  }
  if (!MICROSOFT_CLIENT_ID || MICROSOFT_CLIENT_ID === 'YOUR_AZURE_CLIENT_ID') {
    setModalError('Outlook not configured yet — Azure client ID needed. See Obsidian setup docs.');
    return;
  }
  setModalLoading('Opening Microsoft sign-in…');
  try {
    if (!_msalInstance) {
      _msalInstance = new msal.PublicClientApplication(msalConfig);
      await _msalInstance.initialize();
    }
    const tokenResponse = await _msalInstance.acquireTokenPopup({
      scopes: ['openid', 'profile', 'User.Read', 'Mail.Read'],
      prompt: 'select_account'
    });
    outlookToken = tokenResponse.accessToken;
    const account = _msalInstance.getAllAccounts()[0];
    const email = account?.username || 'outlook account';
    setEmailConnected('Outlook', email);
  } catch (e) {
    if (e.errorCode === 'user_cancelled' || e.name === 'BrowserAuthError') {
      resetEmailModal();
    } else {
      setModalError('Sign-in failed: ' + (e.errorMessage || e.message || 'unknown error'));
    }
  }
}

function setEmailConnected(provider, email) {
  emailConnected = true;
  emailProvider = provider;
  emailAddress = email;

  // Update left bracket: hide unconnected, show connected
  document.getElementById('emailUnconnectedZone').style.display = 'none';
  document.getElementById('emailConnectedZone').style.display = '';
  const shortEmail = email.length > 16 ? email.split('@')[0] + '\n@' + email.split('@')[1] : email;
  document.getElementById('emailDisplayName').textContent = shortEmail;
  document.getElementById('emailProviderLabel').textContent = provider;

  // Update topbar badge
  document.getElementById('topbarStatus').style.display = 'flex';
  document.getElementById('topbarStatusText').textContent = email.split('@')[0];

  // Update settings panel for the correct provider
  if (provider === 'Gmail') {
    document.getElementById('settingsGmailSub').textContent = email;
    document.getElementById('settingsGmailRight').innerHTML = '<span class="conn-label">connected</span><button class="btn btn-sm" onclick="disconnectGmail()">Disconnect</button>';
  } else {
    document.getElementById('settingsOutlookSub').textContent = email;
    document.getElementById('settingsOutlookRight').innerHTML = '<span class="conn-label">connected</span><button class="btn btn-sm" onclick="disconnectOutlook()">Disconnect</button>';
  }

  // Close modal, start scan
  closeModal('modal-l');
  setOpenHintScanning();
  showInboxScanning();
  if (provider === 'Gmail') {
    scanInbox(gmailToken);
  } else {
    scanOutlookInbox(outlookToken);
  }
}

function resetGmailConnectionUI() {
  gmailToken = null; emailConnected = false; emailProvider = null; emailAddress = '';
  document.getElementById('emailUnconnectedZone').style.display = '';
  document.getElementById('emailConnectedZone').style.display = 'none';
  document.getElementById('topbarStatus').style.display = 'none';
  document.getElementById('settingsGmailSub').textContent = 'Not connected';
  document.getElementById('settingsGmailRight').innerHTML = '<button class="btn btn-sm" onclick="openEmailConnect(\'Gmail\')">Connect →</button>';
}

function disconnectGmail() {
  if (gmailToken) google.accounts.oauth2.revoke(gmailToken, () => {});
  resetGmailConnectionUI();
  openHint.innerHTML = '↓ tap to open';
  showInboxEmpty();
  document.getElementById('inboxCount').textContent = '—';
}

function disconnectOutlook() {
  outlookToken = null; _msalInstance = null;
  if (emailProvider === 'Outlook') {
    emailConnected = false; emailProvider = null; emailAddress = '';
    document.getElementById('emailUnconnectedZone').style.display = '';
    document.getElementById('emailConnectedZone').style.display = 'none';
    document.getElementById('topbarStatus').style.display = 'none';
    openHint.innerHTML = '↓ tap to open';
    showInboxEmpty();
    document.getElementById('inboxCount').textContent = '—';
  }
  document.getElementById('settingsOutlookSub').textContent = 'Not connected';
  document.getElementById('settingsOutlookRight').innerHTML = '<button class="btn btn-sm" onclick="openEmailConnect(\'Outlook\')">Connect →</button>';
}

function openEmailConnect(provider) {
  // From settings: collapse back and open the email modal
  settings.style.display = 'none';
  document.getElementById('settingsBtn').classList.remove('active');
  if (!isExpanded) collapsed.style.display = 'flex'; else expanded.style.display = 'block';
  openModal('modal-l');
}

export {
  emailConnected, emailProvider, emailAddress, gmailToken, outlookToken,
  connectGmail, connectOutlook, setEmailConnected, resetGmailConnectionUI,
  disconnectGmail, disconnectOutlook, openEmailConnect
};
