import * as schema from '../db/schema';

// Generate database schema documentation for LLM
export function generateSchemaDocumentation(): string {
  const tables: string[] = [];

  // Extract schema information from the imported schema
  for (const [tableName, table] of Object.entries(schema)) {
    if (typeof table === 'object' && table !== null && 'dbName' in table) {
      const columns: string[] = [];

      // Get columns from the table definition
      const tableObj = table as any;
      if (tableObj._) {
        const tableConfig = tableObj._;
        if (tableConfig.columns) {
          for (const [colKey, colDef] of Object.entries(tableConfig.columns)) {
            const col = colDef as any;
            const colName = col.name || colKey;
            const colType = col.dataType || 'unknown';
            const isPrimaryKey = col.primary ? ' (PRIMARY KEY)' : '';
            const isNotNull = col.notNull ? ' NOT NULL' : '';
            columns.push(`  - ${colName}: ${colType}${isPrimaryKey}${isNotNull}`);
          }
        }
      }

      if (columns.length > 0) {
        const dbName = tableObj._.name || tableName;
        tables.push(`Table: ${dbName}\nColumns:\n${columns.join('\n')}`);
      }
    }
  }

  return tables.join('\n\n');
}