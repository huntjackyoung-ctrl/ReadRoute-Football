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
  onDisconnect,
  onValue,
  ref,
  runTransaction,
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
const activityPanel = document.querySelector("#workspaceActivityPanel");
const config = window.READROUTE_FIREBASE_CONFIG;
const workspaceStorageKey = "readroute-active-workspace";
const cloudClientStorageKey = "readroute-cloud-client";
const cloudClientId = sessionStorage.getItem(cloudClientStorageKey) || crypto.randomUUID();
sessionStorage.setItem(cloudClientStorageKey, cloudClientId);
let activeUser = null;
let activeWorkspaceId = null;
let activeRole = null;
let applyingRemote = false;
let uploadTimer = null;
let lastUploadedAt = "";
let pendingRemoteSnapshot = null;
let waitingForNoteBlur = false;
let stopRemoteListener = null;
let stopMemberListener = null;
let stopActivityListener = null;
let stopSessionListener = null;
let latestMembers = {};
let latestDailyActivity = {};
let latestSessions = {};
let activityView = "day";
let activityTimer = null;
let lastActivityTickAt = 0;
let pageWasVisible = document.visibilityState === "visible";
let sessionStartedAt = "";
let sessionSeconds = 0;

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

function noteEditorIsActive() {
  return document.activeElement?.matches?.(".note-editor textarea");
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function weekKey(date = new Date()) {
  return localDateKey(startOfWeek(date));
}

function displayDateLabel(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function recentDayKeys(count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return localDateKey(date);
  });
}

function recentWeekKeys(count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = startOfWeek(new Date());
    date.setDate(date.getDate() - (index * 7));
    return localDateKey(date);
  });
}

function formatDuration(seconds = 0) {
  const normalizedSeconds = Math.max(0, Number(seconds) || 0);
  if (normalizedSeconds > 0 && normalizedSeconds < 60) {
    return `${Math.max(1, Math.round(normalizedSeconds))}s`;
  }
  const totalMinutes = Math.round(normalizedSeconds / 60);
  if (totalMinutes < 1) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function dailySecondsFor(uid, dayKey) {
  return Number(latestDailyActivity?.[dayKey]?.[uid]?.seconds) || 0;
}

function weeklySecondsFor(uid, weekStartKey) {
  const [year, month, day] = weekStartKey.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return dailySecondsFor(uid, localDateKey(date));
  }).reduce((total, seconds) => total + seconds, 0);
}

