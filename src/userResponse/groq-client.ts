import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import CHROMACOLLECTION from '../chromadb/collections';

import { Component } from './types';
import { generateSchemaDocumentation, ensureQueryLimit } from './utils';

dotenv.config();

const groq = new Groq({
	apiKey: process.env.GROQ_API_KEY
});

const DEFAULT_LIMIT = 50;

const GROQ_MODEL = 'openai/gpt-oss-120b';
/**
 * Classify user question to determine the type and required visualizations
 */
export async function classifyUserQuestion(
	userPrompt: string
): Promise<{
	questionType: 'analytical' | 'data_modification' | 'general';
	visualizations: string[];
	reasoning: string;
	needsMultipleComponents: boolean;
}> {
	const schemaDoc = generateSchemaDocumentation();

	try {
		const systemPrompt = `You are an expert AI that classifies user questions about data and determines the appropriate visualizations needed.

Database Schema:
${schemaDoc || 'No schema available'}

IMPORTANT: You must respond in valid JSON format.

Your task is to analyze the user's question and determine:

1. **Question Type:**
   - "analytical": Questions asking to VIEW, ANALYZE, or VISUALIZE data
     Examples: "Show me revenue", "What is the trend?", "Display top customers", "Revenue by region"

   - "data_modification": Questions asking to CREATE, UPDATE, DELETE, or MODIFY data
     Examples: "Add a new customer", "Update order status", "Delete old records", "Change price"

   - "general": General questions, greetings, or requests not related to data
     Examples: "Hello", "What can you do?", "Help me understand"

2. **Required Visualizations** (only for analytical questions):
   Determine which visualization type(s) would BEST answer the user's question:

   - **KPICard**: Single metric, total, count, average, percentage, or summary number
     Use when: User asks for "total", "how many", "average", "what is the [metric]"
     Examples: "What is total revenue?", "How many orders?", "Average price?"

   - **LineChart**: Trends over time, time series, growth/decline patterns
     Use when: User mentions "trend", "over time", "monthly", "growth", or asks about changes
     Examples: "Revenue trend", "Orders over time", "Monthly sales", "Growth pattern"

   - **BarChart**: Comparing categories, rankings, distributions across groups
     Use when: User asks "by [category]", "top N", "compare", "distribution"
     Examples: "Revenue by region", "Top 10 products", "Sales by category", "Compare suppliers"

   - **PieChart**: Proportions, percentages, composition, market share
     Use when: User asks about "percentage", "share", "proportion", "breakdown"
     Examples: "Revenue share", "Market composition", "Percentage by category"

   - **DataTable**: Detailed lists, multiple attributes, when user needs to see records
     Use when: User asks to "list", "show all", "display details", wants multiple columns
     Examples: "List all customers", "Show recent orders", "Display product details"

3. **Multiple Visualizations:**
   User may need MULTIPLE visualizations together:

   Common combinations:
   - KPICard + LineChart: "Show total revenue and trend" → [number + trend over time]
   - KPICard + BarChart: "Total sales and breakdown by region" → [total + distribution]
   - KPICard + DataTable: "Number of orders and list them" → [count + detailed list]
   - BarChart + PieChart: "Compare categories and show market share" → [comparison + proportion]
   - LineChart + DataTable: "Trend over time with details" → [trend + supporting data]

   Set needsMultipleComponents to true if user needs multiple views of the data.

**Important Guidelines:**
- If user explicitly mentions a chart type (e.g., "show as line chart", "use bar chart"), RESPECT that preference
- If question is vague or needs both summary and detail, suggest KPICard + DataTable
- Only return visualizations for "analytical" questions
- For "data_modification" or "general", return empty array for visualizations

**Output Format:**
{
  "questionType": "analytical" | "data_modification" | "general",
  "visualizations": ["KPICard", "LineChart", ...],  // Empty array if not analytical
  "reasoning": "Explanation of classification and visualization choices",
  "needsMultipleComponents": boolean
}

Examples:

User: "Show me total revenue"
Output: {"questionType": "analytical", "visualizations": ["KPICard"], "reasoning": "User asks for a single total value", "needsMultipleComponents": false}

User: "What is the revenue trend over last 6 months?"
Output: {"questionType": "analytical", "visualizations": ["LineChart"], "reasoning": "User asks for trend over time", "needsMultipleComponents": false}

User: "Show total orders and list them"
Output: {"questionType": "analytical", "visualizations": ["KPICard", "DataTable"], "reasoning": "User needs both count and detailed list", "needsMultipleComponents": true}

User: "Show revenue by region as a bar chart"
Output: {"questionType": "analytical", "visualizations": ["BarChart"], "reasoning": "User explicitly requests bar chart for categorical comparison", "needsMultipleComponents": false}

User: "Update customer email to john@example.com"
Output: {"questionType": "data_modification", "visualizations": [], "reasoning": "User wants to modify data", "needsMultipleComponents": false}`;

		const chatCompletion = await groq.chat.completions.create({
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				{
					role: 'user',
					content: `User question: "${userPrompt}"\n\nClassify this question and determine required visualizations.`
				}
			],
			model: GROQ_MODEL,
			temperature: 0.2,
			max_tokens: 800,
			response_format: { type: 'json_object' }
		});

		const responseText = chatCompletion.choices[0]?.message?.content || '{}';
		const result = JSON.parse(responseText);

		return {
			questionType: result.questionType || 'general',
			visualizations: result.visualizations || [],
			reasoning: result.reasoning || 'No reasoning provided',
			needsMultipleComponents: result.needsMultipleComponents || false
		};
	} catch (error) {
		console.error('Error classifying user question:', error);
		// Default to analytical with no specific visualization preference
		return {
			questionType: 'analytical',
			visualizations: [],
			reasoning: 'Error occurred during classification',
			needsMultipleComponents: false
		};
	}
}

