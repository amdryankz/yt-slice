import { config } from 'dotenv';
config({ path: '../../.env' });
import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'fs';
writeFileSync('dummy.txt', 'hello world');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
async function run() {
  const file = await ai.files.upload({ file: 'dummy.txt', mimeType: 'text/plain' });
  console.log('File uploaded:', file);
  
  const res = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: [file, 'What is in this file?']
  });
  console.log(res.text);
}
run().catch(console.error);
