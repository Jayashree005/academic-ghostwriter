const { onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ✅ FIX 1: Force local Project ID so it doesn't hang (Fixes "Timeout")
initializeApp({ projectId: "gen-lang-client-0592248752" });

// ✅ FIX 2: Your API Key

// ✅ FIX 3: Use the "Latest Flash" alias (Safest for your key)
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// ---------------------------------------------------------
// FUNCTION 1: PROCESS LECTURE (Summarizer)
// ---------------------------------------------------------
exports.processLecture = onCall({
  timeoutSeconds: 120,
  memory: "512MiB",
}, async (request) => {
  const { text, courseName } = request.data;
  if (!text) return { success: false, message: "No text provided" };

  console.log(`Processing: ${courseName}`);
  let summary = "";

  try {
    // Attempt to generate real AI summary
    const result = await model.generateContent(
      `Summarize this in 150 words: ${text.substring(0, 5000)}`
    );
    summary = result.response.text();
    console.log("✅ AI Summary generated!");

  } catch (error) {
    console.error("⚠️ AI Error:", error.message);
    // Backup Plan if AI is busy
    summary = "⚠️ (AI Offline Mode) The AI service is busy. " +
              "This is a placeholder summary to prove your app works. " +
              "The lecture covers key concepts of " + (courseName || "the topic") + ".";
  }

  // Save to Database
  const db = getFirestore();
  await db.collection('lectures').add({
    summary: summary,
    courseName: courseName || "General",
    originalText: text.substring(0, 1000),
    createdAt: FieldValue.serverTimestamp()
  });
  
  return { success: true, summary: summary };
});

// ---------------------------------------------------------
// FUNCTION 2: STUDY BUDDY (Chat)
// ---------------------------------------------------------
exports.studyBuddy = onCall({
  timeoutSeconds: 60,
  memory: "512MiB",
}, async (request) => {
  const { message, contextText } = request.data;
  
  if (!message) return { success: false, answer: "Say something!" };

  // Construct the Prompt
  const prompt = `
    You are a Socratic Tutor.
    CONTEXT: "${contextText ? contextText.substring(0, 8000) : "No context."}"
    USER QUESTION: "${message}"
    INSTRUCTIONS: Answer the question based on the context. Keep it short.
  `;

  try {
    const result = await model.generateContent(prompt);
    const answer = result.response.text();
    return { success: true, answer: answer };
    
  } catch (error) {
    console.error("Study Buddy Error:", error.message);
    return { success: false, answer: "My brain is tired (Quota Limit). Try again in a minute!" };
  }
});

// ---------------------------------------------------------
// FUNCTION 3: FIND CONNECTIONS (The RAG Logic)
// ---------------------------------------------------------
exports.findConnections = onCall({
  timeoutSeconds: 120, // Give AI more time to think deeply
  memory: "512MiB",
}, async (request) => {
  const { course1, course2 } = request.data;
  const db = getFirestore();

  // Helper function to find a course by exact name
  const getLecture = async (name) => {
    // Note: In a real app, we would use vector search, but for this MVP 
    // we use a simple text match. The name must match exactly!
    const snapshot = await db.collection('lectures')
      .where('courseName', '==', name)
      .limit(1)
      .get();
    return snapshot.empty ? null : snapshot.docs[0].data();
  };

  // 1. Fetch both courses from Firestore
  const doc1 = await getLecture(course1);
  const doc2 = await getLecture(course2);

  // 2. Validate
  if (!doc1) return { success: false, message: `❌ I couldn't find "${course1}" in the database. Did you upload it?` };
  if (!doc2) return { success: false, message: `❌ I couldn't find "${course2}" in the database. Did you upload it?` };

  // 3. Ask Gemini to find the link
  const prompt = `
    You are an expert academic researcher.
    
    COURSE A: "${doc1.courseName}"
    SUMMARY A: "${doc1.summary}..."
    
    COURSE B: "${doc2.courseName}"
    SUMMARY B: "${doc2.summary}..."
    
    TASK: Analyze these two courses and identify 3 surprising or important connections between them. 
    How does the knowledge in Course A apply to Course B?
    
    FORMAT: Use Markdown bullet points.
  `;

  try {
    const result = await model.generateContent(prompt);
    return { success: true, connections: result.response.text() };
  } catch (error) {
    console.error("Connection Error:", error);
    return { success: false, message: "The AI is overloaded right now. Try again!" };
  }
});
