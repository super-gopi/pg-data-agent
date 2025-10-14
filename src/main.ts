import { SuperatomSDK } from '@superatomai/sdk';
import { executeRawSQL } from './db/queries';
 
// Initialize and connect to SuperAtom
const sdk = new SuperatomSDK({
  apiKey: 'YOUR_API_KEY',
  projectId: "snowflake-dataset",
  bundleDir: "/home/gopinadh/superatom/snowflake-dataset/frontend/dist/assets",
  type: "data-agent",
  userId: "gopi",
});
 
export async function SASDK() {
  console.log('HELLO\r\n\r\n');
  try {
    // Connect to SuperAtom
    await sdk.connect();
    console.log('Successfully connected to SuperAtom!');
 
    // Your code here

    sdk.addCollection('supply_chain_data', "GET_MANY",() => {
        executeRawSQL("SELECT * FROM supply_chain_data").then((result) => {
            console.log(result);
        }); 
    });
 
  } catch (error) {
    console.error('Failed to connect to SuperAtom:', error);
    process.exit(1);
  }
}
 