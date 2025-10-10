import { queryTable, QueryParams, executeRawSQL } from './db/queries';
import { supplyChainData } from './db/schema';
import { SASDK } from './main';
import { WebSocketClient } from './websocket/websocket-client';

async function main() {
	try {
		console.log('Starting application...');

		// Initialize WebSocket client
		const wsClient = new WebSocketClient();

		// Connect to WebSocket server
		await wsClient.connect();

		console.log('✓ Application ready and listening for messages');

		// Handle graceful shutdown
		process.on('SIGINT', () => {
			console.log('\nShutting down gracefully...');
			wsClient.disconnect();
			process.exit(0);
		});

		SASDK();
	
	} catch (error) {
		console.error('Error starting application:', error);
		process.exit(1);
	}
}

main();
