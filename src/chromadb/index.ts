import { ChromaClient } from "chromadb";
import dotenv from 'dotenv';

dotenv.config();

// Configure ChromaDB client based on environment variables
const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';

let client: ChromaClient;

client = new ChromaClient({
    path: CHROMA_HOST
});

export default client;


