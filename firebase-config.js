// firebase-config.js - Configuración actualizada
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6-QGF78shV81aaThNs6xR62ia2_UnvMU",
  authDomain: "bot-anuncios-limon.firebaseapp.com",
  projectId: "bot-anuncios-limon",
  storageBucket: "bot-anuncios-limon.firebasestorage.app",
  messagingSenderId: "693215481882",
  appId: "1:693215481882:web:ab627a5d8de3c9348641a3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, orderBy };
