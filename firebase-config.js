/* ============================================================
   FIREBASE CONFIG — THE KIRAN FASHION CRM
   ------------------------------------------------------------
   1. Go to https://console.firebase.google.com and create a project.
   2. Add a Web App to the project (</> icon) to get this config object.
   3. Replace the placeholder values below with your real project's values.
   4. In the Firebase console, enable:
        - Authentication -> Sign-in method -> Email/Password
        - Firestore Database -> Create database (start in production mode)
   5. Create your first login user under Authentication -> Users -> Add user.
   6. Recommended Firestore security rules (Firestore -> Rules):

      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /{document=**} {
            allow read, write: if request.auth != null;
          }
        }
      }

   ============================================================ */

var firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

/* Global handles used throughout app.js */
var auth = firebase.auth();
var db = firebase.firestore();

/* Keep the seller logged in between visits on this device */
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(err){
  console.error("Auth persistence error:", err);
});
