import chromaClient from "./index";
import embeddingService from "../fastembed/embedding-service";
import { Component } from "../userResponse/types";

const getOrCreateCollection = async (collectionName: string) => {
    const collection = await chromaClient.getOrCreateCollection({
        name: collectionName,
        metadata: {
            "hnsw:space": "cosine" // Use cosine similarity for vector search
        }
        // Note: We don't specify an embeddingFunction because we provide embeddings directly via FastEmbed
    });
    return collection;
};

const collectionExists = async (collectionName: string): Promise<boolean> => {
    try {
        const collections = await chromaClient.listCollections();
        return collections.some(col => col.name === collectionName);
    } catch (error) {
        console.error('Error checking if collection exists:', error);
        return false;
    }
};

const getCollectionCount = async (collectionName: string): Promise<number> => {
    try {
        // Use getCollection instead of getOrCreateCollection to avoid the warning
        const collection = await chromaClient.getCollection({
            name: collectionName,
        });
        const count = await collection.count();
        return count;
    } catch (error) {
        console.error('Error getting collection count:', error);
        return 0;
    }
};

const addComponents = async (collectionName: string, components: Component[]) => {
    try {
        const collection = await getOrCreateCollection(collectionName);

        // Generate embeddings for each component
        // Include keywords and use cases to improve semantic matching
        const documents = components.map(comp => {
            const baseText = `${comp.name}: ${comp.description}`;

            // Add semantic keywords based on component type
            let keywords = '';
            if (comp.type === 'data-table' || comp.type === 'table') {
                keywords = ' Keywords: view, display, show, get, fetch, retrieve, see, browse, list, table, grid, records, rows, data, information, dataset, collection';
            } else if (comp.type === 'form' && (comp.name.toLowerCase().includes('update') || comp.name.toLowerCase().includes('edit'))) {
                keywords = ' Keywords: update, edit, modify, change, revise, alter, correct';
            } else if (comp.type === 'form') {
                keywords = ' Keywords: create, add, insert, new, submit, input, fill, enter';
            } else if (comp.type === 'dashboard') {
                keywords = ' Keywords: analytics, metrics, overview, summary, insights, statistics, monitoring, kpi, performance';
            } else if (comp.type === 'chart' || comp.type === 'graph') {
                keywords = ' Keywords: visualize, plot, chart, graph, analyze, trends, visual';
            } else if (comp.type === 'page') {
                keywords = ' Keywords: details, view, information, profile, page';
            }

            return `${baseText}${keywords}`;
        });

        console.log(`Generating embeddings for ${components.length} components...`);
        const embeddings = await embeddingService.generateEmbeddings(documents);

        // Prepare data for ChromaDB
        const ids = components.map(comp => comp.id);
        const metadatas = components.map(comp => ({
            name: comp.name,
            type: comp.type,
            description: comp.description,
            props: JSON.stringify(comp.props || {}),
            componentData: JSON.stringify(comp)
        }));

        // Add to collection
        await collection.add({
            ids,
            embeddings,
            documents,
            metadatas
        });

        console.log(`✓ Added ${components.length} components to ChromaDB collection: ${collectionName}`);
        return { success: true, count: components.length };
    } catch (error) {
        console.error('Error adding components to ChromaDB:', error);
        throw error;
    }
};

const queryComponents = async (
    collectionName: string,
    queryText: string,
    nResults: number = 5
): Promise<Component[]> => {
    try {
        // Use getCollection instead of getOrCreateCollection to avoid the warning
        const collection = await chromaClient.getCollection({
            name: collectionName,
        });

        // Generate embedding for query
        console.log(`Generating embedding for query: "${queryText}"`);
        const queryEmbedding = await embeddingService.generateEmbedding(queryText);

        // Query the collection
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults
        });

        console.log("result of collection query", results);

        // Parse and return components
        const components: Component[] = [];
        if (results.metadatas && results.metadatas[0]) {
            for (const metadata of results.metadatas[0]) {
                if (metadata && metadata.componentData) {
                    try {
                        const component = JSON.parse(metadata.componentData as string);
                        components.push(component);
                    } catch (e) {
                        console.error('Error parsing component data:', e);
                    }
                }
            }
        }

        console.log(`✓ Found ${components.length} matching components`);
        return components;
    } catch (error) {
        console.error('Error querying components from ChromaDB:', error);
        throw error;
    }
};

const deleteCollection = async (collectionName: string) => {
    try {
        await chromaClient.deleteCollection({ name: collectionName });
        console.log(`✓ Deleted collection: ${collectionName}`);
    } catch (error) {
        console.error('Error deleting collection:', error);
        throw error;
    }
};

const CHROMACOLLECTION = {
    getOrCreateCollection,
    collectionExists,
    getCollectionCount,
    addComponents,
    queryComponents,
    deleteCollection
}

export default CHROMACOLLECTION;