/**
 * Enhanced function that validates and modifies the entire props object based on user request
 * This includes query, title, description, and config properties
 */
export async function validateAndModifyProps(
	userPrompt: string,
	originalProps: any,
	componentName: string,
	componentType: string,
	componentDescription?: string
): Promise<{ props: any; isModified: boolean; reasoning: string; modifications: string[] }> {

	const schemaDoc = generateSchemaDocumentation();
	try {
		const systemPrompt = `You are an AI assistant that validates and modifies component props based on user requests.

IMPORTANT: Respond in JSON format.

Given:
- A user's natural language request
- Component name: ${componentName}
- Component type: ${componentType} (KPICard, BarChart, LineChart, PieChart, DonutChart, DataTable, etc.)
- Component description: ${componentDescription || 'No description'}
- Current component props with structure:
  {
    query?: string,        // SQL query to fetch data
    title?: string,        // Component title
    description?: string,  // Component description
    config?: {            // Additional configuration
      [key: string]: any
    }
  }

Database Schema:
${schemaDoc || 'No schema available'}

Your task is to intelligently modify the props based on the user's request:

1. **Query Modification**:
   - Modify SQL query if user requests different data, filters, time ranges, limits, or aggregations
   - Use correct table and column names from the schema
   - Ensure valid SQL syntax (Snowflake SQL dialect)
   - ALWAYS include a LIMIT clause (default: ${DEFAULT_LIMIT} rows) to prevent large result sets
   - Preserve the query structure that the component expects (e.g., column aliases)

2. **Title Modification**:
   - Update title to reflect the user's specific request
   - Keep it concise and descriptive
   - Match the tone of the original title

3. **Description Modification**:
   - Update description to explain what data is shown
   - Be specific about filters, time ranges, or groupings applied

4. **Config Modification** (based on component type):
   - For KPICard: formatter, gradient, icon
   - For Charts: colors, height, xKey, yKey, nameKey, valueKey
   - For Tables: columns, pageSize, formatters
   - Only modify if user explicitly requests changes

Examples of user requests and modifications:
/
User: "Show me revenue for last quarter"
- Modify query: Add date filter for last quarter
- Update title: "Revenue Last Quarter"
- Update description: "Total revenue for the last 3 months"

User: "Show top 10 customers by spending"
- Modify query: Change LIMIT to 10
- Update title: "Top 10 Customers by Spending"
- Keep config.pageSize = 10

User: "Revenue trend for last 6 months"
- Modify query: Change time range to 6 months
- Update title: "Revenue Trend (6 Months)"

Respond with a JSON object:
{
  "props": { /* modified props object with query, title, description, config */ },
  "isModified": boolean,
  "reasoning": "brief explanation of changes",
  "modifications": ["list of specific changes made"]
}

IMPORTANT:
- Return the COMPLETE props object, not just modified fields
- Only modify what's necessary for the user's request
- Preserve the structure expected by the component type
- Ensure query returns columns with expected aliases (e.g., "value" for KPICard)
- Keep config properties that aren't affected by the request`;

		const userMessage = `User request: "${userPrompt}"

Current props:
${JSON.stringify(originalProps, null, 2)}

Component type: ${componentType}

Analyze the user's request and modify the props accordingly. Return the complete modified props object.`;

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
			model: GROQ_MODEL,
			temperature: 0.2,
			max_tokens: 2500,
			response_format: { type: 'json_object' }
		});

		const responseText = chatCompletion.choices[0]?.message?.content || '{}';
		const result = JSON.parse(responseText);

		// Ensure all queries have a LIMIT clause
		const props = result.props || originalProps;
		if (props && props.query) {
			props.query = ensureQueryLimit(props.query, DEFAULT_LIMIT);
		}

		return {
			props: props,
			isModified: result.isModified || false,
			reasoning: result.reasoning || 'No modifications needed',
			modifications: result.modifications || []
		};
	} catch (error) {
		console.error('Error validating/modifying props with Groq:', error);
		// Return original props if error occurs
		return {
			props: originalProps,
			isModified: false,
			reasoning: 'Error occurred during validation, using original props',
			modifications: []
		};
	}
}

