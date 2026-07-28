// ============================================
// THE KIRAN FASHION CRM
// APP.JS PART 1
// ============================================

import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
getAuth,
signInWithEmailAndPassword,
signOut,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
getFirestore,
collection,
onSnapshot,
addDoc,
doc,
updateDoc,
deleteDoc,
serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

// Collections

const ORDER_COLLECTION = "orders";

// DOM

const loginPage = document.getElementById("loginPage");
const dashboard = document.getElementById("dashboard");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const email = document.getElementById("email");
const password = document.getElementById("password");

const orderTable = document.getElementById("orderTable");

// Dashboard Counts

const onHoldCount = document.getElementById("onHoldCount");
const pendingCount = document.getElementById("pendingCount");
const readyCount = document.getElementById("readyCount");
const shippedCount = document.getElementById("shippedCount");
const cancelCount = document.getElementById("cancelCount");

const todayOrders = document.getElementById("todayOrders");
const todayShipped = document.getElementById("todayShipped");
const yesterdayOrders = document.getElementById("yesterdayOrders");
const yesterdayShipped = document.getElementById("yesterdayShipped");

// Login

loginBtn.addEventListener("click", async () => {

const em = email.value.trim();

const pass = password.value.trim();

if(!em || !pass){

alert("Enter Email & Password");

return;

}

try{

await signInWithEmailAndPassword(auth,em,pass);

}catch(err){

alert(err.message);

}

});

// Logout

logoutBtn.addEventListener("click",async()=>{

await signOut(auth);

});

// Auth

onAuthStateChanged(auth,(user)=>{

if(user){

loginPage.style.display="none";

dashboard.style.display="block";

loadOrders();

}else{

loginPage.style.display="block";

dashboard.style.display="none";

}

});

// Global Orders

let orders=[];

// Load Orders

function loadOrders(){

const ref = collection(db,ORDER_COLLECTION);

onSnapshot(ref,(snapshot)=>{

orders=[];

snapshot.forEach((doc)=>{

orders.push({

id:doc.id,

...doc.data()

});

});

renderDashboard();

renderOrders();

});

}
