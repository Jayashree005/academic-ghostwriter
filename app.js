// 1. IMPORTS (Updated to include Firestore)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js"; 
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-functions.js";

// 2. CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyCZvYw2psxu9YwfZR02Aiesn_bXtlKFlTY",
    authDomain: "gen-lang-client-0592248752.firebaseapp.com",
    projectId: "gen-lang-client-0592248752",
    storageBucket: "gen-lang-client-0592248752.firebasestorage.app",
    messagingSenderId: "1043389993306",
    appId: "1:1043389993306:web:c044a4b46061ea74142363"
};

// 3. GLOBAL VARIABLES
let auth, functions, db;
let currentLectureText = ""; 

// 4. INITIALIZATION
function init() {
    try {
        console.log("🚀 Initializing Firebase...");
        const app = initializeApp(firebaseConfig);
        
        // Init Services
        auth = getAuth(app);
        functions = getFunctions(app);
        db = getFirestore(app); // <--- NEW: Database

        // Connect to Emulators
        const hostname = window.location.hostname;
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            console.log("🔧 Connected to Local Emulator");
            connectFunctionsEmulator(functions, "127.0.0.1", 5001);
            // Firestore auto-detects emulator usually, but we log it:
            console.log("🔧 Using Firestore Emulator");
        }

        // Auto-sign in
        signInAnonymously(auth).then(() => {
            const userDiv = document.getElementById('userInfo');
            if (userDiv) {
                userDiv.innerHTML = '<span><i class="fas fa-user"></i> Guest Student</span>';
            }
            // Load History after login
            window.loadRecentLectures(); 
        });

        console.log("✅ App Ready");
    } catch (e) {
        console.error("Init Error:", e);
    }
}

// 5. EXPOSE FUNCTIONS TO WINDOW

// --- UPLOAD FUNCTION (With Visual Upgrade) ---
window.uploadLecture = async function() {
    console.log("Button clicked!");

    if (!auth.currentUser) {
        alert("Please wait for login...");
        return;
    }

    const courseName = document.getElementById('courseName').value;
    const text = document.getElementById('lectureText').value;

    if (!text) return alert("Please enter text");

    const btn = document.getElementById('uploadBtn');
    const resultDiv = document.getElementById('uploadResult');
    const originalBtnText = btn.innerHTML; // Save original text
    
    // VISUAL UPGRADE: Loading State
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reading...';
        btn.disabled = true;
    }
    
    // VISUAL UPGRADE: Cool "Brain Pulse" animation
    if (resultDiv) {
        resultDiv.innerHTML = `
            <div style="text-align: center; color: #666; padding: 20px;">
                <i class="fas fa-brain fa-pulse" style="font-size: 2rem; color: #2563eb; margin-bottom: 10px;"></i>
                <p>Analyzing lecture concepts...</p>
            </div>
        `;
        resultDiv.style.display = 'block';
    }

    try {
        console.log("Sending to backend...");
        
        const processLecture = httpsCallable(functions, 'processLecture');
        const result = await processLecture({ 
            text: text, 
            courseName: courseName,
            userId: auth.currentUser.uid 
        });

        console.log("Backend Response:", result.data);

        if (resultDiv) {
            if (result.data.success) {
                // SUCCESS
                currentLectureText = text; 
                console.log("Lecture text saved for chat.");
                
                // Refresh the history list instantly!
                window.loadRecentLectures();

                resultDiv.innerHTML = `
                    <div style="background: #e6fffa; padding: 15px; border-radius: 8px; border: 1px solid #b2f5ea; margin-top: 15px;">
                        <h3 style="color: #2c7a7b; margin-top:0;">✅ Analysis Complete</h3>
                        <p><strong>Summary:</strong></p>
                        <p style="font-family: var(--font-read);">${result.data.summary}</p>
                        <hr style="border-top: 1px solid #b2f5ea; margin: 10px 0;">
                        <button onclick="switchTab('study')" class="btn primary" style="font-size:0.9rem;">
                             👉 Chat with this Lecture
                        </button>
                    </div>
                `;
            } else {
                // SERVER ERROR
                resultDiv.innerHTML = `
                    <div style="background: #fff5f5; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2; margin-top: 15px;">
                        <h3 style="color: #c53030; margin-top:0;">⚠️ Issue</h3>
                        <p>${result.data.message || "Unknown error occurred"}</p>
                    </div>
                `;
            }
        }

    } catch (error) {
        console.error("Network Error:", error);
        if (resultDiv) {
            resultDiv.innerHTML = `<p style="color:red">System Error: ${error.message}</p>`;
        }
    } finally {
        if (btn) {
            btn.innerHTML = originalBtnText;
            btn.disabled = false;
        }
    }
};

