import snowflakeSchema from './snowflake-schema.json';

// Generate database schema documentation for LLM from Snowflake JSON schema
export function generateSchemaDocumentation(): string {
  const tables: string[] = [];

  // Header information
  tables.push(`Database: ${snowflakeSchema.database}`);
  tables.push(`Schema: ${snowflakeSchema.schema}`);
  tables.push(`Description: ${snowflakeSchema.description}`);
  tables.push('');
  tables.push('='.repeat(80));
  tables.push('');

  // Process each table
  for (const table of snowflakeSchema.tables) {
    const tableInfo: string[] = [];

    tableInfo.push(`TABLE: ${table.fullName}`);
    tableInfo.push(`Description: ${table.description}`);
    tableInfo.push(`Row Count: ~${table.rowCount.toLocaleString()}`);
    tableInfo.push('');
    tableInfo.push('Columns:');

    // Process columns
    for (const column of table.columns) {
      let columnLine = `  - ${column.name}: ${column.type}`;

      if ((column as any).isPrimaryKey) {
        columnLine += ' (PRIMARY KEY)';
      }

      if ((column as any).isForeignKey && (column as any).references) {
        columnLine += ` (FK -> ${(column as any).references.table}.${(column as any).references.column})`;
      }

      if (!column.nullable) {
        columnLine += ' NOT NULL';
      }

      if (column.description) {
        columnLine += ` - ${column.description}`;
      }

      tableInfo.push(columnLine);

      // Add value examples for categorical columns
      if ((column as any).sampleValues && (column as any).sampleValues.length > 0) {
        tableInfo.push(`    Sample values: [${(column as any).sampleValues.join(', ')}]`);
      }

      // Add statistics if available
      if ((column as any).statistics) {
        const stats = (column as any).statistics;
        if (stats.min !== undefined && stats.max !== undefined) {
          tableInfo.push(`    Range: ${stats.min} to ${stats.max}`);
        }
        if (stats.distinct !== undefined) {
          tableInfo.push(`    Distinct values: ${stats.distinct.toLocaleString()}`);
        }
      }
    }

    tableInfo.push('');
    tables.push(tableInfo.join('\n'));
  }

  // Add relationships section
  tables.push('='.repeat(80));
  tables.push('');
  tables.push('TABLE RELATIONSHIPS:');
  tables.push('');

  for (const rel of snowflakeSchema.relationships) {
    tables.push(`${rel.from} -> ${rel.to} (${rel.type}): ${rel.keys.join(' = ')}`);
  }

  return tables.join('\n');
}

// Generate a concise schema summary for shorter prompts
export function generateSchemaDocumentationConcise(): string {
  const tables: string[] = [];

  tables.push(`Database: ${snowflakeSchema.schema}`);
  tables.push('');

  for (const table of snowflakeSchema.tables) {
    const columns = table.columns
      .map(col => {
        let desc = `${col.name}:${col.type}`;
        if ((col as any).isPrimaryKey) desc += '(PK)';
        if ((col as any).isForeignKey) desc += '(FK)';
        return desc;
      })
      .join(', ');

    tables.push(`${table.name}: ${columns}`);
  }

  return tables.join('\n');
}

/**
 * Ensures a SQL query has a LIMIT clause to prevent large result sets
 * Only applies to SELECT queries - leaves INSERT, UPDATE, DELETE, etc. unchanged
 * @param query - The SQL query to check
 * @param defaultLimit - Default limit to apply if none exists (default: 50)
 * @returns The query with a LIMIT clause (if it's a SELECT query)
 */
export function ensureQueryLimit(query: string, defaultLimit: number = 50): string {
  if (!query || query.trim().length === 0) {
    return query;
  }

  const trimmedQuery = query.trim();

  // Only apply LIMIT to SELECT queries
  // Check if the query is a SELECT statement (not INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, etc.)
  const isSelectQuery = /^\s*SELECT\b/i.test(trimmedQuery) ||
                        /^\s*WITH\b.*\bSELECT\b/is.test(trimmedQuery); // Also handle CTEs (WITH clause)

  if (!isSelectQuery) {
    // Not a SELECT query, return as-is
    return query;
  }

  // Check if query already has a LIMIT clause
  const hasLimit = /\bLIMIT\s+\d+/i.test(trimmedQuery);

  if (hasLimit) {
    return query;
  }

  // Add LIMIT clause at the end (before any trailing semicolon)
  let modifiedQuery = trimmedQuery;
  if (modifiedQuery.endsWith(';')) {
    modifiedQuery = modifiedQuery.slice(0, -1).trim();
  }

  modifiedQuery = `${modifiedQuery} LIMIT ${defaultLimit}`;

  // Add back the semicolon if it was there
  if (trimmedQuery.endsWith(';')) {
    modifiedQuery += ';';
  }

  return modifiedQuery;
}

/**
 * Calculates the size of a JSON object in bytes
 * @param obj - The object to measure
 * @returns Size in bytes
 */
export function getJsonSizeInBytes(obj: any): number {
  const jsonString = JSON.stringify(obj);
  return Buffer.byteLength(jsonString, 'utf8');
}

/**
 * Checks if a message exceeds the WebSocket size limit
 * @param message - The message object to check
 * @param maxSize - Maximum size in bytes (default: 1MB)
 * @returns Object with isValid flag and size information
 */
export function validateMessageSize(message: any, maxSize: number = 1048576): { isValid: boolean; size: number; maxSize: number } {
  const size = getJsonSizeInBytes(message);
  return {
    isValid: size <= maxSize,
    size,
    maxSize
  };
}