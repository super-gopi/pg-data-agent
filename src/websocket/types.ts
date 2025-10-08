export interface  WebSocketMessage {
	id: string;
	type: string;
	from: string;
	payload: any;
}