/**
 * Legacy function - kept for backward compatibility
 * Use validateAndModifyProps instead for full props modification
 */
export async function validateAndModifyQuery(
	userPrompt: string,
	originalQuery: string,
	componentName: string,
	componentDescription?: string
): Promise<{ query: string; isModified: boolean; reasoning: string }> {

	const schemaDoc = generateSchemaDocumentation();
	try {
		const systemPrompt = `You are an AI assistant that validates and modifies SQL queries based on user requests.

    IMPORTANT: Respond in JSON format.

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
    5. Use proper SQL syntax (Snowflake SQL dialect)

    Respond with a JSON object containing:
    - query: the SQL query (original or modified)
    - isModified: boolean indicating if the query was changed
    - reasoning: brief explanation of your decision

    Example response:
    {"query": "SELECT * FROM supply_chain_data WHERE price > 100", "isModified": true, "reasoning": "Modified the query to filter products by price using the supply_chain_data table and price column from the schema"}

    IMPORTANT:
    - Only modify the query if the user's request requires different data than what the current query provides
    - Always use the exact table and column names from the provided database schema
    - Ensure the query is valid Snowflake SQL syntax`;

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
			model: 	GROQ_MODEL,
			temperature: 0.2,
			max_tokens: 1500,
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

/**
 * Generate a dynamic component for analytical questions when no matching component exists
 * This creates a custom component with appropriate visualization and query
 */
export async function generateAnalyticalComponent(
	userPrompt: string,
	preferredVisualizationType?: string
): Promise<{
	component: Component | null;
	reasoning: string;
	isGenerated: boolean;
}> {
	const schemaDoc = generateSchemaDocumentation();

	try {
		const visualizationConstraint = preferredVisualizationType
			? `\n**IMPORTANT: The user has specifically requested a ${preferredVisualizationType} visualization. You MUST use this type.**\n`
			: '';

		const systemPrompt = `You are an expert data analyst AI that generates appropriate visualizations and SQL queries for user questions.

Database Schema:
${schemaDoc || 'No schema available'}

IMPORTANT: You must respond in valid JSON format.

Given a user's analytical question, your task is to:
${visualizationConstraint}
1. **Determine the best visualization type:**
   - KPICard: Single metric (total, average, count, min, max, percentage)
     Example: "What is total revenue?", "How many customers?", "Average order value?"

   - BarChart: Comparing categories, rankings, distributions
     Example: "Revenue by region", "Top 10 products", "Orders by status"

   - LineChart: Trends over time, time series
     Example: "Revenue trend over time", "Monthly orders", "Sales growth"

   - PieChart: Proportions, percentages, composition
     Example: "Revenue share by category", "Customer distribution", "Market share"

   - DataTable: Detailed lists, multiple attributes
     Example: "Show all customers", "List recent orders", "Product details"

2. **Generate appropriate SQL query:**
   - Use correct table and column names from the schema
   - Use Snowflake SQL dialect
   - For KPICard: Return single row with column alias "value"
   - For Charts: Return appropriate columns (name/label and value, or x and y)
   - For Table: Return all relevant columns
   - Add appropriate filters, aggregations, sorting, and limits
   - ALWAYS include a LIMIT clause (default: ${DEFAULT_LIMIT} rows) to prevent large result sets

3. **Create descriptive metadata:**
   - title: Clear, concise title describing what's shown
   - description: Brief explanation of the data and any filters applied

4. **Determine appropriate config:**
   - KPICard: formatter (currency/number/percentage), gradient color
   - BarChart: xKey, yKey, colors, height
   - LineChart: xKey, yKey, colors, height
   - PieChart: nameKey, valueKey, colors, height
   - DataTable: pageSize

**Output Requirements:**

Respond with a JSON object:
{
  "componentType": "KPICard" | "BarChart" | "LineChart" | "PieChart" | "DataTable",
  "query": "SQL query string",
  "title": "Component title",
  "description": "Component description",
  "config": {
    // Type-specific config
  },
  "reasoning": "Explanation of why this visualization and query were chosen",
  "canGenerate": boolean  // true if question can be answered, false if unclear/impossible
}

**Important:**
- Only set canGenerate to true if you can confidently generate a query
- If the question is vague, ambiguous, or unrelated to the available data, set canGenerate to false
- Ensure SQL query uses exact table and column names from the schema
- For time-based queries, use appropriate date functions (CURRENT_DATE, DATEADD, etc.)`;

		const userMessage = `User question: "${userPrompt}"

Analyze this question and generate the appropriate visualization with SQL query.`;

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
			model: GROQ_MODEL,
			temperature: 0.2,
			max_tokens: 2000,
			response_format: { type: 'json_object' }
		});

		const responseText = chatCompletion.choices[0]?.message?.content || '{}';
		const result = JSON.parse(responseText);

		if (!result.canGenerate) {
			return {
				component: null,
				reasoning: result.reasoning || 'Unable to generate component for this question',
				isGenerated: false
			};
		}

		// Ensure the generated query has a LIMIT clause
		const query = ensureQueryLimit(result.query, DEFAULT_LIMIT);

		// Create a dynamic component object
		const dynamicComponent: Component = {
			id: `dynamic_${Date.now()}`,
			name: `Dynamic${result.componentType}`,
			type: result.componentType,
			description: result.description,
			category: 'dynamic',
			keywords: [],
			props: {
				query: query,
				title: result.title,
				description: result.description,
				config: result.config || {}
			}
		};


		return {
			component: dynamicComponent,
			reasoning: result.reasoning || 'Generated dynamic component based on analytical question',
			isGenerated: true
		};
	} catch (error) {
		console.error('Error generating analytical component:', error);
		return {
			component: null,
			reasoning: 'Error occurred while generating component',
			isGenerated: false
		};
	}
}

