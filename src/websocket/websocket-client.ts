import WebSocket from 'ws';
import dotenv from 'dotenv';
import { executeRawSQL } from '../db/queries';
import { matchComponentFromGroq } from '../userResponse/groq-client';
import { WebSocketMessage } from './types';
import CHROMACOLLECTION from '../chromadb/collections';
import { Component } from '../userResponse/types';
import { matchComponentFromChromaDB } from '../userResponse/chorma-vector-search';
import { get_user_response } from '../userResponse';
import SNOWFLAKE from '../snowflake';
import { validateMessageSize } from '../userResponse/utils';
import { decodeBase64ToJson } from '../auth/utils';
import { authenticateAndStoreUserId, verifyAuthToken } from '../auth/validator';

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
				const user_id = process.env.USER_ID || 'gopi';
				const project_id = process.env.PROJECT_ID || 'snowflake-dataset';

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
		else if (data.type === 'sf_data_req') {
			this.handleSfDataReq(data);
		}
		else if (data.type === 'user_prompt_req') {
			this.handleUserPromptReq(data);
		}
		else if (data.type === 'component_list') {
			this.handleComponentListRes(data);
		}
		else if (data.type === 'auth_login_req') {
			this.handleAuthLoginReq(data);
		}
		else if (data.type === 'auth_verify_req') {
			this.handleAuthVerifyReq(data);
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

			// Validate message size (1MB limit)
			const validation = validateMessageSize(message, 1048576);
			if (!validation.isValid) {
				console.error(`Message too large: ${validation.size} bytes > ${validation.maxSize} bytes (${(validation.size / 1048576).toFixed(2)}MB)`);

				// Send error response instead
				const errorData = typeof data === 'string' ? JSON.parse(data) : data;
				const errorResponse = {
					id: errorData.id,
					type: errorData.type,
					from: errorData.from,
					to: errorData.to,
					payload: {
						error: `Response too large (${(validation.size / 1048576).toFixed(2)}MB). Please add LIMIT to your query or request less data.`
					}
				};
				this.ws.send(JSON.stringify(errorResponse));
				return false;
			}

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

			this.send(JSON.stringify(response));
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

	async handleSfDataReq(data: WebSocketMessage) {
		const id = data.id || 'unknown';

		try {
			const query = data.payload?.query;
			let response: any = {
				id: id,
				type: 'sf_data_res',
				from: {
					type: 'data_agent',
				},
				to: {
					type: 'runtime',
					id: data.from?.id,
				},
				payload: null
			};

			if (!query || query.trim().length === 0) {
				response.payload = { error: 'Invalid query' };
				this.send(JSON.stringify(response));
				return;
			}
			// Execute Snowflake query
			const result = await SNOWFLAKE.execute_query(query);

			// Send result back to server
			response.payload = result;

			this.send(JSON.stringify(response));
		} catch (error) {
			console.error('Error processing Snowflake query:', error);
			this.send({
				id: id,
				type: 'sf_data_res',
				from: {
					type: 'data_agent',
				},
				to: {
					type: 'runtime',
					id: data.from?.id,
				},
				payload: { error: error instanceof Error ? error.message : 'Unknown error' }
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
		
		const response = await get_user_response(data, this.components);
		if(!response.success) {
			this.send({
				id: data.id,
				type: 'user_prompt_res',
				from: {
					type: 'data_agent',
				},
				to:{
					type: 'runtime',
					id: data.from?.id,
				},
				payload: { error: response.reason }
			});	
			return;
		}

		this.send(JSON.stringify(response.response));

	}

	handleAuthLoginReq(data: WebSocketMessage) {
		const id = data.id || 'unknown';

		try {
			// Extract base64 encoded login data from payload
			const loginDataBase64 = data.payload?.login_data;

			let response: any = {
				id: id,
				type: 'auth_login_res',
				from: {
					type: 'data-agent',
				},
				to: {
					type: 'runtime',
					id: data.from?.id,
				},
				payload: null
			};

			// Validate login_data exists
			if (!loginDataBase64) {
				response.payload = {
					success: false,
					message: 'Login data is required'
				};
				this.send(JSON.stringify(response));
				return;
			}

			// Decode base64 data and parse JSON
			let loginData: any;
			try {
				loginData = decodeBase64ToJson(loginDataBase64);
			} catch (error) {
				response.payload = {
					success: false,
					message: 'Invalid login data format'
				};
				this.send(JSON.stringify(response));
				return;
			}

			// Extract username and password from decoded data
			const { username, password } = loginData;

			if (!username || !password) {
				response.payload = {
					success: false,
					message: 'Username and password are required'
				};
				this.send(JSON.stringify(response));
				return;
			}

			// Get userId from the message sender
			const userId = data.from?.id;

			if (!userId) {
				response.payload = {
					success: false,
					message: 'User ID not found in request'
				};
				this.send(JSON.stringify(response));
				return;
			}

			// Authenticate user and store userId
			const authResult = authenticateAndStoreUserId(
				{ username, password },
				userId
			);

			// Send response
			response.payload = {
				success: authResult.success,
				message: authResult.message,
				username: authResult.username
			};

			this.send(JSON.stringify(response));

		} catch (error) {
			console.error('Error processing auth login request:', error);
			this.send({
				id: id,
				type: 'auth_login_res',
				from: {
					type: 'data-agent',
				},
				to: {
					type: 'runtime',
					id: data.from?.id,
				},
				payload: {
					success: false,
					message: error instanceof Error ? error.message : 'Unknown error occurred'
				}
			});
		}
	}

	handleAuthVerifyReq(data: WebSocketMessage) {
		const id = data.id || 'unknown';

		try {
			// Extract auth_token from payload
			const authToken = data.payload?.auth_token;

			let response: any = {
				id: id,
				type: 'auth_verify_res',
				from: {
					type: 'data-agent',
				},
				to: {
					type: 'runtime',
					id: data.from?.id,
				},
				payload: null
			};

			// Validate auth_token exists
			if (!authToken) {
				response.payload = {
					valid: false,
					message: 'Auth token is required'
				};
				this.send(JSON.stringify(response));
				return;
			}

			// Verify the auth token
			const verificationResult = verifyAuthToken(authToken);

			// Send response with valid field
			response.payload = {
				valid: verificationResult.success,
				message: verificationResult.message,
				username: verificationResult.username
			};

			this.send(JSON.stringify(response));

		} catch (error) {
			console.error('Error processing auth verify request:', error);
			this.send({
				id: id,
				type: 'auth_verify_res',
				from: {
					type: 'data-agent',
				},
				to: {
					type: 'runtime',
					id: data.from?.id,
				},
				payload: {
					valid: false,
					message: error instanceof Error ? error.message : 'Unknown error occurred'
				}
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

	private async handleComponentListRes(data: WebSocketMessage) {
		// Store components in memory
		this.components = data.payload?.components || [];
		console.log(`✓ Stored ${this.components.length} components in memory`);

		// Store the components to ChromaDB (only if using ChromaDB method)
		const matchingMethod = process.env.COMPONENT_MATCHING_METHOD || 'chromadb';

		if (matchingMethod === 'chromadb') {
			try {
				const projectId = process.env.PROJECT_ID || '';
				const collectionName = projectId + '_components';
				const forceRecreate = process.env.FORCE_RECREATE_COLLECTION === 'true';

				// Check if collection exists and has components
				const exists = await CHROMACOLLECTION.collectionExists(collectionName);

				if (exists && !forceRecreate) {
					await CHROMACOLLECTION.getCollectionCount(collectionName);
				} else {
					if (exists && forceRecreate) {
						await CHROMACOLLECTION.deleteCollection(collectionName);
					}
					// Collection doesn't exist, create and add components
					console.log(`Creating new collection "${collectionName}" and adding components...`);
					await CHROMACOLLECTION.addComponents(collectionName, this.components);
				}
			} catch (error) {
				console.error('⚠️  ChromaDB not available:', (error as Error).message);
				console.error('Falling back to Groq LLM method. Set COMPONENT_MATCHING_METHOD=groq in .env to avoid this warning.');
				// Don't throw - allow the application to continue even if ChromaDB storage fails
			}
		} else {
		}
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
