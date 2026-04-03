// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBPas7cPimmBTPNwthZEALwvcM1903GLCs",
  authDomain: "sleepfriends-a7e54.firebaseapp.com",
  projectId: "sleepfriends-a7e54",
  storageBucket: "sleepfriends-a7e54.firebasestorage.app",
  messagingSenderId: "114419251551",
  appId: "1:114419251551:web:ec76bf96af44e335835eea",
  measurementId: "G-C5JXPT3VZJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);// ─────────────────────────────────────────────────────────────────────────────
// Fill this in after creating your Firebase project.
// Firebase Console → Project Settings → Your apps → SDK setup & configuration
// ─────────────────────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey:            "AIzaSyBPas7cPimmBTPNwthZEALwvcM1903GLCs",
  authDomain:        "sleepfriends-a7e54.firebaseapp.com",
  projectId:         "sleepfriends-a7e54",
  storageBucket:     "sleepfriends-a7e54.firebasestorage.app",
  messagingSenderId: "114419251551",
  appId:             "1:114419251551:web:ec76bf96af44e335835eea"
};
