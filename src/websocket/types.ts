export interface  WebSocketMessage {
	id: string;
	type: string;
	from: {
		type?: 'admin' | 'data_agent' | 'runtime';
		id?: string;
	};
	to: {
		type?: 'admin' | 'data_agent' | 'runtime';
		id?: string;
	};
	payload: any;
}