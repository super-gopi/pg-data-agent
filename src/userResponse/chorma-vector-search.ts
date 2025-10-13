import CHROMACOLLECTION from "../chromadb/collections";
import { validateAndModifyQuery } from "./groq-client";
import { Component } from "./types";
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Re-rank components using LLM to select the best match
async function rerankComponents(userPrompt: string, components: Component[]): Promise<{ component: Component; reasoning: string }> {
    const componentsText = components
        .map((comp, idx) => `${idx + 1}. ${comp.name} (${comp.type}): ${comp.description}`)
        .join('\n');

    const systemPrompt = `You are an AI assistant that selects the best matching component from a ranked list.

User request: "${userPrompt}"

Top ${components.length} candidates (ordered by vector similarity):
${componentsText}

Analyze the user's intent and select the component that BEST matches their request.

Rules:
- If user wants to VIEW/SEE/DISPLAY/GET/SHOW data → select data-table components
- If user wants to CREATE/ADD/INSERT data → select form components (not update forms)
- If user wants to EDIT/UPDATE/MODIFY data → select update/edit form components
- If user wants analytics/insights → select dashboard/chart components

Respond with a JSON object:
{
  "componentIndex": <number 1-${components.length}>,
  "reasoning": "<brief explanation>"
}`;

    const chatCompletion = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Select the best component' }
        ],
        model: 'openai/gpt-oss-120b',
        temperature: 0.1,
        max_tokens: 500, // Increased to handle full descriptions
        response_format: { type: 'json_object' }
    });

    const result = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
    const index = result.componentIndex - 1;

    return {
        component: components[index] || components[0],
        reasoning: result.reasoning || 'Selected based on semantic similarity'
    };
}

export async function matchComponentFromChromaDB(
    userPrompt: string,
    collectionName: string,
    topK: number = 5
): Promise<{ component: Component | null; reasoning: string; queryModified?: boolean; queryReasoning?: string; method: string }> {
    try {
        console.log(`Searching ChromaDB for matching components (top ${topK})...`);

        // Query ChromaDB for similar components
        const matchingComponents = await CHROMACOLLECTION.queryComponents(
            collectionName,
            userPrompt,
            topK
        );

        if (matchingComponents.length === 0) {
            console.log('No matching components found in ChromaDB');
            return {
                component: null,
                reasoning: 'No matching components found in the database',
                method: 'chromadb-vector-search'
            };
        }

        // Use LLM to re-rank and select the best component from top-K results
        console.log(`Re-ranking top ${matchingComponents.length} components using LLM...`);
        const { component: selectedComponent, reasoning: rerankReasoning } = await rerankComponents(userPrompt, matchingComponents);

        let component = selectedComponent;
        const reasoning = `Vector search found ${matchingComponents.length} candidates. ${rerankReasoning}`;

        console.log('Final selected component:', component.name);

        // If component has a query in props, validate and modify it if needed
        let queryModified = false;
        let queryReasoning = '';

        if (component && component.props?.query) {
            console.log('Component has a query, validating against user request...');
            const queryValidation = await validateAndModifyQuery(
                userPrompt,
                component.props.query,
                component.name,
                component.description
            );

            // Create a new component object with the potentially modified query
            component = {
                ...component,
                props: {
                    ...component.props,
                    query: queryValidation.query
                }
            };

            queryModified = queryValidation.isModified;
            queryReasoning = queryValidation.reasoning;

            console.log(`Query ${queryModified ? 'modified' : 'unchanged'}: ${queryReasoning}`);
        }

        return {
            component,
            reasoning,
            queryModified,
            queryReasoning,
            method: 'chromadb-vector-search'
        };
    } catch (error) {
        console.error('Error matching component with ChromaDB:', error);
        throw error;
    }
}