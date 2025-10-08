import { db } from './db';
import { asc, desc, and, eq, gt, gte, lt, lte, like, ilike, sql } from 'drizzle-orm';

export interface QueryParams {
	limit?: number;
	offset?: number;
	orderBy?: {
		column: string;
		direction?: 'asc' | 'desc';
	};
	where?: {
		column: string;
		operator?: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike';
		value: any;
	}[];
}

export interface QueryResult {
	success: boolean;
	data?: any;
	errors?: string[];
}

export async function queryTable(
	table: any,
	params?: QueryParams
): Promise<QueryResult> {
	try {
		let query: any = db.select().from(table);

		// Apply WHERE conditions
		if (params?.where && params.where.length > 0) {
			const conditions = params.where.map((condition) => {
				const column = (table as any)[condition.column];
				const operator = condition.operator || 'eq';

				switch (operator) {
					case 'eq':
						return eq(column, condition.value);
					case 'gt':
						return gt(column, condition.value);
					case 'gte':
						return gte(column, condition.value);
					case 'lt':
						return lt(column, condition.value);
					case 'lte':
						return lte(column, condition.value);
					case 'like':
						return like(column, condition.value);
					case 'ilike':
						return ilike(column, condition.value);
					default:
						return eq(column, condition.value);
				}
			});

			query = query.where(and(...conditions));
		}

		// Apply ORDER BY
		if (params?.orderBy) {
			const column = (table as any)[params.orderBy.column];
			const direction = params.orderBy.direction || 'asc';
			query = query.orderBy(direction === 'asc' ? asc(column) : desc(column));
		}

		// Apply LIMIT
		if (params?.limit) {
			query = query.limit(params.limit);
		}

		// Apply OFFSET
		if (params?.offset) {
			query = query.offset(params.offset);
		}

		const data = await query;

		return {
			success: true,
			data,
		};
	} catch (error) {
		return {
			success: false,
			errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
		};
	}
}

export async function executeRawSQL(rawSQL: string): Promise<QueryResult> {
	try {
		if (!rawSQL || rawSQL.trim().length === 0) {
			return {
				success: false,
				errors: ['SQL query cannot be empty'],
			};
		}

		// Execute raw SQL query
		const data = await db.execute(sql.raw(rawSQL));

		return {
			success: true,
			data,
		};
	} catch (error) {
		return {
			success: false,
			errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
		};
	}
}
