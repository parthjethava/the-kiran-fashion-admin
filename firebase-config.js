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
  apiKey: "AIzaSyBBACjKMNxr2jzevolXW3GaqBOBdD4CJH4",
  authDomain: "the-kiran-fashion.firebaseapp.com",
  projectId: "the-kiran-fashion",
  storageBucket: "the-kiran-fashion.firebasestorage.app",
  messagingSenderId: "88989985858",
  appId: "1:88989985858:web:4a2eede7bde64090d2d1db",
  measurementId: "G-TW7VZ8QPQJ"
};

firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .catch(function(err) {
    console.error(err);
  });
