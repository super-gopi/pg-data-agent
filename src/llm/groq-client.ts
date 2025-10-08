import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export interface Component {
  name: string;
  description?: string;
  [key: string]: any;
}

export async function matchComponentFromPrompt(
  userPrompt: string,
  components: Component[]
): Promise<{ component: Component | null; reasoning: string }> {
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
    const component = componentIndex ? components[componentIndex - 1] : null;

    console.log('Groq response:', result, component);

    return {
      component,
      reasoning: result.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error('Error matching component with Groq:', error);
    throw error;
  }
}