// --- CHAT FUNCTION ---
window.askStudyBuddy = async function() {
    const input = document.getElementById('chatInput');
    const history = document.getElementById('chatHistory');
    const btn = document.getElementById('chatBtn');
    const message = input.value;

    if (!message) return;
    
    if (!currentLectureText) {
        alert("Please upload and process a lecture first!");
        switchTab('upload');
        return;
    }

    // 1. Show User Message
    history.innerHTML += `<div class="message user">${message}</div>`;
    input.value = "";
    history.scrollTop = history.scrollHeight;
    
    // Disable button
    btn.disabled = true;

    try {
        const studyBuddy = httpsCallable(functions, 'studyBuddy');
        const result = await studyBuddy({ 
            message: message, 
            contextText: currentLectureText 
        });

        const answer = result.data.answer || "I'm having trouble thinking right now.";
        history.innerHTML += `<div class="message ai">👻 <b>Ghostwriter:</b> ${answer}</div>`;

    } catch (error) {
        console.error("Chat Error:", error);
        history.innerHTML += `<div class="message ai" style="color:red;">Error: ${error.message}</div>`;
    } finally {
        history.scrollTop = history.scrollHeight;
        btn.disabled = false;
    }
};

// --- NEW: LOAD HISTORY (The Course Memory) ---
window.loadRecentLectures = async function() {
    const list = document.getElementById('lecturesList');
    if (!list) return;

    try {
        // Get last 5 lectures
        const q = query(
            collection(db, "lectures"), 
            orderBy("createdAt", "desc"), 
            limit(5)
        );
        
        const querySnapshot = await getDocs(q);
        
        list.innerHTML = ""; // Clear "Loading..."
        
        if (querySnapshot.empty) {
            list.innerHTML = "<li style='padding:10px; color:#999;'>No lectures found. Upload one!</li>";
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Create a list item
            const li = document.createElement("li");
            li.innerHTML = `
                <strong>${data.courseName}</strong> 
                <span style="font-size:0.8em; color:#666; display:block;">
                    ${data.summary ? data.summary.substring(0, 60) + "..." : "No summary"}
                </span>
            `;
            
            // Clicking it loads the text into the box!
            li.onclick = () => {
                document.getElementById('courseName').value = data.courseName;
                document.getElementById('lectureText').value = data.originalText || "Text not saved.";
                
                // Show summary
                document.getElementById('uploadResult').innerHTML = `
                    <div style="background:#e6fffa; padding:15px; border-radius:8px;">
                        <b>Restored Summary:</b> <br> ${data.summary}
                    </div>
                `;
                document.getElementById('uploadResult').style.display = 'block';
                
                // Enable Chat
                currentLectureText = data.originalText; 
                alert(`Loaded ${data.courseName}! You can now chat with it.`);
            };
            
            list.appendChild(li);
        });

    } catch (error) {
        console.error("Error loading history:", error);
        // Silent fail if emulator isn't ready
    }
};

// --- UTILITIES ---
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    
    const content = document.getElementById(tabName + 'Tab');
    // Note: Updated selector to match new CSS class 'tab-btn'
    const btn = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
    
    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');
};

window.clearText = function() {
    const txt = document.getElementById('lectureText');
    if (txt) txt.value = '';
};

// --- CONNECTION FUNCTION ---
window.findConnections = async function() {
    const c1 = document.getElementById('course1').value.trim();
    const c2 = document.getElementById('course2').value.trim();
    const resultDiv = document.getElementById('connectionsResult');
    const btn = document.getElementById('connectionsBtn');

    if (!c1 || !c2) return alert("Please enter two course names!");

    // UI Loading State
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching Archives...';
    btn.disabled = true;
    resultDiv.style.display = 'none';

    try {
        const findFunc = httpsCallable(functions, 'findConnections');
        const result = await findFunc({ course1: c1, course2: c2 });

        if (result.data.success) {
             let formattedText = result.data.connections
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

             resultDiv.innerHTML = `
                <div style="background: #ebf8ff; padding: 15px; border-radius: 8px; border: 1px solid #bee3f8; margin-top: 15px;">
                    <h3 style="color: #2b6cb0; margin-top:0;">🔗 Connections Found</h3>
                    <div style="line-height: 1.6; color: #2d3748;">${formattedText}</div>
                </div>
            `;
        } else {
             resultDiv.innerHTML = `<p style="color:#e53e3e; margin-top:10px; font-weight:bold;">${result.data.message}</p>`;
        }
        resultDiv.style.display = 'block';

    } catch (error) {
        console.error("Connection Error:", error);
        alert("System Error: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// 6. START THE APP
init();