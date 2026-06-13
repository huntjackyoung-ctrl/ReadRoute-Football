# Firebase Workspace Setup

ReadRoute uses Firebase Authentication and Realtime Database so separate Google accounts can share one playbook.

## Firebase Products

1. Enable **Authentication > Sign-in method > Google**.
2. Add `read-route-football.vercel.app` and `thegridiq.com` under **Authentication > Settings > Authorized domains**.
3. Create a **Realtime Database**.
4. Paste the rules below into **Realtime Database > Rules**, then click **Publish**.

## Required Database Rules

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "workspaces": {
      "$workspaceId": {
        ".write": "auth != null && !data.exists() && newData.child('meta').child('ownerUid').val() === auth.uid && newData.child('members').child(auth.uid).child('role').val() === 'owner'",
        "meta": {
          ".read": "auth != null && root.child('workspaces').child($workspaceId).child('members').child(auth.uid).exists()",
          ".write": "auth != null && root.child('workspaces').child($workspaceId).child('members').child(auth.uid).child('role').val() === 'owner'"
        },
        "playbook": {
          ".read": "auth != null && root.child('workspaces').child($workspaceId).child('members').child(auth.uid).exists()",
          ".write": "auth != null && (root.child('workspaces').child($workspaceId).child('members').child(auth.uid).child('role').val() === 'owner' || root.child('workspaces').child($workspaceId).child('members').child(auth.uid).child('role').val() === 'editor')"
        },
        "members": {
          ".read": "auth != null && root.child('workspaces').child($workspaceId).child('members').child(auth.uid).exists()",
          "$uid": {
            ".write": "auth != null && (root.child('workspaces').child($workspaceId).child('members').child(auth.uid).child('role').val() === 'owner' || (auth.uid === $uid && !data.exists() && newData.child('inviteCode').isString() && root.child('workspaces').child($workspaceId).child('invites').child(newData.child('inviteCode').val()).child('active').val() === true && newData.child('role').val() === root.child('workspaces').child($workspaceId).child('invites').child(newData.child('inviteCode').val()).child('role').val()))"
          }
        },
        "invites": {
          "$code": {
            ".read": "auth != null",
            ".write": "auth != null && root.child('workspaces').child($workspaceId).child('members').child(auth.uid).child('role').val() === 'owner'"
          }
        }
      }
    }
  }
}
```

## Collaboration Flow

1. The owner opens the deployed site and clicks **Connect Workspace**.
2. The first connection migrates the owner’s existing cloud or browser playbook into an owner workspace.
3. The owner clicks **Share**, chooses **Editor** or **Viewer**, and creates an invite link.
4. The teammate opens that link and signs in with their own Google account.
5. Editors can change the shared playbook. Viewers can study and run plays but cannot save changes.

Existing browser data is preserved as a recovery snapshot before cloud data is loaded.
