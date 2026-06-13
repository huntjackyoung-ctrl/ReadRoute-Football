import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  get,
  getDatabase,
  onValue,
  ref,
  set,
  update
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const status = document.querySelector("#cloudSyncStatus");
const signInButton = document.querySelector("#cloudSignInButton");
const signOutButton = document.querySelector("#cloudSignOutButton");
const shareButton = document.querySelector("#workspaceShareButton");
const shareDialog = document.querySelector("#workspaceShareDialog");
const inviteRole = document.querySelector("#workspaceInviteRole");
const createInviteButton = document.querySelector("#createWorkspaceInviteButton");
const inviteResult = document.querySelector("#workspaceInviteResult");
const inviteLink = document.querySelector("#workspaceInviteLink");
const copyInviteButton = document.querySelector("#copyWorkspaceInviteButton");
const memberList = document.querySelector("#workspaceMemberList");
const config = window.READROUTE_FIREBASE_CONFIG;
const workspaceStorageKey = "readroute-active-workspace";
let activeUser = null;
let activeWorkspaceId = null;
let activeRole = null;
let applyingRemote = false;
let uploadTimer = null;
let stopRemoteListener = null;
let stopMemberListener = null;

function setStatus(message) {
  if (status) status.textContent = message;
}

function inviteParameters() {
  const params = new URLSearchParams(window.location.search);
  return {
    workspaceId: params.get("workspace"),
    code: params.get("invite")
  };
}

function clearInviteParameters() {
  const url = new URL(window.location.href);
  url.searchParams.delete("workspace");
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url);
}

