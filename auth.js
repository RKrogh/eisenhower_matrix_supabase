import { supabase } from './supabase.js';
import { initApp } from './app.js';

// ---- DOM References ----
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const magicLinkForm = document.getElementById('magic-link-form');
const emailInput = document.getElementById('email-input');
const sendLinkBtn = document.getElementById('send-link-btn');
const authMessage = document.getElementById('auth-message');
const userEmailSpan = document.getElementById('user-email');
const signOutBtn = document.getElementById('sign-out-btn');

// ---- Auth State ----

function showAuth() {
  authView.hidden = false;
  appView.hidden = true;
}

function showApp(user) {
  authView.hidden = true;
  appView.hidden = false;
  userEmailSpan.textContent = user.email;
  initApp();
}

function showMessage(text, type) {
  authMessage.textContent = text;
  authMessage.className = 'auth-message ' + type;
  authMessage.hidden = false;
}

// ---- Magic Link ----

magicLinkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  if (!email) return;

  sendLinkBtn.disabled = true;
  sendLinkBtn.textContent = 'Sending...';

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) {
    showMessage(error.message, 'error');
  } else {
    showMessage('Check your email for the magic link.', 'success');
  }

  sendLinkBtn.disabled = false;
  sendLinkBtn.textContent = 'Send Magic Link';
});

// ---- Sign Out ----

signOutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  showAuth();
});

// ---- Session Check on Load ----

supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    showApp(session.user);
  } else {
    showAuth();
  }
});

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    showApp(session.user);
  } else {
    showAuth();
  }
})();
