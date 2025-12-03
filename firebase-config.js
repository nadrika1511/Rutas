// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, doc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCCGOpYBMOs6xarNs4_-nrUVJtA0HQDoWA",
  authDomain: "rutas-d6214.firebaseapp.com",
  projectId: "rutas-d6214",
  storageBucket: "rutas-d6214.firebasestorage.app",
  messagingSenderId: "656140775104",
  appId: "1:656140775104:web:84e7f256ac64b848a80725"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDocs, updateDoc, doc, query, where, orderBy };
