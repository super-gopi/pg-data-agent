import snowflake from 'snowflake-sdk';

const connection = snowflake.createConnection({
  account: 'APDRYTY-PL04919',
  username: 'ASHISHBROKEN',
  password: 'd8Ukz8JNhZa6qgJ',
  role: 'ACCOUNTADMIN',
  warehouse: 'SNOWFLAKE_LEARNING_WH',
  database: 'SNOWFLAKE_SAMPLE_DATA',
  schema: 'TPCH_SF10'
});

// Track connection state
let isConnected = false;
let connectPromise: Promise<void> | null = null;

// Ensure connection is established
const ensureConnection = (): Promise<void> => {
  // If already connected, return immediately
  if (isConnected) {
    return Promise.resolve();
  }

  // If connection is in progress, return the existing promise
  if (connectPromise) {
    return connectPromise;
  }

  // Start new connection
  connectPromise = new Promise((resolve, reject) => {
    connection.connect((err) => {
      if (err) {
        connectPromise = null;
        reject(err);
        return;
      }
      isConnected = true;
      connectPromise = null;
      resolve();
    });
  });

  return connectPromise;
};

const test = async () => {
  await ensureConnection();

  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: `SELECT * FROM LINEITEM LIMIT 10`,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Convert rows to simplified JSON
        const simplifiedData = rows?.map(row => {
          const simplified: any = {};
          for (const [key, value] of Object.entries(row) as any) {
            // Handle Snowflake date objects
            if (value && typeof value === 'object' && 'toJSON' in value) {
              simplified[key] = value.toJSON();
            } else {
              simplified[key] = value;
            }
          }
          return simplified;
        });

        resolve(simplifiedData);
      }
    });
  });
}


const execute_query = async (sql: string): Promise<any[]> => {
  // Ensure we're connected before executing
  await ensureConnection();

  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Convert rows to simplified JSON
        const simplifiedData = rows?.map(row => {
          const simplified: any = {};
          for (const [key, value] of Object.entries(row) as any) {
            // Handle Snowflake date objects
            if (value && typeof value === 'object' && 'toJSON' in value) {
              simplified[key] = value.toJSON();
            } else {
              simplified[key] = value;
            }
          }
          return simplified;
        }) || [];

        resolve(simplifiedData);
      }
    });
  });
}

// Clean disconnect
const disconnect = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!isConnected) {
      resolve();
      return;
    }

    connection.destroy((err) => {
      if (err) {
        reject(err);
        return;
      }
      isConnected = false;
      resolve();
    });
  });
}

const SNOWFLAKE = {
  test,
  execute_query,
  disconnect,
  ensureConnection
}

export default SNOWFLAKE;
