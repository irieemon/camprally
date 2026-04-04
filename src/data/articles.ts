import { articlesBatch1 } from "./articles-batch1";
import { articlesBatch2 } from "./articles-batch2";
export type { Article } from "./articles-batch1";

export const articles = [...articlesBatch1, ...articlesBatch2];