/**
 * Generate multiple dynamic components for analytical questions
 * This is used when the user needs multiple visualizations
 */
export async function generateMultipleAnalyticalComponents(
	userPrompt: string,
	visualizationTypes: string[]
): Promise<{
	components: Component[];
	reasoning: string;
	isGenerated: boolean;
}> {
	try {
		console.log('✓ Generating multiple components:', visualizationTypes);

		const components: Component[] = [];

		// Generate each component type requested
		for (const vizType of visualizationTypes) {
			const result = await generateAnalyticalComponent(userPrompt, vizType);

			if (result.component) {
				components.push(result.component);
			}
		}

		if (components.length === 0) {
			return {
				components: [],
				reasoning: 'Failed to generate any components',
				isGenerated: false
			};
		}

		return {
			components,
			reasoning: `Generated ${components.length} components: ${visualizationTypes.join(', ')}`,
			isGenerated: true
		};
	} catch (error) {
		console.error('Error generating multiple analytical components:', error);
		return {
			components: [],
			reasoning: 'Error occurred while generating components',
			isGenerated: false
		};
	}
}

/**
 * Generate a complete multi-component response with intelligent container and component props
 * Uses Groq to determine container title, description, and tailored props for each component
 */
export async function generateMultiComponentResponse(
	userPrompt: string,
	visualizationTypes: string[]
): Promise<{
	containerComponent: Component | null;
	reasoning: string;
	isGenerated: boolean;
}> {
	const schemaDoc = generateSchemaDocumentation();

	try {
		const systemPrompt = `You are an expert data analyst AI that creates comprehensive multi-component analytical dashboards.

Database Schema:
${schemaDoc || 'No schema available'}

IMPORTANT: You must respond in valid JSON format.

Given a user's analytical question and the required visualization types, your task is to:

1. **Determine Container Metadata:**
   - title: Clear, descriptive title for the entire dashboard (2-5 words)
   - description: Brief explanation of what insights this dashboard provides (1-2 sentences)

2. **Generate Props for Each Component:**
   For each visualization type requested, create tailored props:

   - **query**: SQL query specific to this visualization using the database schema
     * Use correct table and column names
     * Use Snowflake SQL dialect
     * ALWAYS include LIMIT clause (default: ${DEFAULT_LIMIT})
     * For KPICard: Return single row with column alias "value"
     * For Charts: Return appropriate columns (name/label and value, or x and y)
     * For Table: Return relevant columns

   - **title**: Specific title for this component (2-4 words)

   - **description**: What this specific component shows (1 sentence)

   - **config**: Type-specific configuration
     * KPICard: { gradient, formatter, icon }
     * BarChart: { xKey, yKey, colors, height }
     * LineChart: { xKey, yKeys, colors, height }
     * PieChart: { nameKey, valueKey, colors, height }
     * DataTable: { pageSize }

**Important Guidelines:**
- Each component should answer a DIFFERENT aspect of the user's question
- Queries should be complementary, not duplicated
- If user asks "Show total revenue and trend", generate:
  * KPICard: Single total value
  * LineChart: Revenue over time
- Ensure queries use valid columns from the schema
- Make titles descriptive and specific to what each component shows

**Output Format:**
{
  "containerTitle": "Dashboard Title",
  "containerDescription": "Brief description of the dashboard insights",
  "components": [
    {
      "componentType": "KPICard" | "BarChart" | "LineChart" | "PieChart" | "DataTable",
      "query": "SQL query",
      "title": "Component title",
      "description": "Component description",
      "config": { /* type-specific config */ }
    },
    ...
  ],
  "reasoning": "Explanation of the dashboard design",
  "canGenerate": boolean
}`;

		const userMessage = `User question: "${userPrompt}"

Required visualization types: ${visualizationTypes.join(', ')}

Generate a complete multi-component dashboard with appropriate container metadata and tailored props for each component.`;

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
			model: GROQ_MODEL,
			temperature: 0.2,
			max_tokens: 3000,
			response_format: { type: 'json_object' }
		});

		const responseText = chatCompletion.choices[0]?.message?.content || '{}';
		const result = JSON.parse(responseText);

		if (!result.canGenerate || !result.components || result.components.length === 0) {
			return {
				containerComponent: null,
				reasoning: result.reasoning || 'Unable to generate multi-component dashboard',
				isGenerated: false
			};
		}

		// Build the component array from the result
		const generatedComponents: Component[] = result.components.map((compData: any, index: number) => {
			// Ensure query has LIMIT
			const query = ensureQueryLimit(compData.query, DEFAULT_LIMIT);

			return {
				id: `dynamic_${compData.componentType.toLowerCase()}_${Date.now()}_${index}`,
				name: `Dynamic${compData.componentType}`,
				type: compData.componentType,
				description: compData.description,
				category: 'dynamic',
				keywords: [],
				props: {
					query: query,
					title: compData.title,
					description: compData.description,
					config: compData.config || {}
				}
			};
		});

		// Create the MultiComponentContainer wrapper
		const containerComponent: Component = {
			id: `multi_container_${Date.now()}`,
			name: 'MultiComponentContainer',
			type: 'Container',
			description: result.containerDescription,
			category: 'dynamic',
			keywords: ['multi', 'container', 'dashboard'],
			props: {
				config: {
					components: generatedComponents,
					layout: 'grid',
					spacing: 24,
					title: result.containerTitle,
					description: result.containerDescription
				}
			}
		};

		return {
			containerComponent,
			reasoning: result.reasoning || `Generated multi-component dashboard with ${generatedComponents.length} components`,
			isGenerated: true
		};
	} catch (error) {
		console.error('Error generating multi-component response:', error);
		return {
			containerComponent: null,
			reasoning: 'Error occurred while generating multi-component dashboard',
			isGenerated: false
		};
	}
}

