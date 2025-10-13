import CHROMACOLLECTION from "../chromadb/collections";
import { WebSocketMessage } from "../websocket/types";
import { matchComponentFromChromaDB } from "./chorma-vector-search";
import { matchComponentFromGroq } from "./groq-client";
import { Component } from "./types";

export const get_user_response = async (data:any, components: Component[]) => {

    const id = data.id || 'unknown';
    const prompt = data.payload?.prompt || '';

    try {
        if (!prompt || prompt.trim().length === 0) {
            // throw new Error('Prompt cannot be empty');
            return {success: false, reason: 'Prompt cannot be empty'};
        }

        // Get matching method from environment variable (default: 'chromadb')
        const matchingMethod = process.env.COMPONENT_MATCHING_METHOD || 'chromadb';
        let matchResult;

        if (matchingMethod === 'groq') {
            // Method 1: Use Groq LLM to match from in-memory components
            console.log('Using Groq LLM matching method...');

            if (components.length === 0) {
                return {success: false, reason: 'Components not loaded in memory. Please ensure components are fetched first.'};
            }

            matchResult = await matchComponentFromGroq(prompt, components);
        } else {
            // Method 2: Use ChromaDB vector search
            console.log('Using ChromaDB vector search matching method...');

            try {
                const projectId = process.env.PROJECT_ID || '';
                const collectionName = projectId + '_components';

                // Check if collection exists
                const exists = await CHROMACOLLECTION.collectionExists(collectionName);
                if (!exists) {
                    // throw new Error(`ChromaDB collection "${collectionName}" does not exist.`);
                    return {success: false, reason: `ChromaDB collection "${collectionName}" does not exist.`};
                }

                matchResult = await matchComponentFromChromaDB(prompt, collectionName, 5);
            } catch (chromaError) {
                // Fallback to Groq method if ChromaDB fails
                console.error('⚠️  ChromaDB error, falling back to Groq LLM method:', (chromaError as Error).message);

                if (components.length === 0) {
                    // throw new Error('ChromaDB unavailable and components not loaded in memory. Cannot process request.');
                    return {success: false, reason: 'ChromaDB unavailable and components not loaded in memory. Cannot process request.'};
                }

                matchResult = await matchComponentFromGroq(prompt, components);
            }
        }

        const response: WebSocketMessage = {
            id: id,
            type: 'user_prompt_res',
            from: {
                type: 'data_agent',
            },
            to:{
                type: 'runtime',
                id: data.from?.id,
            },
            payload: {
                component: matchResult.component,
                reasoning: matchResult.reasoning,
                queryModified: matchResult.queryModified,
                queryReasoning: matchResult.queryReasoning,
                method: matchResult.method
            }
        };

        console.log(`Sent user prompt response with matched component (${matchResult.method}):`, matchResult.component?.name);
        if (matchResult.queryModified) {
            console.log('Query was modified:', matchResult.queryReasoning);
        }
        return {success: true, response: response};

    } catch (error) {
        console.error('Error handling user prompt:', error);
        return {success: false, reason: error instanceof Error ? error.message : 'Unknown error'};
    }
}