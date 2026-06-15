import { config } from 'dotenv';
config({ path: '../../.env' });
import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'fs';
writeFileSync('dummy.txt', 'hello world');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
async function run() {
  const file = await ai.files.upload({ file: 'dummy.txt', mimeType: 'text/plain' });
  
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash', // wait, let's use gemini-1.5-flash
    contents: [
      { text: "What is in this file?" },
      { fileData: { fileUri: file.uri, mimeType: file.mimeType } }
    ]
  });
  console.log(res.text);
}
run().catch(console.error);
