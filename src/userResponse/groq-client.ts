import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import CHROMACOLLECTION from '../chromadb/collections';

import { Component } from './types';
import { generateSchemaDocumentation } from './utils';

dotenv.config();

const groq = new Groq({
	apiKey: process.env.GROQ_API_KEY
});



export async function validateAndModifyQuery(
	userPrompt: string,
	originalQuery: string,
	componentName: string,
	componentDescription?: string
): Promise<{ query: string; isModified: boolean; reasoning: string }> {

	const schemaDoc = generateSchemaDocumentation();
	try {
		const systemPrompt = `You are an AI assistant that validates and modifies SQL queries based on user requests.

    Given:
    - A user's natural language request
    - An existing SQL query from a component
    - Component name: ${componentName}
    - Component description: ${componentDescription || 'No description'}

    Database Schema:
    ${schemaDoc || 'No schema available'}

    Your task is to:
    1. Determine if the existing query matches the user's intent
    2. If it doesn't match, modify the query to align with the user's request using the correct table and column names from the schema
    3. If it matches, return the original query unchanged
    4. Ensure all table and column names in the query exist in the schema
    5. Use proper SQL syntax (PostgreSQL dialect)

    Respond with a JSON object containing:
    - query: the SQL query (original or modified)
    - isModified: boolean indicating if the query was changed
    - reasoning: brief explanation of your decision

    Example response:
    {"query": "SELECT * FROM supply_chain_data WHERE price > 100", "isModified": true, "reasoning": "Modified the query to filter products by price using the supply_chain_data table and price column from the schema"}

    IMPORTANT:
    - Only modify the query if the user's request requires different data than what the current query provides
    - Always use the exact table and column names from the provided database schema
    - Ensure the query is valid PostgreSQL syntax`;

		const userMessage = `User request: "${userPrompt}"
    Existing query: "${originalQuery}"

    Does this query match the user's request? If not, modify it accordingly.`;

		const chatCompletion = await groq.chat.completions.create({
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				{
					role: 'user',
					content: userMessage
				}
			],
			model: 'openai/gpt-oss-120b',
			temperature: 0.3,
			max_tokens: 1000,
			response_format: { type: 'json_object' }
		});

		const responseText = chatCompletion.choices[0]?.message?.content || '{}';
		const result = JSON.parse(responseText);

		return {
			query: result.query || originalQuery,
			isModified: result.isModified || false,
			reasoning: result.reasoning || 'No reasoning provided'
		};
	} catch (error) {
		console.error('Error validating/modifying query with Groq:', error);
		// Return original query if error occurs
		return {
			query: originalQuery,
			isModified: false,
			reasoning: 'Error occurred during validation, using original query'
		};
	}
}

// Using Groq LLM to match component from a list
export async function matchComponentFromGroq(
	userPrompt: string,
	components: Component[]
): Promise<{ component: Component | null; reasoning: string; queryModified?: boolean; queryReasoning?: string; method: string }> {
	try {
		const componentsText = components
			.map((comp, idx) => `${idx + 1}. ${comp.name}: ${comp.description || 'No description'}`)
			.join('\n');

		const systemPrompt = `You are an AI assistant that helps match user prompts to available UI components.
Given a user's natural language request and a list of available components, determine which component best matches their intent.

Available components:
${componentsText}

Respond with a JSON object containing:
- componentIndex: the index number of the best matching component (1-based), or null if no good match
- reasoning: brief explanation of why this component was chosen or why no match was found

Example response:
{"componentIndex": 2, "reasoning": "The user wants to display data in a table format, and DataGrid component is best suited for this."}`;

		const chatCompletion = await groq.chat.completions.create({
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				{
					role: 'user',
					content: userPrompt
				}
			],
			model: 'openai/gpt-oss-120b',
			temperature: 0.3,
			max_tokens: 500,
			response_format: { type: 'json_object' }
		});

		const responseText = chatCompletion.choices[0]?.message?.content || '{}';
		const result = JSON.parse(responseText);


		const componentIndex = result.componentIndex;
		let component = componentIndex ? components[componentIndex - 1] : null;

		console.log('Groq LLM response:', result, component);

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
			reasoning: result.reasoning || 'No reasoning provided',
			queryModified,
			queryReasoning,
			method: 'groq-llm'
		};
	} catch (error) {
		console.error('Error matching component with Groq:', error);
		throw error;
	}
}
