// js/firebase-config.js

// Load Firebase config and initialize
const firebaseConfig = {
  apiKey: "AIzaSyByvnVx2aZEldUfqS2c6VNC6UJRIOPvGws",
  authDomain: "fertility-tracker-c35ff.firebaseapp.com",
  projectId: "fertility-tracker-c35ff",
  storageBucket: "fertility-tracker-c35ff.appspot.com",
  messagingSenderId: "775022478214",
  appId: "1:775022478214:web:107ba4f9e0043bee75a207"
};

// Initialize Firebase app
firebase.initializeApp(firebaseConfig);

// Expose globally
const auth = firebase.auth();
const db = firebase.firestore();