/**
 * Main orchestration function that classifies question and routes to appropriate handler
 * This is the NEW recommended entry point for handling user requests
 * ALWAYS returns a SINGLE component (wraps multiple in MultiComponentContainer)
 */
export async function handleUserRequest(
	userPrompt: string,
	components: Component[]
): Promise<{
	component: Component | null;
	reasoning: string;
	method: string;
	questionType: string;
	needsMultipleComponents: boolean;
	propsModified?: boolean;
	queryModified?: boolean;
}> {
	try {
		// Step 1: Classify the user's question
		console.log('✓ Classifying user question...');
		const classification = await classifyUserQuestion(userPrompt);
		console.log(`  Question type: ${classification.questionType}`);
		console.log(`  Visualizations needed: ${classification.visualizations.join(', ') || 'None'}`);
		console.log(`  Multiple components: ${classification.needsMultipleComponents}`);

		// Step 2: Route based on question type
		if (classification.questionType === 'analytical') {
			// For analytical questions with specific visualization types
			if (classification.visualizations.length > 0) {
				if (classification.needsMultipleComponents && classification.visualizations.length > 1) {
					// Generate multiple components wrapped in MultiComponentContainer
					console.log('✓ Generating multi-component dashboard...');
					const result = await generateMultiComponentResponse(
						userPrompt,
						classification.visualizations
					);

					return {
						component: result.containerComponent,
						reasoning: result.reasoning,
						method: 'classification-multi-generated',
						questionType: classification.questionType,
						needsMultipleComponents: true,
						propsModified: false,
						queryModified: false
					};
				} else {
					// Generate single component with preferred type
					const vizType = classification.visualizations[0];
					const result = await generateAnalyticalComponent(userPrompt, vizType);

					return {
						component: result.component,
						reasoning: result.reasoning,
						method: 'classification-generated',
						questionType: classification.questionType,
						needsMultipleComponents: false,
						propsModified: false,
						queryModified: false
					};
				}
			} else {
				// No specific visualization type, let AI decide
				const result = await generateAnalyticalComponent(userPrompt);

				return {
					component: result.component,
					reasoning: result.reasoning,
					method: 'classification-generated-auto',
					questionType: classification.questionType,
					needsMultipleComponents: false,
					propsModified: false,
					queryModified: false
				};
			}
		} else if (classification.questionType === 'data_modification') {
			// For data modification, use the old component matching flow
			console.log('✓ Using component matching for data modification...');
			const matchResult = await matchComponentFromGroq(userPrompt, components);

			return {
				component: matchResult.component,
				reasoning: matchResult.reasoning,
				method: 'classification-matched',
				questionType: classification.questionType,
				needsMultipleComponents: false,
				propsModified: matchResult.propsModified,
				queryModified: matchResult.queryModified
			};
		} else {
			// General questions - return empty
			return {
				component: null,
				reasoning: 'General question - no component needed',
				method: 'classification-general',
				questionType: classification.questionType,
				needsMultipleComponents: false
			};
		}
	} catch (error) {
		console.error('Error handling user request:', error);
		throw error;
	}
}