function personalWorkspaceId(uid) {
  return `personal-${uid}`;
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
    if (!activeUser || !activeWorkspaceId || activeRole === "viewer"
      || applyingRemote || !snapshot) return;
    setStatus("Saving shared workspace...");
    await set(ref(database, `workspaces/${activeWorkspaceId}/playbook`), {
      ...snapshot,
      cloudUpdatedAt: new Date().toISOString()
    });
    setStatus(`${activeRole === "owner" ? "Owner" : "Editor"} workspace saved`);
  }

  async function ensurePersonalWorkspace(user) {
    const userState = (await get(ref(database, `users/${user.uid}`))).val() || {};
    if (userState.activeWorkspace) return userState.activeWorkspace;
    const workspaceId = personalWorkspaceId(user.uid);
    const workspaceRef = ref(database, `workspaces/${workspaceId}`);
    const localPlaybook = window.ReadRouteCloud?.getSnapshot();
    await set(workspaceRef, {
      meta: {
        name: "My ReadRoute Workspace",
        ownerUid: user.uid,
        createdAt: new Date().toISOString()
      },
      members: {
        [user.uid]: {
          role: "owner",
          email: user.email || "",
          name: user.displayName || "Owner"
        }
      },
      playbook: userState.playbook || localPlaybook
    });
    await update(ref(database, `users/${user.uid}`), {
      activeWorkspace: workspaceId
    });
    return workspaceId;
  }

  async function claimInvite(user, workspaceId, code) {
    if (!workspaceId || !code) return null;
    const invite = (await get(ref(
      database,
      `workspaces/${workspaceId}/invites/${code}`
    ))).val();
    if (!invite?.role || invite.active === false) {
      throw new Error("This workspace invitation is invalid or expired.");
    }
    await set(ref(database, `workspaces/${workspaceId}/members/${user.uid}`), {
      role: invite.role,
      email: user.email || "",
      name: user.displayName || user.email || "Member",
      inviteCode: code,
      joinedAt: new Date().toISOString()
    });
    await update(ref(database, `users/${user.uid}`), {
      activeWorkspace: workspaceId
    });
    localStorage.setItem(workspaceStorageKey, workspaceId);
    clearInviteParameters();
    return workspaceId;
  }

  async function connectWorkspace(user) {
    const invitation = inviteParameters();
    let workspaceId;
    if (invitation.workspaceId && invitation.code) {
      workspaceId = await claimInvite(user, invitation.workspaceId, invitation.code);
    } else {
      workspaceId = localStorage.getItem(workspaceStorageKey);
      workspaceId ||= (await get(ref(
        database,
        `users/${user.uid}/activeWorkspace`
      ))).val();
      if (workspaceId) {
        const membership = (await get(ref(
          database,
          `workspaces/${workspaceId}/members/${user.uid}`
        ))).val();
        if (!membership) workspaceId = null;
      }
      workspaceId ||= await ensurePersonalWorkspace(user);
      localStorage.setItem(workspaceStorageKey, workspaceId);
    }

    const membership = (await get(ref(
      database,
      `workspaces/${workspaceId}/members/${user.uid}`
    ))).val();
    if (!membership?.role) throw new Error("You do not have access to this workspace.");

    activeWorkspaceId = workspaceId;
    activeRole = membership.role;
    window.ReadRouteCloud?.setAccessRole(activeRole);
    shareButton?.classList.toggle("hidden", activeRole !== "owner");
    setStatus(`${activeRole} workspace connected`);

    stopRemoteListener?.();
    let receivedFirstSnapshot = false;
    stopRemoteListener = onValue(
      ref(database, `workspaces/${workspaceId}/playbook`),
      async snapshot => {
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
            setStatus(`${activeRole} workspace loaded`);
          } finally {
            applyingRemote = false;
          }
          return;
        }
        if (!remote) return;
        applyingRemote = true;
        try {
          window.ReadRouteCloud?.applySnapshot(remote);
          setStatus(`${activeRole} workspace updated`);
        } finally {
          applyingRemote = false;
        }
      },
      error => {
        console.error("Workspace sync failed", error);
        setStatus("Workspace access failed");
      }
    );
  }

  function renderMembers(members = {}) {
    if (!memberList) return;
    memberList.innerHTML = `
      <p class="eyebrow">Members</p>
      ${Object.values(members).map(member => `
        <div class="workspace-member">
          <span>${member.name || member.email || "Member"}<br><small>${member.email || ""}</small></span>
          <small>${member.role || "viewer"}</small>
        </div>
      `).join("")}
    `;
  }

  signInButton?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Cloud sign-in failed", error);
      setStatus(error.message || "Cloud sign-in failed");
    }
  });

  signOutButton?.addEventListener("click", () => signOut(auth));

  shareButton?.addEventListener("click", () => {
    if (!activeWorkspaceId || activeRole !== "owner") return;
    inviteResult?.classList.add("hidden");
    stopMemberListener?.();
    stopMemberListener = onValue(
      ref(database, `workspaces/${activeWorkspaceId}/members`),
      snapshot => renderMembers(snapshot.val() || {})
    );
    shareDialog?.showModal();
  });

  createInviteButton?.addEventListener("click", async () => {
    if (!activeWorkspaceId || activeRole !== "owner") return;
    const code = crypto.randomUUID().replaceAll("-", "").slice(0, 18);
    await set(ref(database, `workspaces/${activeWorkspaceId}/invites/${code}`), {
      role: inviteRole?.value === "viewer" ? "viewer" : "editor",
      active: true,
      createdBy: activeUser.uid,
      createdAt: new Date().toISOString()
    });
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("workspace", activeWorkspaceId);
    url.searchParams.set("invite", code);
    inviteLink.value = url.toString();
    inviteResult?.classList.remove("hidden");
  });

  copyInviteButton?.addEventListener("click", async () => {
    if (!inviteLink?.value) return;
    await navigator.clipboard.writeText(inviteLink.value);
    copyInviteButton.textContent = "Copied";
    setTimeout(() => {
      copyInviteButton.textContent = "Copy Link";
    }, 1300);
  });

  window.addEventListener("readroute:playbook-saved", event => {
    if (!activeUser || applyingRemote || activeRole === "viewer") return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => uploadSnapshot(event.detail), 700);
  });

  onAuthStateChanged(auth, async user => {
    activeUser = user;
    stopRemoteListener?.();
    stopRemoteListener = null;
    stopMemberListener?.();
    stopMemberListener = null;
    signInButton?.classList.toggle("hidden", Boolean(user));
    signOutButton?.classList.toggle("hidden", !user);
    shareButton?.classList.add("hidden");
    if (!user) {
      activeWorkspaceId = null;
      activeRole = null;
      window.ReadRouteCloud?.setAccessRole("owner");
      setStatus("Saved on this computer");
      return;
    }
    setStatus("Connecting shared workspace...");
    try {
      await connectWorkspace(user);
    } catch (error) {
      console.error("Workspace connection failed", error);
      setStatus(error.message || "Workspace connection failed");
    }
  });
}
