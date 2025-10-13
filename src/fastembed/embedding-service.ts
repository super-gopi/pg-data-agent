import { EmbeddingModel, FlagEmbedding } from "fastembed";

class EmbeddingService {
  private embeddingModel: FlagEmbedding | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.embeddingModel) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        console.log('Initializing FastEmbed model...');
        this.embeddingModel = await FlagEmbedding.init({
          model: EmbeddingModel.BGEBaseEN
        });
        console.log('✓ FastEmbed model initialized');
      })();
    }

    await this.initPromise;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.init();

    if (!this.embeddingModel) {
      throw new Error('Embedding model not initialized');
    }

    const embeddings = this.embeddingModel.embed([text], 1);

    for await (const batch of embeddings) {
      // Return the first (and only) embedding from the batch
      return Array.from(batch[0]);
    }

    throw new Error('Failed to generate embedding');
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.init();

    if (!this.embeddingModel) {
      throw new Error('Embedding model not initialized');
    }

    const allEmbeddings: number[][] = [];
    const embeddings = this.embeddingModel.embed(texts, 256);

    for await (const batch of embeddings) {
      for (const embedding of batch) {
        allEmbeddings.push(Array.from(embedding));
      }
    }

    return allEmbeddings;
  }
}

// Export a singleton instance
const embeddingService = new EmbeddingService();
export default embeddingService;
