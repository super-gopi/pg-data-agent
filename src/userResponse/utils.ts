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