// Using Groq LLM to match component from a list with enhanced props modification
export async function matchComponentFromGroq(
	userPrompt: string,
	components: Component[]
): Promise<{
	component: Component | null;
	reasoning: string;
	queryModified?: boolean;
	queryReasoning?: string;
	propsModified?: boolean;
	propsModifications?: string[];
	method: string;
	confidence?: number;
}> {
	try {
		// Step 1: Enhanced component matching with scoring and multiple candidates
		const componentsText = components
			.map((comp, idx) => {
				const keywords = comp.keywords ? comp.keywords.join(', ') : '';
				const category = comp.category || 'general';
				return `${idx + 1}. ID: ${comp.id}
   Name: ${comp.name}
   Type: ${comp.type}
   Category: ${category}
   Description: ${comp.description || 'No description'}
   Keywords: ${keywords}`;
			})
			.join('\n\n');

		const systemPrompt = `You are an expert AI assistant specialized in matching user requests to the most appropriate data visualization components.

IMPORTANT: You must respond in valid JSON format.

Your task is to analyze the user's natural language request and find the BEST matching component from the available list.

Available Components (${components.length} total):
${componentsText}

**Matching Guidelines:**

1. **Understand User Intent:**
   - What type of data visualization do they need? (KPI/metric, chart, table, etc.)
   - What metric or data are they asking about? (revenue, orders, customers, etc.)
   - Are they asking for a summary (KPI), trend (line chart), distribution (bar/pie), or detailed list (table)?
   - Do they want to compare categories, see trends over time, or show proportions?

2. **Component Type Matching:**
   - KPICard: Single metric/number (total, average, count, percentage, rate)
   - LineChart: Trends over time, time series data
   - BarChart: Comparing categories, distributions, rankings
   - PieChart/DonutChart: Proportions, percentages, market share
   - DataTable: Detailed lists, rankings with multiple attributes

3. **Keyword & Semantic Matching:**
   - Match user query terms with component keywords
   - Consider synonyms (e.g., "sales" = "revenue", "items" = "products")
   - Look for category matches (financial, orders, customers, products, suppliers, logistics, geographic, operations)

4. **Scoring Criteria:**
   - Exact keyword matches: High priority
   - Component type alignment: High priority
   - Category alignment: Medium priority
   - Semantic similarity: Medium priority
   - Specificity: Prefer more specific components over generic ones

**Output Requirements:**

Respond with a JSON object containing:
- componentIndex: the 1-based index of the BEST matching component (or null if confidence < 30%)
- componentId: the ID of the matched component
- reasoning: detailed explanation of why this component was chosen
- confidence: confidence score 0-100 (100 = perfect match)
- alternativeMatches: array of up to 2 alternative component indices with scores (optional)

Example response:
{
  "componentIndex": 5,
  "componentId": "total_revenue_kpi",
  "reasoning": "User asks for 'total revenue' which perfectly matches the TotalRevenueKPI component (KPICard type) designed to show total revenue across all orders. Keywords match: 'total revenue', 'sales'.",
  "confidence": 95,
  "alternativeMatches": [
    {"index": 3, "id": "monthly_revenue_kpi", "score": 75, "reason": "Could show monthly revenue if time period was intended"},
    {"index": 8, "id": "revenue_trend_chart", "score": 60, "reason": "Could show revenue trend if historical view was intended"}
  ]
}

**Important:**
- Only return componentIndex if confidence >= 30%
- Return null if no reasonable match exists
- Prefer components that exactly match the user's metric over generic ones
- Consider the full context of the request, not just individual words`;

		const chatCompletion = await groq.chat.completions.create({
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				{
					role: 'user',
					content: `User request: "${userPrompt}"\n\nFind the best matching component and explain your reasoning with a confidence score.`
				}
			],
			model: GROQ_MODEL,
			temperature: 0.2,
			max_tokens: 800,
			response_format: { type: 'json_object' }
		});

		const responseText = chatCompletion.choices[0]?.message?.content || '{}';
		const result = JSON.parse(responseText);

		const componentIndex = result.componentIndex;
		const componentId = result.componentId;
		const confidence = result.confidence || 0;

		// Prefer componentId over componentIndex for accuracy
		let component = null;
		if (componentId) {
			component = components.find(c => c.id === componentId);
		}

		// Fallback to componentIndex if ID not found
		if (!component && componentIndex) {
			component = components[componentIndex - 1];
		}

		console.log('✓ Groq matched component:', component?.name || 'None');

		if (result.alternativeMatches && result.alternativeMatches.length > 0) {
			console.log('  Alternative matches:');
			result.alternativeMatches.forEach((alt: any) => {
				console.log(`    - ${components[alt.index - 1]?.name} (${alt.score}%): ${alt.reason}`);
			});
		}

		if (!component) {
			console.log('✗ No matching component found (confidence:', confidence + '%)');
			console.log('✓ Attempting to generate dynamic component from analytical question...');

			// Try to generate a dynamic component for the analytical question
			// Note: preferredVisualizationType should be passed from the caller if available
			const generatedResult = await generateAnalyticalComponent(userPrompt);

			if (generatedResult.component) {
				return {
					component: generatedResult.component,
					reasoning: generatedResult.reasoning,
					method: 'groq-generated',
					confidence: 100, // Generated components are considered 100% match to the question
					propsModified: false,
					queryModified: false
				};
			}

			// If generation also failed, return null
			return {
				component: null,
				reasoning: result.reasoning || 'No matching component found and unable to generate dynamic component',
				method: 'groq-llm',
				confidence
			};
		}

		// Step 2: Validate and modify the entire props object based on user request
		let propsModified = false;
		let propsModifications: string[] = [];
		let queryModified = false;
		let queryReasoning = '';

		if (component && component.props) {
			const propsValidation = await validateAndModifyProps(
				userPrompt,
				component.props,
				component.name,
				component.type,
				component.description
			);

			// Create a new component object with the modified props
			const originalQuery = component.props.query;
			const modifiedQuery = propsValidation.props.query;

			component = {
				...component,
				props: propsValidation.props
			};

			propsModified = propsValidation.isModified;
			propsModifications = propsValidation.modifications;
			queryModified = originalQuery !== modifiedQuery;
			queryReasoning = propsValidation.reasoning;

		}

		return {
			component,
			reasoning: result.reasoning || 'No reasoning provided',
			queryModified,
			queryReasoning,
			propsModified,
			propsModifications,
			method: 'groq-llm',
			confidence
		};
	} catch (error) {
		console.error('Error matching component with Groq:', error);
		throw error;
	}
}
