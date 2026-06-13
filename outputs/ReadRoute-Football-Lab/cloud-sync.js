import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getDatabase,
  onValue,
  ref,
  set
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const status = document.querySelector("#cloudSyncStatus");
const signInButton = document.querySelector("#cloudSignInButton");
const signOutButton = document.querySelector("#cloudSignOutButton");
const config = window.READROUTE_FIREBASE_CONFIG;
let activeUser = null;
let applyingRemote = false;
let uploadTimer = null;
let stopRemoteListener = null;

function setStatus(message) {
  if (status) status.textContent = message;
}

if (!config?.apiKey || !config?.databaseURL) {
  setStatus("Cloud setup required");
  signInButton?.addEventListener("click", () => {
    window.alert("Cloud sync needs the one-time Firebase setup described in FIREBASE_SETUP.md.");
  });
} else {
  const firebaseApp = initializeApp(config);
  const auth = getAuth(firebaseApp);
  const database = getDatabase(firebaseApp);
  const provider = new GoogleAuthProvider();

  async function uploadSnapshot(snapshot = window.ReadRouteCloud?.getSnapshot()) {
    if (!activeUser || applyingRemote || !snapshot) return;
    setStatus("Saving to cloud...");
    await set(ref(database, `users/${activeUser.uid}/playbook`), {
      ...snapshot,
      cloudUpdatedAt: new Date().toISOString()
    });
    setStatus(`Cloud saved for ${activeUser.email || "your account"}`);
  }

  signInButton?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Cloud sign-in failed", error);
      setStatus("Cloud sign-in failed");
    }
  });

  signOutButton?.addEventListener("click", () => signOut(auth));

  window.addEventListener("readroute:playbook-saved", event => {
    if (!activeUser || applyingRemote) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => uploadSnapshot(event.detail), 700);
  });

  onAuthStateChanged(auth, user => {
    activeUser = user;
    stopRemoteListener?.();
    stopRemoteListener = null;
    signInButton?.classList.toggle("hidden", Boolean(user));
    signOutButton?.classList.toggle("hidden", !user);
    if (!user) {
      setStatus("Saved on this computer");
      return;
    }

    setStatus("Connecting cloud workspace...");
    const workspaceRef = ref(database, `users/${user.uid}/playbook`);
    let receivedFirstSnapshot = false;
    stopRemoteListener = onValue(workspaceRef, async snapshot => {
      const remote = snapshot.val();
      if (!receivedFirstSnapshot) {
        receivedFirstSnapshot = true;
        if (!remote) {
          await uploadSnapshot();
          return;
        }
        applyingRemote = true;
        try {
          window.ReadRouteCloud?.applySnapshot(remote);
          setStatus(`Cloud loaded for ${user.email || "your account"}`);
        } finally {
          applyingRemote = false;
        }
        return;
      }
      if (!remote) return;
      const localSavedAt = window.ReadRouteCloud?.getSavedAt?.() || "";
      if (remote.savedAt && remote.savedAt <= localSavedAt && !applyingRemote) {
        setStatus(`Cloud connected as ${user.email || "your account"}`);
        return;
      }
      applyingRemote = true;
      try {
        window.ReadRouteCloud?.applySnapshot(remote);
        setStatus(`Cloud loaded for ${user.email || "your account"}`);
      } finally {
        applyingRemote = false;
      }
    });
  });
}
