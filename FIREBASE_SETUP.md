# One-Time Cloud Workspace Setup

ReadRoute needs a cloud database to show the same playbook on multiple computers. GitHub Pages alone cannot store private user data.

1. Create a Firebase project at https://console.firebase.google.com/.
2. Add a Web app inside the project.
3. Enable **Authentication > Sign-in method > Google**.
4. Create a **Realtime Database**.
5. Set these database rules:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

6. In Authentication settings, add your GitHub Pages domain to **Authorized domains**.
7. Copy the Firebase web configuration into `firebase-config.js`:

```js
window.READROUTE_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

After this file is pushed, click **Connect Workspace** and use the same Google account on every computer.

On the first connection, if the cloud workspace is empty, ReadRoute uploads the complete playbook already saved in that browser. It does not replace the browser's existing playbook with a blank workspace.
