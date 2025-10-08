import { queryTable, QueryParams, executeRawSQL } from './db/queries';
import { supplyChainData } from './db/schema';
import { WebSocketClient } from './websocket/websocket-client';

async function main() {
	try {
		console.log('Starting application...');

		// Initialize WebSocket client
		const wsClient = new WebSocketClient();

		// Connect to WebSocket server
		console.log('Connecting to WebSocket server...');
		await wsClient.connect();

		// Send initial connection message
		// wsClient.send({
		//   type: 'connection',
		//   message: 'Node.js client connected',
		//   timestamp: new Date().toISOString(),
		// });

		console.log('✓ Application ready and listening for messages');

		//ask for project components
		await wsClient.getComponents().catch((e) => {
			console.error('Error getting components:', e);
		});
		

		// Handle graceful shutdown
		process.on('SIGINT', () => {
			console.log('\nShutting down gracefully...');
			wsClient.disconnect();
			process.exit(0);
		});

	} catch (error) {
		console.error('Error starting application:', error);
		process.exit(1);
	}
}

main();