function latestSeenAtFor(uid) {
  return Object.values(latestDailyActivity || {})
    .map(day => day?.[uid]?.lastSeenAt)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function activeSessionsFor(uid) {
  const now = Date.now();
  return Object.values(latestSessions || {})
    .filter(session => session?.uid === uid)
    .filter(session => session.active !== false)
    .filter(session => {
      const seenAt = Date.parse(session.lastSeenAt || "");
      return seenAt && now - seenAt < 75000;
    });
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

  function applyRemoteSnapshot(remote, message = `${activeRole} workspace updated`) {
    applyingRemote = true;
    try {
      window.ReadRouteCloud?.applySnapshot(remote);
      setStatus(message);
    } finally {
      applyingRemote = false;
    }
  }

  function applyPendingRemoteAfterNote() {
    if (waitingForNoteBlur || !noteEditorIsActive() || !pendingRemoteSnapshot) return;
    waitingForNoteBlur = true;
    document.activeElement.addEventListener("blur", () => {
      waitingForNoteBlur = false;
      const remote = pendingRemoteSnapshot;
      pendingRemoteSnapshot = null;
      if (remote) applyRemoteSnapshot(remote);
    }, { once: true });
    setStatus("Workspace update waiting until note editing is finished");
  }

  async function recordWorkspaceActivity(seconds = 0) {
    if (!activeUser || !activeWorkspaceId || !activeRole) return;
    const now = new Date().toISOString();
    const dayKey = localDateKey();
    const basePath = `workspaces/${activeWorkspaceId}/activity/daily/${dayKey}/${activeUser.uid}`;
    const roundedSeconds = Math.max(0, Math.round(Number(seconds) || 0));
    sessionSeconds += roundedSeconds;
    try {
      if (roundedSeconds > 0) {
        await runTransaction(
          ref(database, `${basePath}/seconds`),
          current => (Number(current) || 0) + roundedSeconds
        );
      }
      await update(ref(database, basePath), {
        name: activeUser.displayName || activeUser.email || "Member",
        email: activeUser.email || "",
        role: activeRole,
        lastSeenAt: now
      });
      await update(ref(database, `workspaces/${activeWorkspaceId}/sessions/${cloudClientId}`), {
        uid: activeUser.uid,
        name: activeUser.displayName || activeUser.email || "Member",
        email: activeUser.email || "",
        role: activeRole,
        active: true,
        startedAt: sessionStartedAt || now,
        lastSeenAt: now,
        currentDay: dayKey,
        sessionSeconds
      });
    } catch (error) {
      console.warn("Workspace activity tracking failed", error);
    }
  }

  function flushActivityTime(force = false) {
    if (!activeUser || !activeWorkspaceId || !activeRole) return;
    const now = Date.now();
    const elapsed = lastActivityTickAt && pageWasVisible
      ? Math.min(90, Math.max(0, Math.round((now - lastActivityTickAt) / 1000)))
      : 0;
    lastActivityTickAt = now;
    if (elapsed > 0 || force) recordWorkspaceActivity(elapsed);
  }

  function startActivityTracking() {
    clearInterval(activityTimer);
    pageWasVisible = document.visibilityState === "visible";
    lastActivityTickAt = Date.now();
    sessionStartedAt = new Date().toISOString();
    sessionSeconds = 0;
    recordWorkspaceActivity(0);
    const sessionRef = ref(database, `workspaces/${activeWorkspaceId}/sessions/${cloudClientId}`);
    onDisconnect(sessionRef).update({
      active: false,
      lastSeenAt: new Date().toISOString()
    }).catch(error => console.warn("Workspace disconnect tracking failed", error));
    activityTimer = setInterval(() => flushActivityTime(false), 10000);
  }

  function stopActivityTracking() {
    flushActivityTime(true);
    clearInterval(activityTimer);
    activityTimer = null;
    lastActivityTickAt = 0;
    pageWasVisible = document.visibilityState === "visible";
    if (activeWorkspaceId) {
      update(ref(database, `workspaces/${activeWorkspaceId}/sessions/${cloudClientId}`), {
        active: false,
        lastSeenAt: new Date().toISOString(),
        sessionSeconds
      }).catch(error => console.warn("Workspace activity close failed", error));
    }
  }

  async function uploadSnapshot(snapshot = window.ReadRouteCloud?.getSnapshot()) {
    if (!activeUser || !activeWorkspaceId || activeRole === "viewer"
      || applyingRemote || !snapshot) return;
    setStatus("Saving shared workspace...");
    lastUploadedAt = new Date().toISOString();
    await set(ref(database, `workspaces/${activeWorkspaceId}/playbook`), {
      ...snapshot,
      cloudUpdatedAt: lastUploadedAt,
      cloudClientId
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
    startActivityTracking();

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
          applyRemoteSnapshot(remote, `${activeRole} workspace loaded`);
          return;
        }
        if (!remote) return;
        if (remote.cloudClientId === cloudClientId
          && remote.cloudUpdatedAt === lastUploadedAt) {
          return;
        }
        if (noteEditorIsActive()) {
          pendingRemoteSnapshot = remote;
          applyPendingRemoteAfterNote();
          return;
        }
        applyRemoteSnapshot(remote);
      },
      error => {
        console.error("Workspace sync failed", error);
        setStatus("Workspace access failed");
      }
    );
  }

  function renderMembers(members = {}) {
    if (!memberList) return;
    const entries = Object.entries(members)
      .sort(([, a], [, b]) =>
        (a.name || a.email || "").localeCompare(b.name || b.email || "")
      );
    memberList.innerHTML = `
      <p class="eyebrow">Members</p>
      ${entries.map(([uid, member]) => {
        const lastSeenAt = latestSeenAtFor(uid);
        const onlineSessions = activeSessionsFor(uid);
        return `
        <div class="workspace-member">
          <span>${member.name || member.email || "Member"}<br><small>${member.email || ""}</small></span>
          <small>${member.role || "viewer"}${onlineSessions.length ? `<br><b class="online-now">Online now</b>` : ""}${lastSeenAt ? `<br>Last seen ${new Date(lastSeenAt).toLocaleString()}` : ""}</small>
        </div>
      `;
      }).join("")}
    `;
  }

  function renderActivityPanel() {
    if (!activityPanel || activeRole !== "owner") return;
    const members = Object.entries(latestMembers)
      .sort(([, a], [, b]) =>
        (a.name || a.email || "").localeCompare(b.name || b.email || "")
      );
    const periods = activityView === "week" ? recentWeekKeys(6) : recentDayKeys(7);
    activityPanel.innerHTML = `
      <div class="workspace-activity-heading">
        <div>
          <p class="eyebrow">Workspace time</p>
          <h3>Activity</h3>
          <p>Approximate active time while each member has the workspace open.</p>
        </div>
        <div class="workspace-activity-tabs">
          <button type="button" data-activity-view="day" class="${activityView === "day" ? "active" : ""}">Day</button>
          <button type="button" data-activity-view="week" class="${activityView === "week" ? "active" : ""}">Week</button>
        </div>
      </div>
      ${members.length ? members.map(([uid, member]) => `
        <div class="workspace-activity-member">
          <strong>
            ${member.name || member.email || "Member"}
            ${activeSessionsFor(uid).length ? `<small>Online now</small>` : ""}
          </strong>
          <div class="workspace-activity-periods">
            ${periods.map(period => {
              const seconds = activityView === "week"
                ? weeklySecondsFor(uid, period)
                : dailySecondsFor(uid, period);
              return `
                <span>
                  <small>${activityView === "week" ? `Week of ${displayDateLabel(period)}` : displayDateLabel(period)}</small>
                  <b>${formatDuration(seconds)}</b>
                </span>
              `;
            }).join("")}
          </div>
        </div>
      `).join("") : `<p class="workspace-activity-empty">No members yet.</p>`}
    `;
    activityPanel.querySelectorAll("[data-activity-view]").forEach(button => {
      button.addEventListener("click", () => {
        activityView = button.dataset.activityView === "week" ? "week" : "day";
        renderActivityPanel();
      });
    });
  }

  function renderWorkspaceOverview() {
    renderMembers(latestMembers);
    renderActivityPanel();
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
    stopActivityListener?.();
    stopSessionListener?.();
    stopMemberListener = onValue(
      ref(database, `workspaces/${activeWorkspaceId}/members`),
      snapshot => {
        latestMembers = snapshot.val() || {};
        renderWorkspaceOverview();
      }
    );
    stopActivityListener = onValue(
      ref(database, `workspaces/${activeWorkspaceId}/activity/daily`),
      snapshot => {
        latestDailyActivity = snapshot.val() || {};
        renderWorkspaceOverview();
      }
    );
    stopSessionListener = onValue(
      ref(database, `workspaces/${activeWorkspaceId}/sessions`),
      snapshot => {
        latestSessions = snapshot.val() || {};
        renderWorkspaceOverview();
      }
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

  document.addEventListener("visibilitychange", () => {
    flushActivityTime(true);
    pageWasVisible = document.visibilityState === "visible";
    lastActivityTickAt = Date.now();
  });

  window.addEventListener("beforeunload", () => {
    flushActivityTime(true);
  });

  onAuthStateChanged(auth, async user => {
    stopActivityTracking();
    activeUser = user;
    stopRemoteListener?.();
    stopRemoteListener = null;
    stopMemberListener?.();
    stopMemberListener = null;
    stopActivityListener?.();
    stopActivityListener = null;
    stopSessionListener?.();
    stopSessionListener = null;
    latestMembers = {};
    latestDailyActivity = {};
    latestSessions = {};
    if (activityPanel) activityPanel.innerHTML = "";
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
