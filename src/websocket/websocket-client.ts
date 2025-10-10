import WebSocket from 'ws';
import dotenv from 'dotenv';
import { executeRawSQL } from '../db/queries';
import { matchComponentFromPrompt, Component } from '../llm/groq-client';
import { WebSocketMessage } from './types';

dotenv.config();

export class WebSocketClient {
	private ws: WebSocket | null = null;
	private url: string;
	private reconnectInterval: number = 5000;
	private reconnectAttempts: number = 0;
	private maxReconnectAttempts: number = 10;
	private shouldReconnect: boolean = true;

	private components: Component[] = [];

	constructor(url?: string, timeout?: number) {
		this.url = url || process.env.WEBSOCKET_URL || '';

		if (!this.url) {
			throw new Error('WEBSOCKET_URL is not defined in environment variables');
		}

	}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				const user_id = process.env.USER_ID || 'user123';
				const project_id = process.env.PROJECT_ID || 'project123';

				const ws_url = new URL(this.url);

				ws_url.searchParams.set('userId', user_id);
				ws_url.searchParams.set('projectId', project_id);
				ws_url.searchParams.set('type', 'data-agent');

				console.log("connecting to websocket", ws_url.toString());
				this.ws = new WebSocket(ws_url.toString());

				this.ws.on('open', () => {
					this.reconnectAttempts = 0;
					resolve();
				});

				this.ws.on('message', (data: WebSocket.Data) => {
					this.handleMessage(data);
				});

				this.ws.on('error', (error: Error) => {
					console.error('WebSocket error:', error.message);
					reject(error);
				});

				this.ws.on('close', (code: number, reason: Buffer) => {
					console.log(`WebSocket closed: ${code} - ${reason.toString()}`);
					this.handleReconnect();
				});

			} catch (error) {
				reject(error);
			}
		});
	}

	private handleMessage(data: WebSocket.Data): void {
		const message = data.toString();
		console.log('Received message:');

		let json:any = {};

		try{
			json = JSON.parse(message);
			console.log('Parsed message:', json.type, json.from?.type, json.to?.type);
		} catch (e) {
			console.log('Error parsing message as JSON:', e);

		}

		this.onMessage(json);

	}

	private onMessage(data: any): void {
		if (data.type === 'data_req') {
			this.handleDataReq(data);
		} 
		else if (data.type === 'user_prompt_suggestions') {
			console.log('Connection acknowledged by server');
		} 
		else if (data.type === 'user_prompt_req') {
			this.handleUserPromptReq(data);
		} 
		else if (data.type === 'component_list') {
			this.handleComponentListRes(data);
		}
		else {
			console.warn('Unknown message type:', data);
		}
	}

	send(data: any): boolean {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.error('WebSocket is not connected');
			return false;
		}

		try {
			const message = typeof data === 'string' ? data : JSON.stringify(data);
			this.ws.send(message);
			return true;
		} catch (error) {
			console.error('Error sending message:', error);
			return false;
		}
	}

	async handleDataReq(data: WebSocketMessage) {
		const id = data.id || 'unknown';

		try {
			const query = data.payload?.query ;
			let response: any = {
				id: id,
				type: 'data_res',
				from: {
					type: 'data_agent',
				},
				to:{
					type: 'runtime',
					id: data.from?.id,
				},
				payload: null
			}

			if(!query || query.trim().length === 0) {
				response.payload = { error: 'Invalid query' };
				this.send(JSON.stringify(response));
				return;
			}

			// Execute query
			const result = await executeRawSQL(query);
			if (!result.success) {
				console.error('Query execution failed:', result.errors);
				response.payload = result.errors;
			}
			// Send result back to server
			response.payload = result.data;

			// console.log('Sending response:', response);
			this.send(JSON.stringify(response));
			console.log('Query result sent back to server');
		} catch (error) {
			console.error('Error processing message:', error);
			this.send({
				id: id,
				type: 'data_res',
				from: {
					type: 'data_agent',
				},
				to:{
					type: 'runtime',
					id: data.from?.id,
				},
				payload: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}

	async handleUserPromptSuggestions(data: any) {
		const id = data.id || 'unknown';
		const prompt = data.payload?.prompt || '';

		try {
			if (!prompt || prompt.trim().length === 0) {
				throw new Error('Prompt cannot be empty');
			}


			//use groq to get suggestions

			const response: WebSocketMessage = {
				id: id,
				type: 'user_prompt_suggestions_res',
				from: {
					type: 'data_agent',
				},
				to:{
					type: 'runtime',
					id: data.from?.id,
				},
				payload: null
			};

			this.send(JSON.stringify(response));
			console.log('Sent user prompt suggestions response');

		} catch (error) {
			console.error('Error handling user prompt suggestions:', error);
			this.send({
				id: id,
				type: 'user_prompt_suggestions_res',
				from: {
					type: 'data_agent',
				},
				to:{
					type: 'runtime',
					id: data.from?.id,
				},
				payload: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}

	async handleUserPromptReq(data: any) {
		const id = data.id || 'unknown';
		const prompt = data.payload?.prompt || '';

		try {
			if (!prompt || prompt.trim().length === 0) {
				throw new Error('Prompt cannot be empty');
			}


			// Check if components are loaded in memory
			if (this.components.length === 0) {
				throw new Error('Components not loaded. Please ensure components are fetched first.');
			}


			// Use Groq to match component
			console.log('Matching component using Groq LLM...');
			const matchResult = await matchComponentFromPrompt(prompt, this.components);

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
					reasoning: matchResult.reasoning
				}
			};

			this.send(JSON.stringify(response));
			console.log('Sent user prompt response with matched component:', matchResult.component?.name);

		} catch (error) {
			console.error('Error handling user prompt:', error);
			this.send({
				id: id,
				type: 'user_prompt_res',
				from: {
					type: 'data_agent',
				},
				to:{
					type: 'runtime',
					id: data.from?.id,
				},
				payload: { error: error instanceof Error ? error.message : 'Unknown error' }
			});
		}
	}

	private handleReconnect(): void {
		if (!this.shouldReconnect) {
			console.log('Reconnection disabled, not attempting to reconnect');
			return;
		}

		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error('Max reconnect attempts reached. Giving up.');
			return;
		}

		this.reconnectAttempts++;
		console.log(`Reconnecting... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

		setTimeout(() => {
			this.connect().catch((error) => {
				console.error('Reconnection failed:', error.message);
			});
		}, this.reconnectInterval);
	}

	private handleComponentListRes(data: WebSocketMessage) {
		// Store components in memory
		this.components = data.payload?.components || [];
		console.log(`✓ Stored ${this.components.length} components in memory`);

	}

	disconnect(): void {
		this.shouldReconnect = false;
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}
}
