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
	private timeout: number = 3000; // 30 seconds default timeout
	private pendingRequests: Map<string, {
		resolve: (data: any) => void;
		reject: (error: Error) => void;
		timeoutId: NodeJS.Timeout;
	}> = new Map();
	private components: Component[] = [];

	constructor(url?: string, timeout?: number) {
		this.url = url || process.env.WEBSOCKET_URL || '';

		if (!this.url) {
			throw new Error('WEBSOCKET_URL is not defined in environment variables');
		}

		if (timeout) {
			this.timeout = timeout;
		}
	}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				console.log(`Connecting to WebSocket server: ${this.url}`);
				const user_id = process.env.USER_ID || 'user123';
				const ws_url = new URL(this.url);
				ws_url.searchParams.set('userId', user_id);
				this.ws = new WebSocket(ws_url.toString());

				this.ws.on('open', () => {
					console.log('✓ WebSocket connected successfully');
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
					// Reject all pending requests
					this.pendingRequests.forEach((request) => {
						clearTimeout(request.timeoutId);
						request.reject(new Error('WebSocket disconnected'));
					});
					this.pendingRequests.clear();
					this.handleReconnect();
				});

				this.ws.on('ping', () => {
					this.ws?.pong();
				});

			} catch (error) {
				reject(error);
			}
		});
	}

	private handleMessage(data: WebSocket.Data): void {
		try {
			const message = data.toString();
			console.log('Received message:', message);

			// Try to parse as JSON
			try {
				const jsonData = JSON.parse(message);

				// Check if this message is a response to a pending request
				const messageId = jsonData.id;
				if (messageId && this.pendingRequests.has(messageId)) {
					const request = this.pendingRequests.get(messageId)!;
					clearTimeout(request.timeoutId);
					this.pendingRequests.delete(messageId);
					console.log('Resolving request for messageId:', messageId);
					request.resolve(jsonData);
				} else {
					// Normal message, pass to message handler
					this.onMessage(jsonData);
				}
			} catch {
				// If not JSON, handle as plain text
				this.onMessage(message);
			}
		} catch (error) {
			console.error('Error handling message:', error);
		}
	}

	private onMessage(data: any): void {
		console.log('Message received:', data);
		if (typeof data === 'object') {
			if (data.type === 'data_req') {
				this.handleDataReq(data);
			} else if (data.type === 'user_prompt_suggestions') {
				console.log('Connection acknowledged by server');
			} else if (data.type === 'user_prompt_req') {
				this.handleUserPromptReq(data);
			}
		} else {
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

	async sendWithResponse(messageId: string, message: any, timeout?: number): Promise<any> {
		return new Promise((resolve, reject) => {
			if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
				reject(new Error('WebSocket is not connected'));
				return;
			}

			const timeoutMs = timeout ?? this.timeout;

			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(messageId);
				reject(new Error(`WebSocket timeout after ${timeoutMs}ms`));
			}, timeoutMs);

			this.pendingRequests.set(messageId, { resolve, reject, timeoutId });

			const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
			this.ws.send(messageStr);
		});
	}

	async handleDataReq(data: WebSocketMessage) {
		const id = data.id || 'unknown';

		try {
			const query = data.payload?.query ;
			let response: any = {
				id: id,
				type: 'data_res',
				from: 'data_agent',
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
			console.log('Query executed, preparing to send result...');
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
				from: 'data_agent',
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

			console.log('Received user prompt:', prompt);

			//use groq to get suggestions

			const response = {
				id: id,
				type: 'user_prompt_suggestions_res',
				from: 'data_agent',
				payload: null
			};

			this.send(JSON.stringify(response));
			console.log('Sent user prompt suggestions response');

		} catch (error) {
			console.error('Error handling user prompt suggestions:', error);
			this.send({
				id: id,
				type: 'user_prompt_suggestions_res',
				from: 'data_agent',
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

			console.log('Received user prompt:', prompt);

			// Check if components are loaded in memory
			if (this.components.length === 0) {
				throw new Error('Components not loaded. Please ensure components are fetched first.');
			}

			console.log(`Using ${this.components.length} components from memory`);

			// Use Groq to match component
			console.log('Matching component using Groq LLM...');
			const matchResult = await matchComponentFromPrompt(prompt, this.components);

			const response = {
				id: id,
				type: 'user_prompt_res',
				from: 'data_agent',
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
				from: 'data_agent',
				payload: { error: error instanceof Error ? error.message : 'Unknown error' }
			});
		}
	}


	//ask for project components
	async getComponents() {
		try {
			console.log('Requesting component list from frontend...');
			const componentListRequest = {
				id: `component-list-${Date.now()}`,
				type: 'component_list_req',
				from: 'data_agent',
				payload: {}
			};

			const response = await this.sendWithResponse(
				componentListRequest.id,
				componentListRequest,
				30000 // 30 second timeout
			);

			console.log('Received component list:', response);

			// Store components in memory
			this.components = response.payload || response;
			console.log(`✓ Stored ${this.components.length} components in memory`);

			return this.components;
		} catch (error) {
			console.error('Failed to get component list:', error);
			throw error;
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
